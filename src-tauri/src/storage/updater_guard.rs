use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sea_query::{
    ColumnDef, Condition, Expr, Iden, Query, SqliteQueryBuilder, Table,
    TableCreateStatement,
};
use sea_query_binder::SqlxBinder;
use serde::Serialize;
use sha2::Sha256;
use sqlx::Row;

use super::db::{get_db, TableSpec};
use crate::shared::get_millis;

const FAIL_WINDOW_MS: i64 = 30_i64 * 24 * 60 * 60 * 1000;
const FAIL_THRESHOLD: i64 = 20;
const SUCCESS_RETENTION_MS: i64 = 180_i64 * 24 * 60 * 60 * 1000;

const KEYRING_SERVICE: &str = "figurex";
const KEYRING_USER: &str = "updater_guard_v1";
const MASTER_KEY_LEN: usize = 32;
const XNONCE_LEN: usize = 24;

#[derive(Iden)]
pub enum UpdaterGuardEvent {
    Table,
    Id,
    Success,
    Reason,
    CreatedAt,
    Sig,
}

pub struct UpdaterGuardEventTable;

impl TableSpec for UpdaterGuardEventTable {
    const NAME: &'static str = "updater_guard_events";
    const LATEST: i32 = 2;
    fn create_stmt() -> TableCreateStatement {
        Table::create()
            .table(UpdaterGuardEvent::Table)
            .if_not_exists()
            .col(
                ColumnDef::new(UpdaterGuardEvent::Id)
                    .integer()
                    .not_null()
                    .auto_increment()
                    .primary_key(),
            )
            .col(ColumnDef::new(UpdaterGuardEvent::Success).integer().not_null())
            .col(ColumnDef::new(UpdaterGuardEvent::Reason).text())
            .col(ColumnDef::new(UpdaterGuardEvent::CreatedAt).integer().not_null())
            .col(ColumnDef::new(UpdaterGuardEvent::Sig).text().not_null())
            .to_owned()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterGuardStatus {
    pub should_force_update: bool,
    pub effective_fail_count: i64,
    pub last_success_at_ms: Option<i64>,
}

type HmacSha256 = Hmac<Sha256>;

fn get_or_create_master_key() -> Result<[u8; MASTER_KEY_LEN]> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    if let Ok(encoded) = entry.get_password() {
        let decoded = B64
            .decode(encoded.as_bytes())
            .context("failed to decode updater guard key")?;
        if decoded.len() == MASTER_KEY_LEN {
            let mut key = [0_u8; MASTER_KEY_LEN];
            key.copy_from_slice(&decoded);
            return Ok(key);
        }
    }

    let mut key = [0_u8; MASTER_KEY_LEN];
    rand::rngs::OsRng.fill_bytes(&mut key);
    let encoded = B64.encode(key);
    entry
        .set_password(&encoded)
        .context("failed to persist updater guard key")?;
    Ok(key)
}

fn encrypt_reason(plain: &str) -> Result<String> {
    let key = get_or_create_master_key()?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));

    let mut nonce = [0_u8; XNONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plain.as_bytes())
        .context("failed to encrypt updater reason")?;

    let mut payload = Vec::with_capacity(XNONCE_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);
    Ok(B64.encode(payload))
}

fn sign_event(success: i64, created_at: i64, reason_cipher: Option<&str>) -> Result<String> {
    let key = get_or_create_master_key()?;
    let mut mac = <HmacSha256 as Mac>::new_from_slice(&key).context("invalid hmac key")?;
    mac.update(success.to_string().as_bytes());
    mac.update(b"|");
    mac.update(created_at.to_string().as_bytes());
    mac.update(b"|");
    mac.update(reason_cipher.unwrap_or("").as_bytes());
    Ok(B64.encode(mac.finalize().into_bytes()))
}

fn verify_event_sig(success: i64, created_at: i64, reason_cipher: Option<&str>, sig: &str) -> bool {
    let key = match get_or_create_master_key() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let sig_bytes = match B64.decode(sig.as_bytes()) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let mut mac = match <HmacSha256 as Mac>::new_from_slice(&key) {
        Ok(v) => v,
        Err(_) => return false,
    };
    mac.update(success.to_string().as_bytes());
    mac.update(b"|");
    mac.update(created_at.to_string().as_bytes());
    mac.update(b"|");
    mac.update(reason_cipher.unwrap_or("").as_bytes());
    mac.verify_slice(&sig_bytes).is_ok()
}

pub async fn init() -> Result<()> {
    UpdaterGuardEventTable::check_latest().await
}

async fn prune_expired() -> Result<()> {
    let pool = get_db().await?;
    let now = get_millis();
    let failure_cutoff = now - FAIL_WINDOW_MS;
    let success_cutoff = now - SUCCESS_RETENTION_MS;

    let (sql, values) = Query::delete()
        .from_table(UpdaterGuardEvent::Table)
        .cond_where(
            Condition::any()
                .add(
                    Expr::col(UpdaterGuardEvent::Success)
                        .eq(0)
                        .and(Expr::col(UpdaterGuardEvent::CreatedAt).lt(failure_cutoff)),
                )
                .add(
                    Expr::col(UpdaterGuardEvent::Success)
                        .eq(1)
                        .and(Expr::col(UpdaterGuardEvent::CreatedAt).lt(success_cutoff)),
                ),
        )
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

pub async fn record_success() -> Result<()> {
    let pool = get_db().await?;
    let now = get_millis();
    let sig = sign_event(1, now, None)?;

    let (insert_sql, insert_values) = Query::insert()
        .into_table(UpdaterGuardEvent::Table)
        .columns([
            UpdaterGuardEvent::Success,
            UpdaterGuardEvent::Reason,
            UpdaterGuardEvent::CreatedAt,
            UpdaterGuardEvent::Sig,
        ])
        .values([1.into(), Option::<String>::None.into(), now.into(), sig.into()])?
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&insert_sql, insert_values)
        .execute(&pool)
        .await?;

    let (clear_sql, clear_values) = Query::delete()
        .from_table(UpdaterGuardEvent::Table)
        .cond_where(Expr::col(UpdaterGuardEvent::Success).eq(0))
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&clear_sql, clear_values).execute(&pool).await?;

    prune_expired().await
}

pub async fn record_failure(reason: Option<String>) -> Result<()> {
    let pool = get_db().await?;
    let now = get_millis();
    let safe_reason = reason
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| if s.len() > 512 { s[..512].to_string() } else { s });

    let encrypted_reason = safe_reason
        .as_deref()
        .map(encrypt_reason)
        .transpose()?;
    let sig = sign_event(0, now, encrypted_reason.as_deref())?;

    let (sql, values) = Query::insert()
        .into_table(UpdaterGuardEvent::Table)
        .columns([
            UpdaterGuardEvent::Success,
            UpdaterGuardEvent::Reason,
            UpdaterGuardEvent::CreatedAt,
            UpdaterGuardEvent::Sig,
        ])
        .values([0.into(), encrypted_reason.into(), now.into(), sig.into()])?
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&sql, values).execute(&pool).await?;

    prune_expired().await
}

pub async fn reset_failures() -> Result<()> {
    let pool = get_db().await?;
    let (sql, values) = Query::delete()
        .from_table(UpdaterGuardEvent::Table)
        .cond_where(Expr::col(UpdaterGuardEvent::Success).eq(0))
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

pub async fn get_status() -> Result<UpdaterGuardStatus> {
    prune_expired().await?;
    let pool = get_db().await?;
    let now = get_millis();
    let cutoff = now - FAIL_WINDOW_MS;

    let (sql, values) = Query::select()
        .columns([
            UpdaterGuardEvent::Success,
            UpdaterGuardEvent::Reason,
            UpdaterGuardEvent::CreatedAt,
            UpdaterGuardEvent::Sig,
        ])
        .from(UpdaterGuardEvent::Table)
        .build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;
    let mut effective_fail_count = 0_i64;
    let mut last_success_at_ms: Option<i64> = None;

    for row in rows {
        let success: i64 = row.try_get("success")?;
        let reason: Option<String> = row.try_get("reason")?;
        let created_at: i64 = row.try_get("created_at")?;
        let sig: String = row.try_get("sig")?;

        if !verify_event_sig(success, created_at, reason.as_deref(), &sig) {
            continue;
        }

        if success == 0 && created_at >= cutoff {
            effective_fail_count += 1;
            continue;
        }

        if success == 1 {
            last_success_at_ms = match last_success_at_ms {
                Some(prev) if prev >= created_at => Some(prev),
                _ => Some(created_at),
            };
        }
    }

    Ok(UpdaterGuardStatus {
        should_force_update: effective_fail_count >= FAIL_THRESHOLD,
        effective_fail_count,
        last_success_at_ms,
    })
}

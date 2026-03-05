use anyhow::Result;
use sea_query::{
    ColumnDef, Condition, Expr, Iden, Order, Query, SqliteQueryBuilder, Table,
    TableCreateStatement,
};
use sea_query_binder::SqlxBinder;
use serde::Serialize;
use sqlx::Row;

use super::db::{get_db, TableSpec};
use crate::shared::get_millis;

const FAIL_WINDOW_MS: i64 = 30_i64 * 24 * 60 * 60 * 1000;
const FAIL_THRESHOLD: i64 = 20;
const SUCCESS_RETENTION_MS: i64 = 180_i64 * 24 * 60 * 60 * 1000;

#[derive(Iden)]
pub enum UpdaterGuardEvent {
    Table,
    Id,
    Success,
    Reason,
    CreatedAt,
}

pub struct UpdaterGuardEventTable;

impl TableSpec for UpdaterGuardEventTable {
    const NAME: &'static str = "updater_guard_events";
    const LATEST: i32 = 3;
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

    let (insert_sql, insert_values) = Query::insert()
        .into_table(UpdaterGuardEvent::Table)
        .columns([
            UpdaterGuardEvent::Success,
            UpdaterGuardEvent::Reason,
            UpdaterGuardEvent::CreatedAt,
        ])
        .values([1.into(), Option::<String>::None.into(), now.into()])?
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
        .map(|s| {
            if s.len() > 512 {
                s[..512].to_string()
            } else {
                s
            }
        });

    let (sql, values) = Query::insert()
        .into_table(UpdaterGuardEvent::Table)
        .columns([
            UpdaterGuardEvent::Success,
            UpdaterGuardEvent::Reason,
            UpdaterGuardEvent::CreatedAt,
        ])
        .values([0.into(), safe_reason.into(), now.into()])?
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

    let (count_sql, count_values) = Query::select()
        .expr(Expr::col(UpdaterGuardEvent::Id).count())
        .from(UpdaterGuardEvent::Table)
        .cond_where(
            Expr::col(UpdaterGuardEvent::Success)
                .eq(0)
                .and(Expr::col(UpdaterGuardEvent::CreatedAt).gte(cutoff)),
        )
        .build_sqlx(SqliteQueryBuilder);
    let count_row = sqlx::query_with(&count_sql, count_values)
        .fetch_one(&pool)
        .await?;
    let effective_fail_count: i64 = count_row.try_get(0)?;

    let (success_sql, success_values) = Query::select()
        .column(UpdaterGuardEvent::CreatedAt)
        .from(UpdaterGuardEvent::Table)
        .cond_where(Expr::col(UpdaterGuardEvent::Success).eq(1))
        .order_by(UpdaterGuardEvent::CreatedAt, Order::Desc)
        .limit(1)
        .build_sqlx(SqliteQueryBuilder);
    let last_success_at_ms = sqlx::query_with(&success_sql, success_values)
        .fetch_optional(&pool)
        .await?
        .and_then(|row| row.try_get::<i64, _>("created_at").ok());

    Ok(UpdaterGuardStatus {
        should_force_update: effective_fail_count >= FAIL_THRESHOLD,
        effective_fail_count,
        last_success_at_ms,
    })
}

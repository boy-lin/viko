use super::db::{get_db, TableSpec};
use anyhow::Result;
use sea_query::{ColumnDef, Expr, Iden, Query, SqliteQueryBuilder, Table, TableCreateStatement};
use sea_query_binder::SqlxBinder;
use sqlx::Row;
use crate::shared::get_millis;

#[derive(Iden)]
pub enum UsageGate {
    Table,
    Id,
    DayKey,
    IdentityScope,
    IdentityKey,
    Feature,
    TaskId,
    TaskType,
    MediaKind,
    CreatedAt,
}

pub struct UsageGateTable;

impl TableSpec for UsageGateTable {
    const NAME: &'static str = "usage_gate";
    const LATEST: i32 = 1;

    fn create_stmt() -> TableCreateStatement {
        Table::create()
            .table(UsageGate::Table)
            .if_not_exists()
            .col(
                ColumnDef::new(UsageGate::Id)
                    .integer()
                    .not_null()
                    .primary_key()
                    .auto_increment(),
            )
            .col(ColumnDef::new(UsageGate::DayKey).string().not_null())
            .col(ColumnDef::new(UsageGate::IdentityScope).string().not_null())
            .col(ColumnDef::new(UsageGate::IdentityKey).string().not_null())
            .col(ColumnDef::new(UsageGate::Feature).string().not_null())
            .col(ColumnDef::new(UsageGate::TaskId).string().not_null())
            .col(ColumnDef::new(UsageGate::TaskType).string().not_null())
            .col(ColumnDef::new(UsageGate::MediaKind).string().not_null())
            .col(ColumnDef::new(UsageGate::CreatedAt).integer().not_null())
            .to_owned()
    }
}

pub async fn init() -> Result<()> {
    UsageGateTable::check_latest().await
}

pub fn current_day_key() -> String {
    const DAY_MS: i64 = 24 * 60 * 60 * 1000;
    (get_millis() / DAY_MS).to_string()
}

pub async fn count_today(identity_key: &str, feature: &str, day_key: &str) -> Result<u64> {
    let (sql, values) = Query::select()
        .expr(Expr::col(UsageGate::Id).count())
        .from(UsageGate::Table)
        .cond_where(Expr::col(UsageGate::IdentityKey).eq(identity_key))
        .cond_where(Expr::col(UsageGate::Feature).eq(feature))
        .cond_where(Expr::col(UsageGate::DayKey).eq(day_key))
        .build_sqlx(SqliteQueryBuilder);

    let pool = get_db().await?;
    let row = sqlx::query_with(&sql, values).fetch_one(&pool).await?;
    Ok(row.try_get::<i64, _>(0).unwrap_or_default().max(0) as u64)
}

pub async fn record_submit(
    day_key: &str,
    identity_scope: &str,
    identity_key: &str,
    feature: &str,
    task_id: &str,
    task_type: &str,
    media_kind: &str,
    created_at: i64,
) -> Result<()> {
    let (sql, values) = Query::insert()
        .into_table(UsageGate::Table)
        .columns([
            UsageGate::DayKey,
            UsageGate::IdentityScope,
            UsageGate::IdentityKey,
            UsageGate::Feature,
            UsageGate::TaskId,
            UsageGate::TaskType,
            UsageGate::MediaKind,
            UsageGate::CreatedAt,
        ])
        .values([
            day_key.into(),
            identity_scope.into(),
            identity_key.into(),
            feature.into(),
            task_id.into(),
            task_type.into(),
            media_kind.into(),
            created_at.into(),
        ])?
        .build_sqlx(SqliteQueryBuilder);

    let pool = get_db().await?;
    sqlx::query_with(&sql, values).execute(&pool).await?;
    prune_old_records().await?;
    Ok(())
}

pub async fn prune_old_records() -> Result<()> {
    let cutoff = get_millis() - 90 * 24 * 60 * 60 * 1000;
    let (sql, values) = Query::delete()
        .from_table(UsageGate::Table)
        .cond_where(Expr::col(UsageGate::CreatedAt).lt(cutoff))
        .build_sqlx(SqliteQueryBuilder);
    let pool = get_db().await?;
    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

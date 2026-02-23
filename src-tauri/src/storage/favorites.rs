use anyhow::Result;
use sea_query::{
    ColumnDef, Expr, Iden, OnConflict, Query, SqliteQueryBuilder, Table, TableCreateStatement,
};
use sea_query_binder::SqlxBinder;

use super::db::{get_db, TableSpec};
use crate::shared::get_millis;

#[derive(Iden)]
pub enum TaskFavorite {
    Table,
    Id,
    CreatedAt,
}

pub struct TaskFavoriteTable;

impl TableSpec for TaskFavoriteTable {
    const NAME: &'static str = "task_favorites";
    const LATEST: i32 = 1;
    fn create_stmt() -> TableCreateStatement {
        Table::create()
            .table(TaskFavorite::Table)
            .col(
                ColumnDef::new(TaskFavorite::Id)
                    .string()
                    .not_null()
                    .primary_key(),
            )
            .col(ColumnDef::new(TaskFavorite::CreatedAt).integer().not_null())
            .to_owned()
    }
}

pub async fn set_favorite(id: &str, favorite: bool) -> Result<()> {
    let pool = get_db().await?;
    if favorite {
        let (sql, values) = Query::insert()
            .into_table(TaskFavorite::Table)
            .columns([TaskFavorite::Id, TaskFavorite::CreatedAt])
            .values([id.into(), get_millis().into()])?
            .on_conflict(
                OnConflict::column(TaskFavorite::Id)
                    .update_columns([TaskFavorite::CreatedAt])
                    .to_owned(),
            )
            .build_sqlx(SqliteQueryBuilder);

        sqlx::query_with(&sql, values).execute(&pool).await?;
    } else {
        remove_favorite(id).await?;
    }
    Ok(())
}

pub async fn remove_favorite(id: &str) -> Result<()> {
    let pool = get_db().await?;
    let (sql, values) = Query::delete()
        .from_table(TaskFavorite::Table)
        .and_where(Expr::col(TaskFavorite::Id).eq(id))
        .build_sqlx(SqliteQueryBuilder);
    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

pub async fn cleanup_orphans() -> Result<()> {
    let pool = get_db().await?;
    sqlx::query("DELETE FROM task_favorites WHERE id NOT IN (SELECT id FROM task_history);")
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn init() -> Result<()> {
    TaskFavoriteTable::check_latest().await
}

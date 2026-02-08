use anyhow::Result;
use sea_query::{
    ColumnDef, Expr, Iden, Order, Query, SqliteQueryBuilder, Table,
    TableCreateStatement,
};
use sea_query_binder::SqlxBinder;
use sqlx::Row;
use crate::task::queue::MediaTaskRequest;
use crate::shared::get_millis;
use super::db::{get_db, TableSpec};

#[derive(Iden)]
pub enum MediaQueue {
    Table,
    Id,
    TaskData,
    CreatedAt,
}

pub struct MediaQueueTable;

impl TableSpec for MediaQueueTable {
    const NAME: &'static str = "media_queue";
    const LATEST: i32 = 1;
    fn create_stmt() -> TableCreateStatement {
        Table::create()
            .table(MediaQueue::Table)
            .col(ColumnDef::new(MediaQueue::Id).integer().not_null().auto_increment().primary_key())
            .col(ColumnDef::new(MediaQueue::TaskData).text().not_null())
            .col(ColumnDef::new(MediaQueue::CreatedAt).integer().not_null())
            .to_owned()
    }
}

pub async fn enqueue(task: &MediaTaskRequest) -> Result<()> {
    let pool = get_db().await?;
    let now = get_millis();
    let data = serde_json::to_string(task)?;

    let (sql, values) = Query::insert()
        .into_table(MediaQueue::Table)
        .columns([MediaQueue::TaskData, MediaQueue::CreatedAt])
        .values([data.into(), now.into()])?
        .build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

pub async fn dequeue() -> Result<Option<MediaTaskRequest>> {
    let pool = get_db().await?;
    
    // Find the oldest task
    let (sql, values) = Query::select()
        .columns([MediaQueue::Id, MediaQueue::TaskData])
        .from(MediaQueue::Table)
        .order_by(MediaQueue::Id, Order::Asc)
        .limit(1)
        .build_sqlx(SqliteQueryBuilder);

    let row = sqlx::query_with(&sql, values).fetch_optional(&pool).await?;

    if let Some(row) = row {
        let id: i64 = row.try_get("id")?;
        let data: String = row.try_get("task_data")?;
        let task: MediaTaskRequest = serde_json::from_str(&data)?;

        // Delete it
        let (del_sql, del_values) = Query::delete()
            .from_table(MediaQueue::Table)
            .and_where(Expr::col(MediaQueue::Id).eq(id))
            .build_sqlx(SqliteQueryBuilder);
            
        sqlx::query_with(&del_sql, del_values).execute(&pool).await?;
        
        Ok(Some(task))
    } else {
        Ok(None)
    }
}

pub async fn peek_all() -> Result<Vec<MediaTaskRequest>> {
    let pool = get_db().await?;
    let (sql, values) = Query::select()
        .column(MediaQueue::TaskData)
        .from(MediaQueue::Table)
        .order_by(MediaQueue::Id, Order::Asc)
        .build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;
    let mut tasks = Vec::new();
    for row in rows {
        let data: String = row.try_get("task_data")?;
        tasks.push(serde_json::from_str(&data)?);
    }
    Ok(tasks)
}

pub async fn count() -> Result<usize> {
    let pool = get_db().await?;
    let (sql, values) = Query::select()
        .expr(Expr::col(MediaQueue::Id).count())
        .from(MediaQueue::Table)
        .build_sqlx(SqliteQueryBuilder);

    let row = sqlx::query_with(&sql, values).fetch_one(&pool).await?;
    let count: i64 = row.try_get(0)?;
    Ok(count as usize)
}

pub async fn init() -> Result<()> {
    MediaQueueTable::check_latest().await
}

pub async fn clear() -> Result<()> {
    let pool = get_db().await?;
    let (sql, values) = Query::delete()
        .from_table(MediaQueue::Table)
        .build_sqlx(SqliteQueryBuilder);
    
    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

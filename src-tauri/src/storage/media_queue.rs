use super::db::{get_db, TableSpec};
use crate::shared::get_millis;
use crate::task::queue::MediaTaskRequest;
use anyhow::Result;
use sea_query::{
    ColumnDef, Expr, Iden, Order, Query, SqliteQueryBuilder, Table, TableCreateStatement,
};
use sea_query_binder::SqlxBinder;
use sqlx::Row;

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
            .col(
                ColumnDef::new(MediaQueue::Id)
                    .integer()
                    .not_null()
                    .auto_increment()
                    .primary_key(),
            )
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

        sqlx::query_with(&del_sql, del_values)
            .execute(&pool)
            .await?;

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

fn task_kind(task: &MediaTaskRequest) -> &'static str {
    match task {
        MediaTaskRequest::ConvertAudio(_) => "convert-audio",
        MediaTaskRequest::ConvertVideo(_) => "convert-video",
        MediaTaskRequest::ConvertGif(_) => "convert-gif",
        MediaTaskRequest::ConvertImage(_) => "convert-image",
        MediaTaskRequest::CompressVideo(_) => "compress-video",
        MediaTaskRequest::CompressAudio(_) => "compress-audio",
        MediaTaskRequest::CompressImage(_) => "compress-image",
        MediaTaskRequest::Watermark(_) => "watermark",
        MediaTaskRequest::ConvertDenoise(_) => "convert-denoise",
    }
}

fn task_id(task: &MediaTaskRequest) -> Option<&str> {
    match task {
        MediaTaskRequest::ConvertAudio(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::ConvertVideo(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::ConvertGif(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::ConvertImage(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::CompressVideo(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::CompressAudio(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::CompressImage(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::Watermark(args) => Some(args.task_id.as_str()),
        MediaTaskRequest::ConvertDenoise(args) => Some(args.task_id.as_str()),
    }
}

pub async fn count_by_type(task_type: &str) -> Result<usize> {
    let pool = get_db().await?;
    let (sql, values) = Query::select()
        .columns([MediaQueue::TaskData])
        .from(MediaQueue::Table)
        .order_by(MediaQueue::Id, Order::Asc)
        .build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;
    let mut count = 0;
    for row in rows {
        let data: String = row.try_get("task_data")?;
        let task: MediaTaskRequest = serde_json::from_str(&data)?;
        if task_kind(&task) == task_type {
            count += 1;
        }
    }
    Ok(count)
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

pub async fn clear_by_type(task_type: &str) -> Result<usize> {
    let pool = get_db().await?;
    let (sql, values) = Query::select()
        .columns([MediaQueue::Id, MediaQueue::TaskData])
        .from(MediaQueue::Table)
        .order_by(MediaQueue::Id, Order::Asc)
        .build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;
    let mut ids = Vec::new();
    for row in rows {
        let id: i64 = row.try_get("id")?;
        let data: String = row.try_get("task_data")?;
        let task: MediaTaskRequest = serde_json::from_str(&data)?;
        if task_kind(&task) == task_type {
            ids.push(id);
        }
    }

    if ids.is_empty() {
        return Ok(0);
    }

    let (del_sql, del_values) = Query::delete()
        .from_table(MediaQueue::Table)
        .and_where(Expr::col(MediaQueue::Id).is_in(ids.clone()))
        .build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&del_sql, del_values)
        .execute(&pool)
        .await?;
    Ok(ids.len())
}

pub async fn remove_by_task_id(target_task_id: &str) -> Result<usize> {
    let pool = get_db().await?;
    let (sql, values) = Query::select()
        .columns([MediaQueue::Id, MediaQueue::TaskData])
        .from(MediaQueue::Table)
        .order_by(MediaQueue::Id, Order::Asc)
        .build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;
    let mut ids = Vec::new();
    for row in rows {
        let id: i64 = row.try_get("id")?;
        let data: String = row.try_get("task_data")?;
        let task: MediaTaskRequest = serde_json::from_str(&data)?;
        if task_id(&task) == Some(target_task_id) {
            ids.push(id);
        }
    }

    if ids.is_empty() {
        return Ok(0);
    }

    let (del_sql, del_values) = Query::delete()
        .from_table(MediaQueue::Table)
        .and_where(Expr::col(MediaQueue::Id).is_in(ids.clone()))
        .build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&del_sql, del_values)
        .execute(&pool)
        .await?;
    Ok(ids.len())
}

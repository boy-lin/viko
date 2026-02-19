use super::db::{get_db, TableSpec};
use super::favorites::TaskFavorite;
use anyhow::Result;
use sea_query::{
    Alias, ColumnDef, Expr, Iden, OnConflict, Order, Query, SqliteQueryBuilder, Table,
    TableCreateStatement,
};
use sea_query_binder::SqlxBinder;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Iden)]
pub enum TaskHistory {
    Table,
    Id,
    TaskType,
    MediaType,
    Status,
    InputPath,
    OutputPath,
    OutputSize,
    OutputDuration,
    Duration,
    Title,
    Thumbnail,
    CreatedAt,
    FinishedAt,
    ErrorMessage,
    TaskData,
    EffectiveParams,
}

pub struct TaskHistoryTable;

impl TableSpec for TaskHistoryTable {
    const NAME: &'static str = "task_history";
    const LATEST: i32 = 3;
    fn create_stmt() -> TableCreateStatement {
        Table::create()
            .table(TaskHistory::Table)
            .col(
                ColumnDef::new(TaskHistory::Id)
                    .string()
                    .not_null()
                    .primary_key(),
            )
            .col(ColumnDef::new(TaskHistory::TaskType).string().not_null())
            .col(ColumnDef::new(TaskHistory::MediaType).string().not_null())
            .col(ColumnDef::new(TaskHistory::Status).string().not_null())
            .col(ColumnDef::new(TaskHistory::InputPath).string().not_null())
            .col(ColumnDef::new(TaskHistory::OutputPath).string())
            .col(ColumnDef::new(TaskHistory::OutputSize).integer())
            .col(ColumnDef::new(TaskHistory::OutputDuration).string())
            .col(ColumnDef::new(TaskHistory::Duration).integer())
            .col(ColumnDef::new(TaskHistory::Title).string())
            .col(ColumnDef::new(TaskHistory::Thumbnail).string())
            .col(ColumnDef::new(TaskHistory::CreatedAt).integer().not_null())
            .col(ColumnDef::new(TaskHistory::FinishedAt).integer().not_null())
            .col(ColumnDef::new(TaskHistory::ErrorMessage).string())
            .col(ColumnDef::new(TaskHistory::TaskData).text().not_null())
            .col(ColumnDef::new(TaskHistory::EffectiveParams).text())
            .to_owned()
    }

    fn check_latest() -> impl std::future::Future<Output = Result<()>> {
        async {
            super::db::init_meta().await?;
            let pool = get_db().await?;
            let cur = super::db::get_version(Self::NAME).await?;
            if cur < 2 {
                let sql = "ALTER TABLE task_history ADD COLUMN effective_params TEXT";
                sqlx::query(sql).execute(&pool).await.ok();
            }
            if cur < 3 {
                let sql = "ALTER TABLE task_history ADD COLUMN output_duration TEXT";
                sqlx::query(sql).execute(&pool).await.ok();
            }
            super::db::set_version(Self::NAME, Self::LATEST).await?;
            Ok(())
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskHistoryItem {
    pub id: String,
    pub task_type: String,
    pub media_type: String,
    pub status: String,
    pub input_path: String,
    pub output_path: Option<String>,
    pub output_size: Option<i64>,
    pub output_duration: Option<String>,
    #[serde(skip_serializing)]
    pub duration: Option<i64>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub created_at: i64,
    pub finished_at: i64,
    pub error_message: Option<String>,
    #[serde(skip_serializing)]
    pub task_data: String,
    #[serde(skip_serializing)]
    pub effective_params: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MyFileItem {
    pub id: String,
    pub task_type: String,
    pub media_type: String,
    pub status: String,
    pub input_path: String,
    pub output_path: Option<String>,
    pub output_size: Option<i64>,
    pub output_duration: Option<String>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub created_at: i64,
    pub finished_at: i64,
    pub error_message: Option<String>,
    #[serde(skip_serializing)]
    pub task_data: String,
    #[serde(skip_serializing)]
    pub effective_params: Option<String>,
    pub is_favorite: bool,
}

pub async fn add_history(item: &TaskHistoryItem) -> Result<()> {
    let pool = get_db().await?;

    let (sql, values) = Query::insert()
        .into_table(TaskHistory::Table)
        .columns([
            TaskHistory::Id,
            TaskHistory::TaskType,
            TaskHistory::MediaType,
            TaskHistory::Status,
            TaskHistory::InputPath,
            TaskHistory::OutputPath,
            TaskHistory::OutputSize,
            TaskHistory::OutputDuration,
            TaskHistory::Duration,
            TaskHistory::Title,
            TaskHistory::Thumbnail,
            TaskHistory::CreatedAt,
            TaskHistory::FinishedAt,
            TaskHistory::ErrorMessage,
            TaskHistory::TaskData,
            TaskHistory::EffectiveParams,
        ])
        .values([
            item.id.clone().into(),
            item.task_type.clone().into(),
            item.media_type.clone().into(),
            item.status.clone().into(),
            item.input_path.clone().into(),
            item.output_path.clone().into(),
            item.output_size.into(),
            item.output_duration.clone().into(),
            item.duration.into(),
            item.title.clone().into(),
            item.thumbnail.clone().into(),
            item.created_at.into(),
            item.finished_at.into(),
            item.error_message.clone().into(),
            item.task_data.clone().into(),
            item.effective_params.clone().into(),
        ])?
        .on_conflict(
            OnConflict::column(TaskHistory::Id)
                .update_columns([
                    TaskHistory::TaskType,
                    TaskHistory::MediaType,
                    TaskHistory::Status,
                    TaskHistory::InputPath,
                    TaskHistory::OutputPath,
                    TaskHistory::OutputSize,
                    TaskHistory::OutputDuration,
                    TaskHistory::Duration,
                    TaskHistory::Title,
                    TaskHistory::Thumbnail,
                    TaskHistory::CreatedAt,
                    TaskHistory::FinishedAt,
                    TaskHistory::ErrorMessage,
                    TaskHistory::TaskData,
                    TaskHistory::EffectiveParams,
                ])
                .to_owned(),
        )
        .build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&sql, values).execute(&pool).await?;
    Ok(())
}

pub async fn get_history(
    limit: usize,
    offset: usize,
    task_type: Option<String>,
    keyword: Option<String>,
) -> Result<Vec<TaskHistoryItem>> {
    let pool = get_db().await?;

    let mut query = Query::select();
    query
        .columns([
            TaskHistory::Id,
            TaskHistory::TaskType,
            TaskHistory::MediaType,
            TaskHistory::Status,
            TaskHistory::InputPath,
            TaskHistory::OutputPath,
            TaskHistory::OutputSize,
            TaskHistory::OutputDuration,
            TaskHistory::Title,
            TaskHistory::Thumbnail,
            TaskHistory::CreatedAt,
            TaskHistory::FinishedAt,
            TaskHistory::ErrorMessage,
        ])
        .from(TaskHistory::Table)
        .order_by(TaskHistory::FinishedAt, Order::Desc)
        .limit(limit as u64)
        .offset(offset as u64);

    if let Some(t_type) = task_type {
        query.and_where(Expr::col(TaskHistory::TaskType).eq(t_type));
    }

    if let Some(raw) = keyword {
        let keyword = raw.trim().to_string();
        if !keyword.is_empty() {
            let pattern = format!("%{}%", keyword);
            query.and_where(
                Expr::col(TaskHistory::Title)
                    .like(&pattern)
                    .or(Expr::col(TaskHistory::InputPath).like(&pattern))
                    .or(Expr::col(TaskHistory::OutputPath).like(&pattern)),
            );
        }
    }

    let (sql, values) = query.build_sqlx(SqliteQueryBuilder);

    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;

    let mut items = Vec::new();
    for row in rows {
        items.push(TaskHistoryItem {
            id: row.try_get("id")?,
            task_type: row.try_get("task_type")?,
            media_type: row.try_get("media_type")?,
            status: row.try_get("status")?,
            input_path: row.try_get("input_path")?,
            output_path: row.try_get("output_path")?,
            output_size: row.try_get("output_size")?,
            output_duration: row.try_get("output_duration")?,
            duration: None,
            title: row.try_get("title")?,
            thumbnail: row.try_get("thumbnail")?,
            created_at: row.try_get("created_at")?,
            finished_at: row.try_get("finished_at")?,
            error_message: row.try_get("error_message")?,
            task_data: String::new(),
            effective_params: None,
        });
    }

    Ok(items)
}

pub async fn get_my_files(
    limit: usize,
    offset: usize,
    keyword: Option<String>,
) -> Result<Vec<MyFileItem>> {
    let pool = get_db().await?;

    let mut query = Query::select();
    query
        .columns([
            (TaskHistory::Table, TaskHistory::Id),
            (TaskHistory::Table, TaskHistory::TaskType),
            (TaskHistory::Table, TaskHistory::MediaType),
            (TaskHistory::Table, TaskHistory::Status),
            (TaskHistory::Table, TaskHistory::InputPath),
            (TaskHistory::Table, TaskHistory::OutputPath),
            (TaskHistory::Table, TaskHistory::OutputSize),
            (TaskHistory::Table, TaskHistory::OutputDuration),
            (TaskHistory::Table, TaskHistory::Title),
            (TaskHistory::Table, TaskHistory::Thumbnail),
            (TaskHistory::Table, TaskHistory::CreatedAt),
            (TaskHistory::Table, TaskHistory::FinishedAt),
            (TaskHistory::Table, TaskHistory::ErrorMessage),
        ])
        .expr_as(
            Expr::col((TaskFavorite::Table, TaskFavorite::Id)),
            Alias::new("favorite_id"),
        )
        .from(TaskHistory::Table)
        .left_join(
            TaskFavorite::Table,
            Expr::col((TaskFavorite::Table, TaskFavorite::Id))
                .equals((TaskHistory::Table, TaskHistory::Id)),
        )
        .order_by((TaskHistory::Table, TaskHistory::CreatedAt), Order::Desc)
        .limit(limit as u64)
        .offset(offset as u64);

    if let Some(raw) = keyword {
        let keyword = raw.trim().to_string();
        if !keyword.is_empty() {
            let pattern = format!("%{}%", keyword);
            query.and_where(
                Expr::col((TaskHistory::Table, TaskHistory::Title))
                    .like(&pattern)
                    .or(Expr::col((TaskHistory::Table, TaskHistory::InputPath)).like(&pattern))
                    .or(Expr::col((TaskHistory::Table, TaskHistory::OutputPath)).like(&pattern)),
            );
        }
    }

    let (sql, values) = query.build_sqlx(SqliteQueryBuilder);
    let rows = sqlx::query_with(&sql, values).fetch_all(&pool).await?;

    let mut items = Vec::new();
    for row in rows {
        let favorite_id: Option<String> = row.try_get("favorite_id")?;
        items.push(MyFileItem {
            id: row.try_get("id")?,
            task_type: row.try_get("task_type")?,
            media_type: row.try_get("media_type")?,
            status: row.try_get("status")?,
            input_path: row.try_get("input_path")?,
            output_path: row.try_get("output_path")?,
            output_size: row.try_get("output_size")?,
            output_duration: row.try_get("output_duration")?,
            title: row.try_get("title")?,
            thumbnail: row.try_get("thumbnail")?,
            created_at: row.try_get("created_at")?,
            finished_at: row.try_get("finished_at")?,
            error_message: row.try_get("error_message")?,
            task_data: String::new(),
            effective_params: None,
            is_favorite: favorite_id.is_some(),
        });
    }

    Ok(items)
}

pub async fn delete_history(id: &str) -> Result<()> {
    let pool = get_db().await?;
    let (sql, values) = Query::delete()
        .from_table(TaskHistory::Table)
        .and_where(Expr::col(TaskHistory::Id).eq(id))
        .build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&sql, values).execute(&pool).await?;
    crate::storage::favorites::remove_favorite(id).await.ok();
    Ok(())
}

pub async fn clear_history(task_type: Option<String>) -> Result<()> {
    let pool = get_db().await?;
    let mut query = Query::delete();
    query.from_table(TaskHistory::Table);

    if let Some(t_type) = task_type {
        query.and_where(Expr::col(TaskHistory::TaskType).eq(t_type));
    }

    let (sql, values) = query.build_sqlx(SqliteQueryBuilder);

    sqlx::query_with(&sql, values).execute(&pool).await?;
    crate::storage::favorites::cleanup_orphans().await.ok();
    Ok(())
}

pub async fn init() -> Result<()> {
    TaskHistoryTable::check_latest().await
}

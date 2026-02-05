use std::path::PathBuf;
use std::sync::LazyLock;
use std::str::FromStr;

pub static WORKING_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
});

pub static STORAGE_PATH: LazyLock<PathBuf> = LazyLock::new(|| {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("figurex");
    if !path.exists() {
        std::fs::create_dir_all(&path).ok();
    }
    path.push("figurex.db");
    path
});

pub static DATABASE_URL: LazyLock<String> = LazyLock::new(|| {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        return url;
    }
    let path = STORAGE_PATH.clone();
    format!("sqlite://{}", path.to_string_lossy())
});

pub fn get_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

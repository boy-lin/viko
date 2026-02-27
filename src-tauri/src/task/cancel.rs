use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

static CANCEL_ALL: AtomicBool = AtomicBool::new(false);
static CANCELLED_TASKS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

thread_local! {
    static CURRENT_TASK_ID: RefCell<Option<String>> = const { RefCell::new(None) };
}

pub fn request_cancel() {
    CANCEL_ALL.store(true, Ordering::SeqCst);
}

pub fn request_cancel_task(task_id: &str) {
    if let Ok(mut tasks) = CANCELLED_TASKS.lock() {
        tasks.insert(task_id.to_string());
    }
}

pub fn clear_cancel_task(task_id: &str) {
    if let Ok(mut tasks) = CANCELLED_TASKS.lock() {
        tasks.remove(task_id);
    }
}

pub fn reset_cancel() {
    CANCEL_ALL.store(false, Ordering::SeqCst);
    if let Ok(mut tasks) = CANCELLED_TASKS.lock() {
        tasks.clear();
    }
}

pub fn set_current_task(task_id: Option<String>) {
    CURRENT_TASK_ID.with(|current| {
        *current.borrow_mut() = task_id;
    });
}

pub fn clear_current_task() {
    CURRENT_TASK_ID.with(|current| {
        *current.borrow_mut() = None;
    });
}

pub fn is_cancelled() -> bool {
    if CANCEL_ALL.load(Ordering::SeqCst) {
        return true;
    }

    let current_task_id = CURRENT_TASK_ID.with(|current| current.borrow().clone());
    let Some(task_id) = current_task_id else {
        return false;
    };

    CANCELLED_TASKS
        .lock()
        .map(|tasks| tasks.contains(&task_id))
        .unwrap_or(false)
}

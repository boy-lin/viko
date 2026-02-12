use std::sync::atomic::{AtomicBool, Ordering};

static CANCEL_CURRENT: AtomicBool = AtomicBool::new(false);

pub fn request_cancel() {
    CANCEL_CURRENT.store(true, Ordering::SeqCst);
}

pub fn reset_cancel() {
    CANCEL_CURRENT.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    CANCEL_CURRENT.load(Ordering::SeqCst)
}

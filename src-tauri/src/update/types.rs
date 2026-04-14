use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub is_update_available: bool,
    pub notes: String,
    pub release_url: String,
    /// RFC3339 timestamp of when the check completed.
    pub checked_at: String,
    pub from_cache: bool,
}

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum UpdateError {
    #[error("network error: {0}")]
    Network(String),
    #[error("rate limited by GitHub")]
    RateLimited,
    #[error("no releases found")]
    NotFound,
    #[error("parse error: {0}")]
    Parse(String),
    #[error("store error: {0}")]
    Store(String),
}

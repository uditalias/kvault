pub mod github;
pub mod types;

pub use github::GithubUpdateService;
pub use types::{UpdateError, UpdateInfo};

/// Abstraction over update sources. v1 is backed by GitHub releases; later
/// implementations (e.g. `tauri-plugin-updater`) can swap in transparently.
#[async_trait::async_trait]
pub trait UpdateService: Send + Sync {
    async fn check(&self, current_version: &str) -> Result<UpdateInfo, UpdateError>;
}

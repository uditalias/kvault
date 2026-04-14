use super::types::{UpdateError, UpdateInfo};
use super::UpdateService;
use chrono::Utc;
use semver::Version;
use serde::Deserialize;
use std::time::Duration;

const REPO_OWNER: &str = "uditalias";
const REPO_NAME: &str = "kvault";
const TIMEOUT_SECS: u64 = 10;
const MAX_NOTES_BYTES: usize = 16 * 1024;

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    body: String,
}

pub struct GithubUpdateService {
    client: reqwest::Client,
}

impl GithubUpdateService {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(TIMEOUT_SECS))
            .user_agent(concat!("KVault/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client builds with valid defaults");
        Self { client }
    }
}

impl Default for GithubUpdateService {
    fn default() -> Self {
        Self::new()
    }
}

fn strip_v(s: &str) -> &str {
    s.strip_prefix('v').unwrap_or(s)
}

fn truncate_notes(body: String) -> String {
    if body.len() <= MAX_NOTES_BYTES {
        return body;
    }
    // Find the largest char boundary <= MAX_NOTES_BYTES so we don't split a UTF-8 sequence.
    let mut end = MAX_NOTES_BYTES;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    let mut truncated = String::with_capacity(end + 16);
    truncated.push_str(&body[..end]);
    truncated.push_str("\n\n…(truncated)");
    truncated
}

#[async_trait::async_trait]
impl UpdateService for GithubUpdateService {
    async fn check(&self, current_version: &str) -> Result<UpdateInfo, UpdateError> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/releases/latest",
            REPO_OWNER, REPO_NAME
        );

        let resp = self
            .client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| UpdateError::Network(e.to_string()))?;

        match resp.status().as_u16() {
            200 => {}
            403 => return Err(UpdateError::RateLimited),
            404 => return Err(UpdateError::NotFound),
            s => return Err(UpdateError::Network(format!("HTTP {s}"))),
        }

        let release: GhRelease = resp
            .json()
            .await
            .map_err(|e| UpdateError::Parse(e.to_string()))?;

        let latest_raw = strip_v(&release.tag_name).to_string();
        // Semver pre-release ordering is intentional: stable users should NOT be prompted
        // to "upgrade" to a pre-release of the same version. e.g. `0.0.3-beta.1 > 0.0.3`
        // is false under semver, which is the behavior we want.
        let is_update_available = match (
            Version::parse(current_version),
            Version::parse(&latest_raw),
        ) {
            (Ok(current), Ok(latest)) => latest > current,
            (Err(e), _) => {
                eprintln!(
                    "update-check: failed to parse version '{s}': {e}",
                    s = current_version
                );
                false
            }
            (_, Err(e)) => {
                eprintln!(
                    "update-check: failed to parse version '{s}': {e}",
                    s = latest_raw
                );
                false
            }
        };

        Ok(UpdateInfo {
            current_version: current_version.to_string(),
            latest_version: latest_raw,
            is_update_available,
            notes: truncate_notes(release.body),
            release_url: release.html_url,
            checked_at: Utc::now().to_rfc3339(),
            from_cache: false,
        })
    }
}

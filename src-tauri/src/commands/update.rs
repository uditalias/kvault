use crate::update::{GithubUpdateService, UpdateError, UpdateInfo, UpdateService};
use chrono::{DateTime, Duration, Utc};
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "update-check.json";
const K_LAST_CHECKED: &str = "lastCheckedAt";
const K_LAST_KNOWN: &str = "lastKnown";
const K_DISMISSED: &str = "dismissedVersion";
const THROTTLE_HOURS: i64 = 6;

fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub async fn check_for_updates<R: Runtime>(
    app: AppHandle<R>,
    force: bool,
) -> Result<UpdateInfo, UpdateError> {
    let store = app
        .store(STORE_PATH)
        .map_err(|e| UpdateError::Store(e.to_string()))?;

    // Throttle is best-effort: concurrent calls may race and both hit the network. Acceptable for user-triggered checks (low call rate).
    // Throttle: if not forced and we have a recent cached result, return it.
    if !force {
        let last_ts = store
            .get(K_LAST_CHECKED)
            .and_then(|v| v.as_str().map(|s| s.to_string()));
        let known = store.get(K_LAST_KNOWN);
        if let (Some(ts), Some(known_val)) = (last_ts, known) {
            if let Ok(parsed) = DateTime::parse_from_rfc3339(&ts) {
                let age = Utc::now().signed_duration_since(parsed.with_timezone(&Utc));
                if age < Duration::hours(THROTTLE_HOURS) && age >= Duration::zero() {
                    if let Ok(mut info) = serde_json::from_value::<UpdateInfo>(known_val) {
                        info.from_cache = true;
                        return Ok(info);
                    }
                }
            }
        }
    }

    let service = GithubUpdateService::new();
    let result = service.check(current_version()).await;

    // Rate-limited errors still bump lastCheckedAt so we naturally back off.
    if matches!(result, Err(UpdateError::RateLimited)) {
        store.set(
            K_LAST_CHECKED,
            serde_json::Value::String(Utc::now().to_rfc3339()),
        );
        if let Err(e) = store.save() {
            eprintln!("update-check store save failed: {e}");
        }
    }

    let info = result?;

    store.set(
        K_LAST_CHECKED,
        serde_json::Value::String(info.checked_at.clone()),
    );
    store.set(
        K_LAST_KNOWN,
        serde_json::to_value(&info).expect("UpdateInfo always serializes"),
    );
    if let Err(e) = store.save() {
        eprintln!("update-check store save failed: {e}");
    }

    Ok(info)
}

#[tauri::command]
pub async fn dismiss_update_version<R: Runtime>(
    app: AppHandle<R>,
    version: String,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(K_DISMISSED, serde_json::Value::String(version));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_dismissed_version<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    Ok(store
        .get(K_DISMISSED)
        .and_then(|v| v.as_str().map(|s| s.to_string())))
}

#[tauri::command]
pub async fn open_release_page<R: Runtime>(
    app: AppHandle<R>,
    url: String,
) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

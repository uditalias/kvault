use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::keys::{self, KeyEntry};
use crate::AppDb;

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatus {
    pub namespace_id: String,
    pub last_synced_at: Option<String>,
    pub total_keys: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
struct SyncProgressPayload {
    namespace_id: String,
    fetched: usize,
    total_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
struct SyncCompletePayload {
    namespace_id: String,
    total_keys: i64,
}

#[derive(Debug, Clone, Serialize)]
struct SyncErrorPayload {
    namespace_id: String,
    error: String,
}

fn set_sync_status(db: &AppDb, namespace_id: &str, status: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sync_state (namespace_id, status) VALUES (?1, ?2)
         ON CONFLICT(namespace_id) DO UPDATE SET status = ?2",
        params![namespace_id, status],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn start_sync(
    app: AppHandle,
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
) -> Result<(), String> {
    // Set status to syncing
    set_sync_status(&db, &namespace_id, "syncing")?;

    // Create CF client (briefly locks DB to read account info)
    let client = super::create_cf_client(&db, &account_id)?;

    let mut cursor: Option<String> = None;
    let mut all_key_names: Vec<String> = Vec::new();
    let mut fetched: usize = 0;
    let page_size: u32 = 1000;

    loop {
        let result = client
            .list_keys(&namespace_id, cursor.as_deref(), page_size)
            .await;

        match result {
            Ok((cf_keys, next_cursor)) => {
                let key_entries: Vec<KeyEntry> = cf_keys
                    .iter()
                    .map(|k| KeyEntry {
                        key_name: k.name.clone(),
                        expiration: k.expiration,
                    })
                    .collect();

                // Collect key names for stale key removal later
                for k in &cf_keys {
                    all_key_names.push(k.name.clone());
                }

                fetched += cf_keys.len();

                // Upsert this page of keys into DB
                {
                    let conn = db.0.lock().map_err(|e| e.to_string())?;
                    keys::upsert_keys(&conn, &namespace_id, &key_entries)
                        .map_err(|e| e.to_string())?;
                }

                // Emit progress event
                let _ = app.emit(
                    "sync-progress",
                    SyncProgressPayload {
                        namespace_id: namespace_id.clone(),
                        fetched,
                        total_estimate: None,
                    },
                );

                if next_cursor.is_none() {
                    break;
                }
                cursor = next_cursor;
            }
            Err(e) => {
                set_sync_status(&db, &namespace_id, "error")?;
                let _ = app.emit(
                    "sync-error",
                    SyncErrorPayload {
                        namespace_id: namespace_id.clone(),
                        error: e.to_string(),
                    },
                );
                return Err(e.to_string());
            }
        }
    }

    // Remove stale keys and update sync metadata
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        keys::remove_stale_keys(&conn, &namespace_id, &all_key_names)
            .map_err(|e| e.to_string())?;

        let total_keys =
            keys::get_key_count(&conn, &namespace_id).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO sync_state (namespace_id, last_synced_at, total_keys, status)
             VALUES (?1, datetime('now'), ?2, 'idle')
             ON CONFLICT(namespace_id) DO UPDATE SET
                last_synced_at = datetime('now'),
                total_keys = ?2,
                sync_cursor = NULL,
                status = 'idle'",
            params![namespace_id, total_keys],
        )
        .map_err(|e| e.to_string())?;

        // Emit completion event
        let _ = app.emit(
            "sync-complete",
            SyncCompletePayload {
                namespace_id: namespace_id.clone(),
                total_keys,
            },
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn get_sync_status(
    db: State<'_, AppDb>,
    namespace_id: String,
) -> Result<SyncStatus, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT namespace_id, last_synced_at, total_keys, status
             FROM sync_state WHERE namespace_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map(params![namespace_id], |row| {
            Ok(SyncStatus {
                namespace_id: row.get(0)?,
                last_synced_at: row.get(1)?,
                total_keys: row.get(2)?,
                status: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(row) => row.map_err(|e| e.to_string()),
        None => Ok(SyncStatus {
            namespace_id,
            last_synced_at: None,
            total_keys: 0,
            status: "idle".to_string(),
        }),
    }
}

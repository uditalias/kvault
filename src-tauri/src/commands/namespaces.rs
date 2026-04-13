use serde::Serialize;
use tauri::State;

use crate::db::accounts::{self, Namespace};
use crate::AppDb;

#[derive(Debug, Clone, Serialize)]
pub struct NamespaceRefreshResult {
    pub current: Vec<Namespace>,
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

#[tauri::command]
pub async fn list_namespaces(
    db: State<'_, AppDb>,
    account_id: String,
) -> Result<Vec<Namespace>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    accounts::get_namespaces_for_account(&conn, &account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn refresh_namespaces(
    db: State<'_, AppDb>,
    account_id: String,
) -> Result<NamespaceRefreshResult, String> {
    let client = super::create_cf_client(&db, &account_id)?;

    // Fetch current namespaces from Cloudflare
    let cf_namespaces = client.list_namespaces().await.map_err(|e| e.to_string())?;

    // Get existing namespaces from DB
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let existing = accounts::get_namespaces_for_account(&conn, &account_id)
        .map_err(|e| e.to_string())?;

    let existing_ids: std::collections::HashSet<&str> =
        existing.iter().map(|n| n.id.as_str()).collect();
    let cf_ids: std::collections::HashSet<&str> =
        cf_namespaces.iter().map(|n| n.id.as_str()).collect();

    // Determine added and removed
    let added: Vec<String> = cf_namespaces
        .iter()
        .filter(|n| !existing_ids.contains(n.id.as_str()))
        .map(|n| n.title.clone())
        .collect();

    let removed: Vec<String> = existing
        .iter()
        .filter(|n| !cf_ids.contains(n.id.as_str()))
        .map(|n| n.title.clone())
        .collect();

    // Remove namespaces that no longer exist in CF
    for ns in &existing {
        if !cf_ids.contains(ns.id.as_str()) {
            conn.execute("DELETE FROM namespaces WHERE id = ?1", rusqlite::params![ns.id])
                .map_err(|e| e.to_string())?;
        }
    }

    // Add new namespaces from CF
    for ns in &cf_namespaces {
        if !existing_ids.contains(ns.id.as_str()) {
            accounts::create_namespace(&conn, &ns.id, &account_id, &ns.title)
                .map_err(|e| e.to_string())?;
        }
    }

    // Read the final state
    let current = accounts::get_namespaces_for_account(&conn, &account_id)
        .map_err(|e| e.to_string())?;

    Ok(NamespaceRefreshResult {
        current,
        added,
        removed,
    })
}

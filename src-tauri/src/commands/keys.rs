use serde::Serialize;
use tauri::State;

use crate::db::keys::{self, GlobalSearchResult, KeyRow};
use crate::AppDb;

#[derive(Debug, Clone, Serialize)]
pub struct KeyListResult {
    pub keys: Vec<KeyRow>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValueResult {
    pub data: Vec<u8>,
    pub is_json: bool,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkDeleteResult {
    pub deleted: usize,
    pub failed: Vec<String>,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn get_cached_keys(
    db: State<'_, AppDb>,
    namespace_id: String,
    filter: Option<String>,
    offset: i64,
    limit: i64,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
) -> Result<KeyListResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let key_rows = keys::get_keys(
        &conn,
        &namespace_id,
        filter.as_deref(),
        offset,
        limit,
        case_sensitive,
        whole_word,
        is_regex,
    )
    .map_err(|e| e.to_string())?;
    let total = if let Some(ref query) = filter {
        if !query.is_empty() {
            keys::get_filtered_key_count(
                &conn,
                &namespace_id,
                query,
                case_sensitive,
                whole_word,
                is_regex,
            )
            .map_err(|e| e.to_string())?
        } else {
            keys::get_key_count(&conn, &namespace_id).map_err(|e| e.to_string())?
        }
    } else {
        keys::get_key_count(&conn, &namespace_id).map_err(|e| e.to_string())?
    };

    Ok(KeyListResult {
        keys: key_rows,
        total,
    })
}

#[tauri::command]
pub async fn search_keys_global(
    db: State<'_, AppDb>,
    query: String,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
    limit: u32,
) -> Result<Vec<GlobalSearchResult>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    keys::search_keys_global(&conn, &query, case_sensitive, whole_word, is_regex, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_value(
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
    key_name: String,
) -> Result<ValueResult, String> {
    if crate::mock::is_mock_account(&account_id) {
        let data = crate::mock::get(&namespace_id, &key_name).unwrap_or_default();
        let size = data.len();
        let is_json = serde_json::from_slice::<serde_json::Value>(&data).is_ok();
        return Ok(ValueResult { data, is_json, size });
    }

    let client = super::create_cf_client(&db, &account_id)?;
    let data = client
        .get_value(&namespace_id, &key_name)
        .await
        .map_err(|e| e.to_string())?;

    let size = data.len();
    let is_json = serde_json::from_slice::<serde_json::Value>(&data).is_ok();

    Ok(ValueResult {
        data,
        is_json,
        size,
    })
}

#[tauri::command]
pub async fn put_value(
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
    key_name: String,
    value: Vec<u8>,
    ttl: Option<i64>,
) -> Result<(), String> {
    if crate::mock::is_mock_account(&account_id) {
        crate::mock::put(&namespace_id, &key_name, value);
        let expiration = ttl.map(|t| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
                + t
        });
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        keys::insert_key(&conn, &namespace_id, &key_name, expiration)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let client = super::create_cf_client(&db, &account_id)?;
    client
        .put_value(&namespace_id, &key_name, &value, ttl)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_key(
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
    key_name: String,
) -> Result<(), String> {
    if crate::mock::is_mock_account(&account_id) {
        crate::mock::delete(&namespace_id, &key_name);
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        keys::delete_cached_keys(&conn, &namespace_id, &[key_name])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let client = super::create_cf_client(&db, &account_id)?;
    client
        .delete_key(&namespace_id, &key_name)
        .await
        .map_err(|e| e.to_string())?;

    // Remove from local cache
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    keys::delete_cached_keys(&conn, &namespace_id, &[key_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_delete_keys(
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
    key_names: Vec<String>,
) -> Result<BulkDeleteResult, String> {
    if crate::mock::is_mock_account(&account_id) {
        let total = key_names.len();
        for k in &key_names {
            crate::mock::delete(&namespace_id, k);
        }
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        keys::delete_cached_keys(&conn, &namespace_id, &key_names)
            .map_err(|e| e.to_string())?;
        return Ok(BulkDeleteResult { deleted: total, failed: vec![] });
    }

    let client = super::create_cf_client(&db, &account_id)?;
    let total = key_names.len();

    match client.delete_keys(&namespace_id, key_names.clone()).await {
        Ok(()) => {
            // Remove from local cache
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            keys::delete_cached_keys(&conn, &namespace_id, &key_names)
                .map_err(|e| e.to_string())?;
            Ok(BulkDeleteResult {
                deleted: total,
                failed: vec![],
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn create_key(
    db: State<'_, AppDb>,
    account_id: String,
    namespace_id: String,
    key_name: String,
    value: Vec<u8>,
    ttl: Option<i64>,
) -> Result<(), String> {
    let expiration_from_ttl = || {
        ttl.map(|t| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
                + t
        })
    };

    if crate::mock::is_mock_account(&account_id) {
        crate::mock::put(&namespace_id, &key_name, value);
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        keys::insert_key(&conn, &namespace_id, &key_name, expiration_from_ttl())
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let client = super::create_cf_client(&db, &account_id)?;
    client
        .put_value(&namespace_id, &key_name, &value, ttl)
        .await
        .map_err(|e| e.to_string())?;

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    keys::insert_key(&conn, &namespace_id, &key_name, expiration_from_ttl())
        .map_err(|e| e.to_string())?;
    Ok(())
}

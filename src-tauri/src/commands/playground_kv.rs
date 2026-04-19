//! Fidelity-first KV command facade for the playground runtime.
//!
//! These commands are separate from `commands/keys.rs` so the main UI's cached,
//! JSON-detection-augmented semantics are unaffected. Every method on the
//! Cloudflare Workers `KVNamespace` binding maps to exactly one command here,
//! so scripts copy-pasted from real Workers code behave identically.
//!
//! Cancellation: each command takes a `run_id`; on first call for a run, a
//! `CancellationToken` is registered in managed state. Every operation races
//! against that token via `tokio::select!` so mid-flight `reqwest` futures are
//! dropped when the user clicks Stop. `pg_cancel_run` cancels all in-flight
//! work for a run and removes the token.
//!
//! Validation posture: Cloudflare is the source of truth for numeric limits.
//! We only validate argument *shape* (e.g. `type` enum values) — byte/count/TTL
//! errors come back from Cloudflare verbatim.

use std::collections::HashMap;
use std::sync::Mutex;

use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::cloudflare::models::{CfKeyFull, ListKeysResponse, PutOptions};
use crate::AppDb;

/// Managed state that tracks in-flight playground runs so their HTTP work can
/// be cancelled from the frontend.
pub struct PlaygroundRuns(pub Mutex<HashMap<String, CancellationToken>>);

impl PlaygroundRuns {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

impl Default for PlaygroundRuns {
    fn default() -> Self {
        Self::new()
    }
}

fn get_or_create_token(runs: &PlaygroundRuns, run_id: &str) -> Result<CancellationToken, String> {
    let mut map = runs.0.lock().map_err(|e| e.to_string())?;
    Ok(map
        .entry(run_id.to_string())
        .or_insert_with(CancellationToken::new)
        .clone())
}

fn remove_token(runs: &PlaygroundRuns, run_id: &str) {
    if let Ok(mut map) = runs.0.lock() {
        map.remove(run_id);
    }
}

const CANCELLED_MSG: &str = "Run cancelled";
const MOCK_UNSUPPORTED: &str = "Playgrounds are not supported on the mock account. Switch to a real account to use the playground.";

/// Result of a single or bulk `get`/`getWithMetadata`. The frontend wrapper
/// decides how to coerce bytes based on the `type` param passed to the binding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PgValueResult {
    /// Raw bytes as returned by Cloudflare. `null` when the key is absent.
    pub data: Option<Vec<u8>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PgBulkEntry {
    pub key: String,
    pub data: Option<Vec<u8>>,
    pub metadata: Option<serde_json::Value>,
}

// ----- get / get_bulk / get_with_metadata / get_bulk_with_metadata ---------

#[tauri::command]
pub async fn pg_get(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    key: String,
) -> Result<PgValueResult, String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    tokio::select! {
        res = client.get_value(&namespace_id, &key) => {
            match res {
                Ok(data) => Ok(PgValueResult { data: Some(data), metadata: None }),
                Err(e) => {
                    // Cloudflare returns 404 for missing keys via Api { code, ... }.
                    // We normalize that to `null` so the binding can return null.
                    if is_not_found(&e) {
                        Ok(PgValueResult { data: None, metadata: None })
                    } else {
                        Err(e.to_string())
                    }
                }
            }
        }
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

#[tauri::command]
pub async fn pg_get_bulk(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    keys: Vec<String>,
) -> Result<Vec<PgBulkEntry>, String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    let fetches = stream::iter(keys.into_iter().map(|k| {
        let client_ref = &client;
        let ns = namespace_id.as_str();
        async move {
            let res = client_ref.get_value(ns, &k).await;
            match res {
                Ok(data) => PgBulkEntry {
                    key: k,
                    data: Some(data),
                    metadata: None,
                },
                Err(e) if is_not_found(&e) => PgBulkEntry {
                    key: k,
                    data: None,
                    metadata: None,
                },
                Err(_) => PgBulkEntry {
                    key: k,
                    data: None,
                    metadata: None,
                },
            }
        }
    }))
    .buffer_unordered(10)
    .collect::<Vec<_>>();

    tokio::select! {
        entries = fetches => Ok(entries),
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

#[tauri::command]
pub async fn pg_get_with_metadata(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    key: String,
) -> Result<PgValueResult, String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    tokio::select! {
        res = client.get_value_with_metadata(&namespace_id, &key) => {
            match res {
                Ok(v) => Ok(PgValueResult { data: Some(v.value), metadata: v.metadata }),
                Err(e) if is_not_found(&e) => Ok(PgValueResult { data: None, metadata: None }),
                Err(e) => Err(e.to_string()),
            }
        }
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

#[tauri::command]
pub async fn pg_get_bulk_with_metadata(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    keys: Vec<String>,
) -> Result<Vec<PgBulkEntry>, String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    let fetches = stream::iter(keys.into_iter().map(|k| {
        let client_ref = &client;
        let ns = namespace_id.as_str();
        async move {
            let res = client_ref.get_value_with_metadata(ns, &k).await;
            match res {
                Ok(v) => PgBulkEntry {
                    key: k,
                    data: Some(v.value),
                    metadata: v.metadata,
                },
                Err(_) => PgBulkEntry {
                    key: k,
                    data: None,
                    metadata: None,
                },
            }
        }
    }))
    .buffer_unordered(10)
    .collect::<Vec<_>>();

    tokio::select! {
        entries = fetches => Ok(entries),
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

// ----- put / delete -------------------------------------------------------

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn pg_put(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    key: String,
    value: Vec<u8>,
    expiration: Option<i64>,
    expiration_ttl: Option<i64>,
    metadata: Option<serde_json::Value>,
) -> Result<(), String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    let options = PutOptions {
        expiration,
        expiration_ttl,
        metadata,
    };

    tokio::select! {
        res = client.put_value_with_options(&namespace_id, &key, &value, &options) => {
            res.map_err(|e| e.to_string())
        }
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

#[tauri::command]
pub async fn pg_delete(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    key: String,
) -> Result<(), String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    tokio::select! {
        res = client.delete_key(&namespace_id, &key) => res.map_err(|e| e.to_string()),
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

// ----- list ---------------------------------------------------------------

/// Frontend-shaped response for `env.NS.list()`. Mirrors the Workers binding
/// verbatim so scripts can treat it as `KVNamespaceListResult`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PgListResult {
    pub keys: Vec<CfKeyFull>,
    pub list_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

impl From<ListKeysResponse> for PgListResult {
    fn from(r: ListKeysResponse) -> Self {
        Self {
            keys: r.keys,
            list_complete: r.list_complete,
            cursor: r.cursor,
        }
    }
}

// Tauri commands bind named invoke args 1:1 to positional parameters, and
// `State` handles are framework-injected on top of user-provided args. We
// can't reduce the arg count without reshaping the TS-side `invoke` call
// or discarding the per-arg type clarity, neither of which is worthwhile
// for this single command.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn pg_list(
    db: State<'_, AppDb>,
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
    account_id: String,
    namespace_id: String,
    prefix: Option<String>,
    limit: Option<u32>,
    cursor: Option<String>,
) -> Result<PgListResult, String> {
    if crate::mock::is_mock_account(&account_id) {
        return Err(MOCK_UNSUPPORTED.to_string());
    }
    let token = get_or_create_token(&runs, &run_id)?;
    let client = super::create_cf_client(&db, &account_id)?;

    tokio::select! {
        res = client.list_keys_full(
            &namespace_id,
            prefix.as_deref(),
            limit,
            cursor.as_deref(),
        ) => {
            res.map(PgListResult::from).map_err(|e| e.to_string())
        }
        _ = token.cancelled() => Err(CANCELLED_MSG.to_string()),
    }
}

// ----- run control --------------------------------------------------------

#[tauri::command]
pub async fn pg_cancel_run(
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
) -> Result<(), String> {
    let token_opt = {
        let map = runs.0.lock().map_err(|e| e.to_string())?;
        map.get(&run_id).cloned()
    };
    if let Some(token) = token_opt {
        token.cancel();
    }
    remove_token(&runs, &run_id);
    Ok(())
}

/// Called by the frontend after a run completes normally so the token doesn't
/// leak in the registry. Cancellation already does its own cleanup.
#[tauri::command]
pub async fn pg_run_complete(
    runs: State<'_, PlaygroundRuns>,
    run_id: String,
) -> Result<(), String> {
    remove_token(&runs, &run_id);
    Ok(())
}

// ----- helpers ------------------------------------------------------------

fn is_not_found(err: &crate::cloudflare::error::CloudflareError) -> bool {
    use crate::cloudflare::error::CloudflareError;
    match err {
        CloudflareError::Api { code, message } => {
            // Cloudflare returns code 10009 ("key not found") for absent keys,
            // or sometimes an HTTP 404 (surfaced as code 404 from get_value).
            *code == 10009 || *code == 404 || message.contains("not found")
        }
        _ => false,
    }
}

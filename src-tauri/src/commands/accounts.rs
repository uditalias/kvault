use serde::Serialize;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

use crate::cloudflare::client::CloudflareClient;
use crate::db::accounts::{self, Account};
use crate::keychain;
use crate::AppDb;

#[derive(Debug, Serialize)]
pub struct AddAccountError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl AddAccountError {
    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "INTERNAL".into(),
            message: message.into(),
            details: None,
        }
    }
}

#[tauri::command]
pub async fn add_account(
    db: State<'_, AppDb>,
    name: String,
    cf_account_id: String,
    api_token: String,
) -> Result<Account, AddAccountError> {
    // Reject duplicates up front
    {
        let conn = db
            .0
            .lock()
            .map_err(|e| AddAccountError::internal(e.to_string()))?;
        if let Some(existing) = accounts::get_account_by_cloudflare_id(&conn, &cf_account_id)
            .map_err(|e| AddAccountError::internal(e.to_string()))?
        {
            return Err(AddAccountError {
                code: "DUPLICATE_ACCOUNT".into(),
                message: format!(
                    "An account with Cloudflare ID \"{}\" already exists as \"{}\".",
                    cf_account_id, existing.name
                ),
                details: Some(json!({
                    "cloudflare_account_id": cf_account_id,
                    "existing_account_id": existing.id,
                    "existing_account_name": existing.name,
                })),
            });
        }
    }

    // Validate the token
    let client = CloudflareClient::new(api_token.clone(), cf_account_id.clone());
    let verify = client.verify_token().await.map_err(|e| AddAccountError {
        code: "TOKEN_VALIDATION_FAILED".into(),
        message: "Couldn't validate this token. Double-check the Cloudflare Account ID and API token.".into(),
        details: Some(json!({ "cause": e.to_string() })),
    })?;
    if verify.status != "active" {
        return Err(AddAccountError {
            code: "TOKEN_INACTIVE".into(),
            message: format!("Token is not active (status: {})", verify.status),
            details: Some(json!({ "status": verify.status })),
        });
    }

    let id = Uuid::new_v4().to_string();

    keychain::store_token(&id, &api_token).map_err(|e| AddAccountError {
        code: "KEYCHAIN_ERROR".into(),
        message: e.to_string(),
        details: None,
    })?;

    let conn = db
        .0
        .lock()
        .map_err(|e| AddAccountError::internal(e.to_string()))?;
    let account = accounts::create_account(&conn, &id, &name, &cf_account_id)
        .map_err(|e| AddAccountError::internal(e.to_string()))?;

    Ok(account)
}

#[tauri::command]
pub async fn list_accounts(db: State<'_, AppDb>) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    accounts::get_all_accounts(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_account(
    db: State<'_, AppDb>,
    id: String,
    name: String,
    cf_account_id: String,
    api_token: Option<String>,
) -> Result<(), String> {
    // If a new token is provided, update the keychain
    if let Some(token) = api_token {
        keychain::store_token(&id, &token).map_err(|e| e.to_string())?;
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    accounts::update_account(&conn, &id, &name, &cf_account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_account(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    if crate::mock::is_mock_account(&id) {
        return Err("The mock account is managed by dev mode and can't be removed.".into());
    }

    // Delete token from keychain first (ignore NotFound errors)
    keychain::delete_token(&id).map_err(|e| e.to_string())?;

    // Delete account from DB (cascades to namespaces and keys)
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    accounts::delete_account(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_token(cf_account_id: String, api_token: String) -> Result<bool, String> {
    let client = CloudflareClient::new(api_token, cf_account_id);
    match client.verify_token().await {
        Ok(verify) => Ok(verify.status == "active"),
        Err(e) => Err(format!("Token validation failed: {}", e)),
    }
}

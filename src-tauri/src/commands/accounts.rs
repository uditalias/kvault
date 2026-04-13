use tauri::State;
use uuid::Uuid;

use crate::cloudflare::client::CloudflareClient;
use crate::db::accounts::{self, Account};
use crate::keychain;
use crate::AppDb;

#[tauri::command]
pub async fn add_account(
    db: State<'_, AppDb>,
    name: String,
    cf_account_id: String,
    api_token: String,
) -> Result<Account, String> {
    // Validate the token first
    let client = CloudflareClient::new(api_token.clone(), cf_account_id.clone());
    let verify = client
        .verify_token()
        .await
        .map_err(|e| format!("Token validation failed: {}", e))?;
    if verify.status != "active" {
        return Err(format!("Token is not active (status: {})", verify.status));
    }

    let id = Uuid::new_v4().to_string();

    // Store token in keychain
    keychain::store_token(&id, &api_token).map_err(|e| e.to_string())?;
    // Create account in DB
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let account = accounts::create_account(&conn, &id, &name, &cf_account_id)
        .map_err(|e| e.to_string())?;

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

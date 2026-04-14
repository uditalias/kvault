pub mod accounts;
pub mod filters;
pub mod keys;
pub mod namespaces;
pub mod sync;
pub mod update;
pub mod workspaces;

use crate::cloudflare::client::CloudflareClient;
use crate::AppDb;

/// Helper to create a CloudflareClient for a given account.
/// Looks up the account in DB, retrieves the token from keychain,
/// and returns a configured client.
pub fn create_cf_client(db: &AppDb, account_id: &str) -> Result<CloudflareClient, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let account = crate::db::accounts::get_account(&conn, account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Account not found".to_string())?;
    drop(conn); // Release lock before keychain access

    let token = crate::keychain::get_token(account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Token not found in keychain".to_string())?;

    Ok(CloudflareClient::new(token, account.cloudflare_account_id))
}

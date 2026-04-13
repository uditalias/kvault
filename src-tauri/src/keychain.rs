use keyring::Entry;

const SERVICE_NAME: &str = "com.kvault.api-tokens";

#[derive(Debug, thiserror::Error)]
pub enum KeychainError {
    #[error("Keychain error: {0}")]
    Keyring(String),
    #[error("Token not found")]
    NotFound,
}

impl From<keyring::Error> for KeychainError {
    fn from(err: keyring::Error) -> Self {
        KeychainError::Keyring(err.to_string())
    }
}

pub fn store_token(account_id: &str, token: &str) -> Result<(), KeychainError> {
    let entry = Entry::new(SERVICE_NAME, account_id)?;
    entry.set_password(token)?;
    Ok(())
}

pub fn get_token(account_id: &str) -> Result<Option<String>, KeychainError> {
    let entry = Entry::new(SERVICE_NAME, account_id)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(KeychainError::from(err)),
    }
}

pub fn delete_token(account_id: &str) -> Result<(), KeychainError> {
    let entry = Entry::new(SERVICE_NAME, account_id)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(KeychainError::from(err)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // Requires OS keychain access — run manually
    fn test_store_get_delete_token() {
        let account_id = "test-account-keychain-integration";
        let token = "cf-test-token-abc123";

        // Clean up any leftover from previous runs
        let _ = delete_token(account_id);

        // Store
        store_token(account_id, token).expect("store_token should succeed");

        // Get
        let retrieved = get_token(account_id).expect("get_token should succeed");
        assert_eq!(retrieved, Some(token.to_string()));

        // Delete
        delete_token(account_id).expect("delete_token should succeed");

        // Get after delete returns None
        let retrieved = get_token(account_id).expect("get_token should succeed");
        assert_eq!(retrieved, None);
    }

    #[test]
    #[ignore] // Requires OS keychain access — run manually
    fn test_get_nonexistent_token_returns_none() {
        let result = get_token("nonexistent-account-id-xyz").expect("get_token should succeed");
        assert_eq!(result, None);
    }
}

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub cloudflare_account_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Namespace {
    pub id: String,
    pub account_id: String,
    pub title: String,
    pub created_at: String,
}

pub fn create_account(
    conn: &Connection,
    id: &str,
    name: &str,
    cloudflare_account_id: &str,
) -> Result<Account, rusqlite::Error> {
    conn.execute(
        "INSERT INTO accounts (id, name, cloudflare_account_id) VALUES (?1, ?2, ?3)",
        params![id, name, cloudflare_account_id],
    )?;

    get_account(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_all_accounts(conn: &Connection) -> Result<Vec<Account>, rusqlite::Error> {
    let mut stmt =
        conn.prepare("SELECT id, name, cloudflare_account_id, created_at, updated_at FROM accounts ORDER BY created_at")?;
    let rows = stmt.query_map([], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            cloudflare_account_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    rows.collect()
}

pub fn get_account_by_cloudflare_id(
    conn: &Connection,
    cloudflare_account_id: &str,
) -> Result<Option<Account>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, cloudflare_account_id, created_at, updated_at FROM accounts WHERE cloudflare_account_id = ?1",
    )?;
    let mut rows = stmt.query_map(params![cloudflare_account_id], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            cloudflare_account_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn get_account(conn: &Connection, id: &str) -> Result<Option<Account>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, cloudflare_account_id, created_at, updated_at FROM accounts WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            cloudflare_account_id: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

pub fn update_account(
    conn: &Connection,
    id: &str,
    name: &str,
    cloudflare_account_id: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE accounts SET name = ?1, cloudflare_account_id = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![name, cloudflare_account_id, id],
    )?;
    Ok(())
}

pub fn delete_account(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn create_namespace(
    conn: &Connection,
    id: &str,
    account_id: &str,
    title: &str,
) -> Result<Namespace, rusqlite::Error> {
    conn.execute(
        "INSERT INTO namespaces (id, account_id, title) VALUES (?1, ?2, ?3)",
        params![id, account_id, title],
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, account_id, title, created_at FROM namespaces WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |row| {
        Ok(Namespace {
            id: row.get(0)?,
            account_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    rows.next()
        .ok_or(rusqlite::Error::QueryReturnedNoRows)?
}

pub fn get_namespaces_for_account(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<Namespace>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, title, created_at FROM namespaces WHERE account_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        Ok(Namespace {
            id: row.get(0)?,
            account_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_and_get_account() {
        let conn = setup();
        let account = create_account(&conn, "acc-1", "My Account", "cf-123").unwrap();
        assert_eq!(account.id, "acc-1");
        assert_eq!(account.name, "My Account");
        assert_eq!(account.cloudflare_account_id, "cf-123");

        let fetched = get_account(&conn, "acc-1").unwrap().unwrap();
        assert_eq!(fetched.id, "acc-1");
    }

    #[test]
    fn test_get_all_accounts() {
        let conn = setup();
        create_account(&conn, "acc-1", "Account 1", "cf-1").unwrap();
        create_account(&conn, "acc-2", "Account 2", "cf-2").unwrap();

        let accounts = get_all_accounts(&conn).unwrap();
        assert_eq!(accounts.len(), 2);
    }

    #[test]
    fn test_update_account() {
        let conn = setup();
        create_account(&conn, "acc-1", "Old Name", "cf-1").unwrap();
        update_account(&conn, "acc-1", "New Name", "cf-2").unwrap();

        let account = get_account(&conn, "acc-1").unwrap().unwrap();
        assert_eq!(account.name, "New Name");
        assert_eq!(account.cloudflare_account_id, "cf-2");
    }

    #[test]
    fn test_delete_account() {
        let conn = setup();
        create_account(&conn, "acc-1", "Account", "cf-1").unwrap();
        delete_account(&conn, "acc-1").unwrap();

        let account = get_account(&conn, "acc-1").unwrap();
        assert!(account.is_none());
    }

    #[test]
    fn test_delete_account_cascades_to_namespaces_and_keys() {
        let conn = setup();
        create_account(&conn, "acc-1", "Account", "cf-1").unwrap();
        create_namespace(&conn, "ns-1", "acc-1", "My Namespace").unwrap();

        // Insert some keys for this namespace
        crate::db::keys::upsert_keys(
            &conn,
            "ns-1",
            &[
                crate::db::keys::KeyEntry {
                    key_name: "key1".to_string(),
                    expiration: None,
                },
                crate::db::keys::KeyEntry {
                    key_name: "key2".to_string(),
                    expiration: Some(1234567890),
                },
            ],
        )
        .unwrap();

        // Verify keys exist
        let count = crate::db::keys::get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 2);

        // Delete account - should cascade
        delete_account(&conn, "acc-1").unwrap();

        // Verify namespace gone
        let namespaces = get_namespaces_for_account(&conn, "acc-1").unwrap();
        assert!(namespaces.is_empty());

        // Verify keys gone
        let count = crate::db::keys::get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_foreign_key_enforcement() {
        let conn = setup();
        // Inserting a namespace with a non-existent account_id should fail
        let result = create_namespace(&conn, "ns-1", "nonexistent", "Bad Namespace");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_nonexistent_account() {
        let conn = setup();
        let account = get_account(&conn, "nonexistent").unwrap();
        assert!(account.is_none());
    }
}

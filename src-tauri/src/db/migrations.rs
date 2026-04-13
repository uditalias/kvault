use rusqlite::Connection;

/// Run all database migrations. Creates tables and indexes if they don't exist.
pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Enable foreign keys (SQLite has them disabled by default)
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    conn.execute_batch(
        "
        -- accounts table (tokens stored in OS keychain, NOT here)
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cloudflare_account_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- namespaces table
        CREATE TABLE IF NOT EXISTS namespaces (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- keys cache table
        CREATE TABLE IF NOT EXISTS kv_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            namespace_id TEXT NOT NULL,
            key_name TEXT NOT NULL,
            expiration INTEGER,
            synced_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE,
            UNIQUE(namespace_id, key_name)
        );

        -- sync metadata table
        CREATE TABLE IF NOT EXISTS sync_state (
            namespace_id TEXT PRIMARY KEY,
            last_synced_at TEXT,
            total_keys INTEGER DEFAULT 0,
            sync_cursor TEXT,
            status TEXT DEFAULT 'idle',
            FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
        );

        -- saved filters
        CREATE TABLE IF NOT EXISTS saved_filters (
            id TEXT PRIMARY KEY,
            namespace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            filter_type TEXT NOT NULL,
            filter_value TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
        );

        -- workspaces
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            state_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_kv_keys_namespace ON kv_keys(namespace_id);
        CREATE INDEX IF NOT EXISTS idx_kv_keys_name ON kv_keys(namespace_id, key_name);
        CREATE INDEX IF NOT EXISTS idx_namespaces_account ON namespaces(account_id);
        CREATE INDEX IF NOT EXISTS idx_saved_filters_namespace ON saved_filters(namespace_id);
        ",
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_run_without_errors() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
    }

    #[test]
    fn test_migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();
    }
}

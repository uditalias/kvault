pub mod accounts;
pub mod filters;
pub mod keys;
pub mod migrations;
pub mod workspaces;

use rusqlite::Connection;
use std::path::Path;

/// Initialize the database at the given path, running migrations.
/// Returns a Connection ready for use.
pub fn init_db(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    migrations::run_migrations(&conn)?;
    Ok(conn)
}

/// Initialize an in-memory database for testing.
#[cfg(test)]
pub fn init_db_in_memory() -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open_in_memory()?;
    migrations::run_migrations(&conn)?;
    Ok(conn)
}

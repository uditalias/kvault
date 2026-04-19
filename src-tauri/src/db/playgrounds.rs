use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Playground {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub code: String,
    pub mode: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_playground(
    conn: &Connection,
    id: &str,
    account_id: &str,
    name: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO playgrounds (id, account_id, name, code, mode) VALUES (?1, ?2, ?3, '', 'read-only')",
        params![id, account_id, name],
    )?;
    Ok(())
}

pub fn insert_playground(
    conn: &Connection,
    id: &str,
    account_id: &str,
    name: &str,
    code: &str,
    mode: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO playgrounds (id, account_id, name, code, mode) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, account_id, name, code, mode],
    )?;
    Ok(())
}

pub fn get_playground(conn: &Connection, id: &str) -> Result<Option<Playground>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, code, mode, created_at, updated_at FROM playgrounds WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Playground {
            id: row.get(0)?,
            account_id: row.get(1)?,
            name: row.get(2)?,
            code: row.get(3)?,
            mode: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_playgrounds(
    conn: &Connection,
    account_id: &str,
) -> Result<Vec<Playground>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, code, mode, created_at, updated_at FROM playgrounds WHERE account_id = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        Ok(Playground {
            id: row.get(0)?,
            account_id: row.get(1)?,
            name: row.get(2)?,
            code: row.get(3)?,
            mode: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn update_code(conn: &Connection, id: &str, code: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE playgrounds SET code = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![code, id],
    )?;
    Ok(())
}

pub fn update_name(conn: &Connection, id: &str, name: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE playgrounds SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![name, id],
    )?;
    Ok(())
}

pub fn update_mode(conn: &Connection, id: &str, mode: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE playgrounds SET mode = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![mode, id],
    )?;
    Ok(())
}

pub fn delete_playground(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM playgrounds WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, name, cloudflare_account_id) VALUES ('acc-1', 'Test', 'cf-1')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_create_and_list() {
        let conn = setup();
        create_playground(&conn, "pg-1", "acc-1", "Scratch").unwrap();
        let pgs = list_playgrounds(&conn, "acc-1").unwrap();
        assert_eq!(pgs.len(), 1);
        assert_eq!(pgs[0].name, "Scratch");
        assert_eq!(pgs[0].mode, "read-only");
        assert_eq!(pgs[0].code, "");
    }

    #[test]
    fn test_update_code_and_mode() {
        let conn = setup();
        create_playground(&conn, "pg-1", "acc-1", "Scratch").unwrap();
        update_code(&conn, "pg-1", "await env.FOO.get('x')").unwrap();
        update_mode(&conn, "pg-1", "live").unwrap();
        let pg = get_playground(&conn, "pg-1").unwrap().unwrap();
        assert_eq!(pg.code, "await env.FOO.get('x')");
        assert_eq!(pg.mode, "live");
    }

    #[test]
    fn test_cascade_on_account_delete() {
        let conn = setup();
        create_playground(&conn, "pg-1", "acc-1", "Scratch").unwrap();
        conn.execute("DELETE FROM accounts WHERE id = 'acc-1'", [])
            .unwrap();
        let pgs = list_playgrounds(&conn, "acc-1").unwrap();
        assert!(pgs.is_empty());
    }
}

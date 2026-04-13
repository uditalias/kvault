use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub state_json: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_workspace(
    conn: &Connection,
    id: &str,
    name: &str,
    state_json: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO workspaces (id, name, state_json) VALUES (?1, ?2, ?3)",
        params![id, name, state_json],
    )?;
    Ok(())
}

pub fn get_workspace(conn: &Connection, id: &str) -> Result<Workspace, rusqlite::Error> {
    conn.query_row(
        "SELECT id, name, state_json, created_at, updated_at FROM workspaces WHERE id = ?1",
        params![id],
        |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                state_json: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

pub fn get_all_workspaces(conn: &Connection) -> Result<Vec<Workspace>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, state_json, created_at, updated_at FROM workspaces ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Workspace {
            id: row.get(0)?,
            name: row.get(1)?,
            state_json: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn update_workspace(
    conn: &Connection,
    id: &str,
    name: &str,
    state_json: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE workspaces SET name = ?1, state_json = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![name, state_json, id],
    )?;
    Ok(())
}

pub fn delete_workspace(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
    Ok(())
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
    fn test_workspace_crud() {
        let conn = setup();
        let state = r#"{"accounts":[],"namespaces":[]}"#;

        create_workspace(&conn, "ws-1", "My Workspace", state).unwrap();

        let workspaces = get_all_workspaces(&conn).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].name, "My Workspace");
        assert_eq!(workspaces[0].state_json, state);

        let new_state = r#"{"accounts":["acc-1"],"namespaces":["ns-1"]}"#;
        update_workspace(&conn, "ws-1", "Updated Workspace", new_state).unwrap();

        let workspaces = get_all_workspaces(&conn).unwrap();
        assert_eq!(workspaces[0].name, "Updated Workspace");
        assert_eq!(workspaces[0].state_json, new_state);

        delete_workspace(&conn, "ws-1").unwrap();
        let workspaces = get_all_workspaces(&conn).unwrap();
        assert!(workspaces.is_empty());
    }

    #[test]
    fn test_multiple_workspaces() {
        let conn = setup();
        create_workspace(&conn, "ws-1", "Workspace 1", "{}").unwrap();
        create_workspace(&conn, "ws-2", "Workspace 2", "{}").unwrap();

        let workspaces = get_all_workspaces(&conn).unwrap();
        assert_eq!(workspaces.len(), 2);
    }
}

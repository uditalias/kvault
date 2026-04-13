use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SavedFilter {
    pub id: String,
    pub namespace_id: String,
    pub name: String,
    pub filter_type: String,
    pub filter_value: String,
    pub created_at: String,
}

pub fn create_saved_filter(
    conn: &Connection,
    id: &str,
    namespace_id: &str,
    name: &str,
    filter_type: &str,
    filter_value: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO saved_filters (id, namespace_id, name, filter_type, filter_value) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, namespace_id, name, filter_type, filter_value],
    )?;
    Ok(())
}

pub fn get_saved_filter(conn: &Connection, id: &str) -> Result<SavedFilter, rusqlite::Error> {
    conn.query_row(
        "SELECT id, namespace_id, name, filter_type, filter_value, created_at FROM saved_filters WHERE id = ?1",
        params![id],
        |row| {
            Ok(SavedFilter {
                id: row.get(0)?,
                namespace_id: row.get(1)?,
                name: row.get(2)?,
                filter_type: row.get(3)?,
                filter_value: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )
}

pub fn get_saved_filters(
    conn: &Connection,
    namespace_id: &str,
) -> Result<Vec<SavedFilter>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, namespace_id, name, filter_type, filter_value, created_at FROM saved_filters WHERE namespace_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map(params![namespace_id], |row| {
        Ok(SavedFilter {
            id: row.get(0)?,
            namespace_id: row.get(1)?,
            name: row.get(2)?,
            filter_type: row.get(3)?,
            filter_value: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn delete_saved_filter(conn: &Connection, id: &str) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM saved_filters WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        // Insert parent records to satisfy foreign key constraints
        conn.execute(
            "INSERT INTO accounts (id, name, cloudflare_account_id) VALUES ('acc-1', 'Test', 'cf-1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO namespaces (id, account_id, title) VALUES ('ns-1', 'acc-1', 'NS 1')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO namespaces (id, account_id, title) VALUES ('ns-2', 'acc-1', 'NS 2')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_saved_filter_crud() {
        let conn = setup();

        create_saved_filter(&conn, "f-1", "ns-1", "My Filter", "prefix", "user:*").unwrap();

        let filters = get_saved_filters(&conn, "ns-1").unwrap();
        assert_eq!(filters.len(), 1);
        assert_eq!(filters[0].name, "My Filter");
        assert_eq!(filters[0].filter_type, "prefix");
        assert_eq!(filters[0].filter_value, "user:*");

        delete_saved_filter(&conn, "f-1").unwrap();
        let filters = get_saved_filters(&conn, "ns-1").unwrap();
        assert!(filters.is_empty());
    }

    #[test]
    fn test_filters_namespace_specific() {
        let conn = setup();
        create_saved_filter(&conn, "f-1", "ns-1", "Filter A", "prefix", "a:*").unwrap();
        create_saved_filter(&conn, "f-2", "ns-2", "Filter B", "prefix", "b:*").unwrap();

        let ns1_filters = get_saved_filters(&conn, "ns-1").unwrap();
        assert_eq!(ns1_filters.len(), 1);
        assert_eq!(ns1_filters[0].name, "Filter A");

        let ns2_filters = get_saved_filters(&conn, "ns-2").unwrap();
        assert_eq!(ns2_filters.len(), 1);
        assert_eq!(ns2_filters[0].name, "Filter B");
    }
}

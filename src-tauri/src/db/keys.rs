use regex::Regex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyEntry {
    pub key_name: String,
    pub expiration: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyRow {
    pub id: i64,
    pub namespace_id: String,
    pub key_name: String,
    pub expiration: Option<i64>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncState {
    pub namespace_id: String,
    pub last_synced_at: Option<String>,
    pub total_keys: i64,
    pub sync_cursor: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SavedFilter {
    pub id: String,
    pub namespace_id: String,
    pub name: String,
    pub filter_type: String,
    pub filter_value: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GlobalSearchResult {
    pub namespace_id: String,
    pub namespace_title: String,
    pub account_id: String,
    pub keys: Vec<KeyRow>,
    pub total_matches: i64,
}

/// Helper: checks whether a key name matches the given search query
/// according to the provided search options.
fn key_matches(key_name: &str, query: &str, case_sensitive: bool, whole_word: bool, is_regex: bool, compiled_regex: Option<&Regex>) -> bool {
    if is_regex {
        if let Some(re) = compiled_regex {
            return re.is_match(key_name);
        }
        return false;
    }

    if whole_word {
        // Match query as a complete word bounded by non-alphanumeric or start/end
        let pattern = if case_sensitive {
            format!(r"(?-i)\b{}\b", regex::escape(query))
        } else {
            format!(r"(?i)\b{}\b", regex::escape(query))
        };
        if let Ok(re) = Regex::new(&pattern) {
            return re.is_match(key_name);
        }
        return false;
    }

    if case_sensitive {
        key_name.contains(query)
    } else {
        key_name.to_lowercase().contains(&query.to_lowercase())
    }
}

/// Bulk insert/update keys using INSERT OR REPLACE.
/// Uses a transaction for performance with large batches.
pub fn upsert_keys(
    conn: &Connection,
    namespace_id: &str,
    keys: &[KeyEntry],
) -> Result<(), rusqlite::Error> {
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO kv_keys (namespace_id, key_name, expiration, synced_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
        )?;

        for key in keys {
            stmt.execute(params![namespace_id, key.key_name, key.expiration])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Get keys for a namespace with optional filter and search options.
pub fn get_keys(
    conn: &Connection,
    namespace_id: &str,
    filter: Option<&str>,
    offset: i64,
    limit: i64,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
) -> Result<Vec<KeyRow>, rusqlite::Error> {
    let rows = match filter {
        Some(query) if !query.is_empty() => {
            // For regex, whole_word, or case-sensitive: load candidates from SQL and filter in Rust
            if is_regex || whole_word || case_sensitive {
                let compiled_regex = if is_regex {
                    let pattern = if case_sensitive {
                        format!("(?-i){}", query)
                    } else {
                        format!("(?i){}", query)
                    };
                    Regex::new(&pattern).ok()
                } else {
                    None
                };

                // Use a broad SQL query to get candidates, then filter in Rust
                // For case-insensitive non-regex non-whole-word we could use SQL,
                // but for consistency we handle all advanced modes in Rust.
                let mut stmt = conn.prepare(
                    "SELECT id, namespace_id, key_name, expiration, synced_at
                     FROM kv_keys
                     WHERE namespace_id = ?1
                     ORDER BY key_name",
                )?;
                let all_rows = stmt.query_map(params![namespace_id], |row| {
                    Ok(KeyRow {
                        id: row.get(0)?,
                        namespace_id: row.get(1)?,
                        key_name: row.get(2)?,
                        expiration: row.get(3)?,
                        synced_at: row.get(4)?,
                    })
                })?;
                let filtered: Vec<KeyRow> = all_rows
                    .filter_map(|r| r.ok())
                    .filter(|row| key_matches(&row.key_name, query, case_sensitive, whole_word, is_regex, compiled_regex.as_ref()))
                    .skip(offset as usize)
                    .take(limit as usize)
                    .collect();
                filtered
            } else {
                // Default: case-insensitive substring match via SQL LIKE
                let escaped = query
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_");
                let pattern = format!("%{}%", escaped);
                let mut stmt = conn.prepare(
                    "SELECT id, namespace_id, key_name, expiration, synced_at
                     FROM kv_keys
                     WHERE namespace_id = ?1 AND key_name LIKE ?2 ESCAPE '\\' COLLATE NOCASE
                     ORDER BY key_name
                     LIMIT ?3 OFFSET ?4",
                )?;
                let rows = stmt.query_map(params![namespace_id, pattern, limit, offset], |row| {
                    Ok(KeyRow {
                        id: row.get(0)?,
                        namespace_id: row.get(1)?,
                        key_name: row.get(2)?,
                        expiration: row.get(3)?,
                        synced_at: row.get(4)?,
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            }
        }
        _ => {
            let mut stmt = conn.prepare(
                "SELECT id, namespace_id, key_name, expiration, synced_at
                 FROM kv_keys
                 WHERE namespace_id = ?1
                 ORDER BY key_name
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(params![namespace_id, limit, offset], |row| {
                Ok(KeyRow {
                    id: row.get(0)?,
                    namespace_id: row.get(1)?,
                    key_name: row.get(2)?,
                    expiration: row.get(3)?,
                    synced_at: row.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(rows)
}

/// Count keys matching the filter with search options.
pub fn get_filtered_key_count(
    conn: &Connection,
    namespace_id: &str,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
) -> Result<i64, rusqlite::Error> {
    if is_regex || whole_word || case_sensitive {
        let compiled_regex = if is_regex {
            let pattern = if case_sensitive {
                format!("(?-i){}", query)
            } else {
                format!("(?i){}", query)
            };
            Regex::new(&pattern).ok()
        } else {
            None
        };

        let mut stmt = conn.prepare(
            "SELECT key_name FROM kv_keys WHERE namespace_id = ?1",
        )?;
        let count = stmt
            .query_map(params![namespace_id], |row| row.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .filter(|key_name| key_matches(key_name, query, case_sensitive, whole_word, is_regex, compiled_regex.as_ref()))
            .count();
        Ok(count as i64)
    } else {
        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{}%", escaped);
        conn.query_row(
            "SELECT COUNT(*) FROM kv_keys WHERE namespace_id = ?1 AND key_name LIKE ?2 ESCAPE '\\' COLLATE NOCASE",
            params![namespace_id, pattern],
            |row| row.get(0),
        )
    }
}

/// Search keys globally across all namespaces.
pub fn search_keys_global(
    conn: &Connection,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    is_regex: bool,
    limit: u32,
) -> Result<Vec<GlobalSearchResult>, rusqlite::Error> {
    let compiled_regex = if is_regex {
        let pattern = if case_sensitive {
            format!("(?-i){}", query)
        } else {
            format!("(?i){}", query)
        };
        Regex::new(&pattern).ok()
    } else {
        None
    };

    // Determine whether we can filter in SQL or need Rust-side filtering
    let use_sql_filter = !is_regex && !whole_word && !case_sensitive;

    let mut results_map: HashMap<String, GlobalSearchResult> = HashMap::new();
    // Track insertion order of namespace IDs
    let mut ns_order: Vec<String> = Vec::new();

    if use_sql_filter {
        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{}%", escaped);
        let mut stmt = conn.prepare(
            "SELECT k.id, k.namespace_id, k.key_name, k.expiration, k.synced_at,
                    n.title, n.account_id
             FROM kv_keys k
             JOIN namespaces n ON k.namespace_id = n.id
             WHERE k.key_name LIKE ?1 ESCAPE '\\' COLLATE NOCASE
             ORDER BY n.title, k.key_name",
        )?;
        let rows = stmt.query_map(params![pattern], |row| {
            Ok((
                KeyRow {
                    id: row.get(0)?,
                    namespace_id: row.get(1)?,
                    key_name: row.get(2)?,
                    expiration: row.get(3)?,
                    synced_at: row.get(4)?,
                },
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?;

        for r in rows {
            let (key_row, ns_title, account_id) = r?;
            let ns_id = key_row.namespace_id.clone();
            let entry = results_map.entry(ns_id.clone()).or_insert_with(|| {
                ns_order.push(ns_id.clone());
                GlobalSearchResult {
                    namespace_id: ns_id,
                    namespace_title: ns_title,
                    account_id,
                    keys: Vec::new(),
                    total_matches: 0,
                }
            });
            entry.total_matches += 1;
            if (entry.keys.len() as u32) < limit {
                entry.keys.push(key_row);
            }
        }
    } else {
        // Load all keys joined with namespaces, filter in Rust
        let mut stmt = conn.prepare(
            "SELECT k.id, k.namespace_id, k.key_name, k.expiration, k.synced_at,
                    n.title, n.account_id
             FROM kv_keys k
             JOIN namespaces n ON k.namespace_id = n.id
             ORDER BY n.title, k.key_name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                KeyRow {
                    id: row.get(0)?,
                    namespace_id: row.get(1)?,
                    key_name: row.get(2)?,
                    expiration: row.get(3)?,
                    synced_at: row.get(4)?,
                },
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?;

        for r in rows {
            let (key_row, ns_title, account_id) = r?;
            if !key_matches(&key_row.key_name, query, case_sensitive, whole_word, is_regex, compiled_regex.as_ref()) {
                continue;
            }
            let ns_id = key_row.namespace_id.clone();
            let entry = results_map.entry(ns_id.clone()).or_insert_with(|| {
                ns_order.push(ns_id.clone());
                GlobalSearchResult {
                    namespace_id: ns_id,
                    namespace_title: ns_title,
                    account_id,
                    keys: Vec::new(),
                    total_matches: 0,
                }
            });
            entry.total_matches += 1;
            if (entry.keys.len() as u32) < limit {
                entry.keys.push(key_row);
            }
        }
    }

    // Return results in insertion order (which follows ORDER BY n.title)
    let results: Vec<GlobalSearchResult> = ns_order
        .into_iter()
        .filter_map(|ns_id| results_map.remove(&ns_id))
        .collect();

    Ok(results)
}

/// Get the total count of keys in a namespace.
pub fn get_key_count(conn: &Connection, namespace_id: &str) -> Result<i64, rusqlite::Error> {
    conn.query_row(
        "SELECT COUNT(*) FROM kv_keys WHERE namespace_id = ?1",
        params![namespace_id],
        |row| row.get(0),
    )
}

/// Insert a single key into the local cache.
pub fn insert_key(
    conn: &Connection,
    namespace_id: &str,
    key_name: &str,
    expiration: Option<i64>,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO kv_keys (namespace_id, key_name, expiration, synced_at)
         VALUES (?1, ?2, ?3, datetime('now'))",
        params![namespace_id, key_name, expiration],
    )?;
    Ok(())
}

/// Delete specific keys from the local cache.
pub fn delete_cached_keys(
    conn: &Connection,
    namespace_id: &str,
    key_names: &[String],
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "DELETE FROM kv_keys WHERE namespace_id = ?1 AND key_name = ?2",
    )?;
    for key_name in key_names {
        stmt.execute(params![namespace_id, key_name])?;
    }
    Ok(())
}

/// Delete all cached keys for a namespace.
pub fn delete_keys_for_namespace(
    conn: &Connection,
    namespace_id: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM kv_keys WHERE namespace_id = ?1",
        params![namespace_id],
    )?;
    Ok(())
}

/// Remove keys that are no longer present in Cloudflare.
/// Deletes keys whose key_name is NOT in the provided list.
pub fn remove_stale_keys(
    conn: &Connection,
    namespace_id: &str,
    current_key_names: &[String],
) -> Result<u64, rusqlite::Error> {
    if current_key_names.is_empty() {
        // If the current list is empty, remove all keys for this namespace
        let deleted = conn.execute(
            "DELETE FROM kv_keys WHERE namespace_id = ?1",
            params![namespace_id],
        )?;
        return Ok(deleted as u64);
    }

    // Build a temp table approach for efficiency with large key lists
    let tx = conn.unchecked_transaction()?;

    tx.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS _current_keys (key_name TEXT NOT NULL);
         DELETE FROM _current_keys;",
    )?;

    {
        let mut stmt = tx.prepare("INSERT INTO _current_keys (key_name) VALUES (?1)")?;
        for name in current_key_names {
            stmt.execute(params![name])?;
        }
    }

    let deleted = tx.execute(
        "DELETE FROM kv_keys WHERE namespace_id = ?1 AND key_name NOT IN (SELECT key_name FROM _current_keys)",
        params![namespace_id],
    )?;

    tx.execute_batch("DROP TABLE IF EXISTS _current_keys;")?;
    tx.commit()?;

    Ok(deleted as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::accounts::{create_account, create_namespace};
    use crate::db::migrations::run_migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        create_account(&conn, "acc-1", "Test Account", "cf-1").unwrap();
        create_namespace(&conn, "ns-1", "acc-1", "Test NS").unwrap();
        conn
    }

    #[test]
    fn test_upsert_keys() {
        let conn = setup();
        let keys = vec![
            KeyEntry { key_name: "key1".to_string(), expiration: None },
            KeyEntry { key_name: "key2".to_string(), expiration: Some(1700000000) },
        ];
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        let count = get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_upsert_keys_replaces_existing() {
        let conn = setup();
        let keys1 = vec![
            KeyEntry { key_name: "key1".to_string(), expiration: None },
        ];
        upsert_keys(&conn, "ns-1", &keys1).unwrap();

        // Upsert same key with different expiration
        let keys2 = vec![
            KeyEntry { key_name: "key1".to_string(), expiration: Some(9999) },
        ];
        upsert_keys(&conn, "ns-1", &keys2).unwrap();

        let count = get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 1);

        let rows = get_keys(&conn, "ns-1", None, 0, 100, false, false, false).unwrap();
        assert_eq!(rows[0].expiration, Some(9999));
    }

    #[test]
    fn test_upsert_1000_keys_performance() {
        let conn = setup();
        let keys: Vec<KeyEntry> = (0..1000)
            .map(|i| KeyEntry {
                key_name: format!("key-{:04}", i),
                expiration: None,
            })
            .collect();

        let start = std::time::Instant::now();
        upsert_keys(&conn, "ns-1", &keys).unwrap();
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_millis() < 500,
            "upsert_keys with 1000 keys took {}ms, expected < 500ms",
            elapsed.as_millis()
        );

        let count = get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 1000);
    }

    #[test]
    fn test_get_keys_with_prefix_filter() {
        let conn = setup();
        let keys = vec![
            KeyEntry { key_name: "users:alice".to_string(), expiration: None },
            KeyEntry { key_name: "users:bob".to_string(), expiration: None },
            KeyEntry { key_name: "config:theme".to_string(), expiration: None },
            KeyEntry { key_name: "config:lang".to_string(), expiration: None },
            KeyEntry { key_name: "data:blob".to_string(), expiration: None },
        ];
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        let users = get_keys(&conn, "ns-1", Some("users:"), 0, 100, false, false, false).unwrap();
        assert_eq!(users.len(), 2);
        assert!(users.iter().all(|k| k.key_name.starts_with("users:")));

        let config = get_keys(&conn, "ns-1", Some("config:"), 0, 100, false, false, false).unwrap();
        assert_eq!(config.len(), 2);
    }

    #[test]
    fn test_get_keys_with_pagination() {
        let conn = setup();
        let keys: Vec<KeyEntry> = (0..10)
            .map(|i| KeyEntry {
                key_name: format!("key-{:02}", i),
                expiration: None,
            })
            .collect();
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        let page1 = get_keys(&conn, "ns-1", None, 0, 3, false, false, false).unwrap();
        assert_eq!(page1.len(), 3);

        let page2 = get_keys(&conn, "ns-1", None, 3, 3, false, false, false).unwrap();
        assert_eq!(page2.len(), 3);

        // Ensure different results
        assert_ne!(page1[0].key_name, page2[0].key_name);
    }

    #[test]
    fn test_delete_keys_for_namespace() {
        let conn = setup();
        let keys = vec![
            KeyEntry { key_name: "key1".to_string(), expiration: None },
            KeyEntry { key_name: "key2".to_string(), expiration: None },
        ];
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        delete_keys_for_namespace(&conn, "ns-1").unwrap();
        let count = get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_remove_stale_keys() {
        let conn = setup();
        let keys = vec![
            KeyEntry { key_name: "keep-1".to_string(), expiration: None },
            KeyEntry { key_name: "keep-2".to_string(), expiration: None },
            KeyEntry { key_name: "stale-1".to_string(), expiration: None },
            KeyEntry { key_name: "stale-2".to_string(), expiration: None },
        ];
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        let current = vec!["keep-1".to_string(), "keep-2".to_string()];
        let deleted = remove_stale_keys(&conn, "ns-1", &current).unwrap();
        assert_eq!(deleted, 2);

        let remaining = get_keys(&conn, "ns-1", None, 0, 100, false, false, false).unwrap();
        assert_eq!(remaining.len(), 2);
        assert!(remaining.iter().all(|k| k.key_name.starts_with("keep-")));
    }

    #[test]
    fn test_remove_stale_keys_empty_current_list() {
        let conn = setup();
        let keys = vec![
            KeyEntry { key_name: "key1".to_string(), expiration: None },
            KeyEntry { key_name: "key2".to_string(), expiration: None },
        ];
        upsert_keys(&conn, "ns-1", &keys).unwrap();

        let deleted = remove_stale_keys(&conn, "ns-1", &[]).unwrap();
        assert_eq!(deleted, 2);

        let count = get_key_count(&conn, "ns-1").unwrap();
        assert_eq!(count, 0);
    }
}

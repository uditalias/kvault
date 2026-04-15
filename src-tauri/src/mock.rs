//! Dev-only mock account. Seeded on app startup in debug builds so screenshots
//! and local exploration don't need a real Cloudflare account.
//!
//! In release builds the seeder is a no-op (gated on `#[cfg(debug_assertions)]`
//! from the call site in `lib.rs`). The command-layer short-circuits
//! (`is_mock_account` / `get` / `put` / `delete`) compile unconditionally so
//! the commands don't need parallel cfg arms — they just never match in release.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use rusqlite::Connection;

use crate::db::accounts::{create_account, create_namespace, get_account};
use crate::db::keys::{upsert_keys, KeyEntry};

pub const MOCK_ACCOUNT_ID: &str = "mock-dev-account";
const MOCK_CF_ACCOUNT_ID: &str = "mock-cf-00000000000000000000000000";
const MOCK_ACCOUNT_NAME: &str = "🧪 Acme Corp (mock)";

// Fixed namespace ids so DB seed is idempotent across restarts.
const NS_SESSIONS: &str = "mock-ns-sessions";
const NS_PROFILES: &str = "mock-ns-profiles";
const NS_FLAGS: &str = "mock-ns-flags";
const NS_CACHE: &str = "mock-ns-cache";

type ValueMap = HashMap<(String, String), Vec<u8>>;

fn values() -> &'static Mutex<ValueMap> {
    static VALUES: OnceLock<Mutex<ValueMap>> = OnceLock::new();
    VALUES.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn is_mock_account(account_id: &str) -> bool {
    account_id == MOCK_ACCOUNT_ID
}

pub fn is_mock_namespace(namespace_id: &str) -> bool {
    matches!(namespace_id, NS_SESSIONS | NS_PROFILES | NS_FLAGS | NS_CACHE)
}

pub fn get(namespace_id: &str, key_name: &str) -> Option<Vec<u8>> {
    values()
        .lock()
        .ok()?
        .get(&(namespace_id.to_string(), key_name.to_string()))
        .cloned()
}

pub fn put(namespace_id: &str, key_name: &str, data: Vec<u8>) {
    if let Ok(mut map) = values().lock() {
        map.insert((namespace_id.to_string(), key_name.to_string()), data);
    }
}

pub fn delete(namespace_id: &str, key_name: &str) {
    if let Ok(mut map) = values().lock() {
        map.remove(&(namespace_id.to_string(), key_name.to_string()));
    }
}

/// Remove the mock account (and cascade to namespaces/keys) if it exists.
/// Called on startup in release builds so users who previously ran a dev
/// build don't see the seeded mock account in their installed app.
pub fn purge(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM accounts WHERE id = ?1",
        rusqlite::params![MOCK_ACCOUNT_ID],
    )?;
    Ok(())
}

// ── seeding ────────────────────────────────────────────────────────────────

/// Insert the mock account/namespaces and fill the in-memory value map.
/// Idempotent: safe to call on every startup. Resets the in-memory map so
/// dev-session edits don't persist across restarts — screenshots stay clean.
pub fn seed(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Ensure account exists.
    if get_account(conn, MOCK_ACCOUNT_ID)?.is_none() {
        create_account(
            conn,
            MOCK_ACCOUNT_ID,
            MOCK_ACCOUNT_NAME,
            MOCK_CF_ACCOUNT_ID,
        )?;
    }

    // Ensure namespaces exist.
    for (id, title) in [
        (NS_SESSIONS, "sessions"),
        (NS_PROFILES, "user-profiles"),
        (NS_FLAGS, "feature-flags"),
        (NS_CACHE, "api-cache"),
    ] {
        // create_namespace errors on conflict; swallow that specific case.
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM namespaces WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            create_namespace(conn, id, MOCK_ACCOUNT_ID, title)?;
        }
    }

    // Build key entries + corresponding values.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let mut mem = values().lock().expect("mock value lock poisoned");
    mem.clear();

    // ── sessions ────────────────────────────────────────────────────────
    let mut sessions = Vec::new();
    for i in 0..180 {
        let key = format!("session:usr_{:06}", 100_000 + i);
        let exp = match i % 5 {
            0 => Some(now - 3600),       // expired 1h ago
            1 => Some(now + 60 * 15),    // 15m
            2 => Some(now + 60 * 60 * 4), // 4h
            3 => Some(now + 86400 * 2),  // 2d
            _ => Some(now + 86400 * 7),  // 7d
        };
        let v = session_json(i);
        mem.insert((NS_SESSIONS.to_string(), key.clone()), v);
        sessions.push(KeyEntry { key_name: key, expiration: exp });
    }
    upsert_keys(conn, NS_SESSIONS, &sessions)?;

    // ── user profiles ──────────────────────────────────────────────────
    let mut profiles = Vec::new();
    for i in 0..240 {
        let key = format!("user:usr_{:06}", 100_000 + i);
        let v = profile_json(i);
        mem.insert((NS_PROFILES.to_string(), key.clone()), v);
        profiles.push(KeyEntry { key_name: key, expiration: None });
    }
    // A few profiles with TTL to show mixed expirations.
    for i in 0..15 {
        let key = format!("user:trial_{:04}", i);
        let v = profile_json(9000 + i);
        mem.insert((NS_PROFILES.to_string(), key.clone()), v);
        profiles.push(KeyEntry {
            key_name: key,
            expiration: Some(now + 86400 * (i as i64 + 1)),
        });
    }
    upsert_keys(conn, NS_PROFILES, &profiles)?;

    // ── feature flags ──────────────────────────────────────────────────
    let flags_data: [(&str, &str); 14] = [
        ("flag:new-dashboard", r#"{"enabled":true,"rollout":1.0,"description":"The redesigned dashboard. Full rollout as of Q1."}"#),
        ("flag:ai-suggestions", r#"{"enabled":true,"rollout":0.5,"cohorts":["internal","beta"],"description":"Inline AI suggestions in the editor."}"#),
        ("flag:collaborative-editing", r#"{"enabled":false,"rollout":0.0,"description":"Real-time multiplayer editing. Blocked on CRDT migration."}"#),
        ("flag:dark-mode-v2", r#"{"enabled":true,"rollout":1.0,"description":"Refined dark palette with higher contrast."}"#),
        ("flag:experimental-search", r#"{"enabled":true,"rollout":0.25,"cohorts":["internal"],"description":"New search ranking with embeddings."}"#),
        ("flag:webhooks", r#"{"enabled":true,"rollout":1.0,"description":"Outbound webhooks for account events."}"#),
        ("flag:bulk-import", r#"{"enabled":true,"rollout":1.0,"description":"CSV/JSON bulk import with preview."}"#),
        ("flag:team-seats", r#"{"enabled":false,"rollout":0.0,"description":"Multi-seat team plans. Pending pricing decision."}"#),
        ("flag:audit-log", r#"{"enabled":true,"rollout":0.8,"cohorts":["enterprise"],"description":"Per-account audit trail."}"#),
        ("flag:2fa-required", r#"{"enabled":true,"rollout":1.0,"description":"Enforce 2FA for admins."}"#),
        ("flag:api-v3", r#"{"enabled":false,"rollout":0.05,"cohorts":["internal"],"description":"New REST API shape. Not public yet."}"#),
        ("flag:sso-saml", r#"{"enabled":true,"rollout":1.0,"cohorts":["enterprise"],"description":"SAML-based single sign-on."}"#),
        ("flag:usage-based-billing", r#"{"enabled":false,"rollout":0.0,"description":"Pay-per-request billing. Design in progress."}"#),
        ("flag:mobile-push", r#"{"enabled":true,"rollout":0.75,"description":"iOS/Android push notifications."}"#),
    ];
    let mut flags = Vec::new();
    for (key, val) in flags_data.iter() {
        mem.insert((NS_FLAGS.to_string(), key.to_string()), val.as_bytes().to_vec());
        flags.push(KeyEntry { key_name: key.to_string(), expiration: None });
    }
    upsert_keys(conn, NS_FLAGS, &flags)?;

    // ── api cache ──────────────────────────────────────────────────────
    let mut cache = Vec::new();
    // Hot product cache entries (JSON).
    for i in 0..60 {
        let key = format!("cache:products:sku-{:05}", 1000 + i);
        let v = product_json(i);
        mem.insert((NS_CACHE.to_string(), key.clone()), v);
        cache.push(KeyEntry {
            key_name: key,
            expiration: Some(now + 60 * (10 + (i as i64 * 3) % 50)), // 10–60 min
        });
    }
    // Rate-limit counters (short TTL, plain-text integers).
    for i in 0..40 {
        let key = format!("cache:ratelimit:ip_203.0.113.{}", i);
        let v = format!("{}", 1 + (i * 7) % 30).into_bytes();
        mem.insert((NS_CACHE.to_string(), key.clone()), v);
        cache.push(KeyEntry {
            key_name: key,
            expiration: Some(now + 60), // 1 min
        });
    }
    // A couple of binary entries so the hex viewer has something to show.
    mem.insert(
        (NS_CACHE.to_string(), "cache:avatar:usr_100042.png".to_string()),
        fake_png(),
    );
    cache.push(KeyEntry {
        key_name: "cache:avatar:usr_100042.png".to_string(),
        expiration: Some(now + 86400),
    });
    mem.insert(
        (NS_CACHE.to_string(), "cache:avatar:usr_100101.png".to_string()),
        fake_png(),
    );
    cache.push(KeyEntry {
        key_name: "cache:avatar:usr_100101.png".to_string(),
        expiration: Some(now + 86400 * 3),
    });
    // A plain-text entry.
    mem.insert(
        (NS_CACHE.to_string(), "cache:health:last-ping".to_string()),
        b"ok 2026-04-14T05:42:11Z".to_vec(),
    );
    cache.push(KeyEntry {
        key_name: "cache:health:last-ping".to_string(),
        expiration: Some(now + 30),
    });

    upsert_keys(conn, NS_CACHE, &cache)?;

    // Record idle sync state so the UI doesn't show "never synced".
    for ns in [NS_SESSIONS, NS_PROFILES, NS_FLAGS, NS_CACHE] {
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM kv_keys WHERE namespace_id = ?1",
            rusqlite::params![ns],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO sync_state (namespace_id, last_synced_at, total_keys, status)
             VALUES (?1, datetime('now'), ?2, 'idle')
             ON CONFLICT(namespace_id) DO UPDATE SET
                last_synced_at = datetime('now'),
                total_keys = ?2,
                status = 'idle'",
            rusqlite::params![ns, total],
        )?;
    }

    Ok(())
}

// ── data generators ────────────────────────────────────────────────────────

fn session_json(i: usize) -> Vec<u8> {
    let agents = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    ];
    let regions = ["sfo", "iad", "lhr", "fra", "nrt", "syd"];
    let json = format!(
        r#"{{
  "user_id": "usr_{uid}",
  "created_at": "2026-04-{day:02}T{hour:02}:{minute:02}:00Z",
  "last_seen_at": "2026-04-14T05:{minute:02}:33Z",
  "ip": "203.0.113.{ipl}",
  "region": "{region}",
  "user_agent": "{ua}",
  "csrf_token": "{csrf}",
  "scopes": ["read:account", "write:kv", "read:analytics"]
}}"#,
        uid = 100_000 + i,
        day = 1 + (i % 13),
        hour = i % 24,
        minute = (i * 7) % 60,
        ipl = i % 255,
        region = regions[i % regions.len()],
        ua = agents[i % agents.len()],
        csrf = fake_token(i, 32),
    );
    json.into_bytes()
}

fn profile_json(i: usize) -> Vec<u8> {
    let first = ["Alice", "Ben", "Carla", "Dmitri", "Eve", "Farid", "Gwen", "Hiro", "Iris", "Juno"];
    let last = ["Chen", "Okafor", "Ramos", "Volkov", "Martin", "Khan", "Fischer", "Tanaka", "Costa", "Park"];
    let roles = ["admin", "editor", "viewer", "owner"];
    let plans = ["free", "pro", "team", "enterprise"];
    let f = first[i % first.len()];
    let l = last[(i * 3) % last.len()];
    let json = format!(
        r#"{{
  "id": "usr_{uid}",
  "name": "{f} {l}",
  "email": "{fl}@example.com",
  "role": "{role}",
  "plan": "{plan}",
  "joined_at": "2025-{month:02}-{day:02}T09:14:00Z",
  "preferences": {{
    "theme": "{theme}",
    "timezone": "{tz}",
    "notifications": {{ "email": true, "push": {push} }}
  }},
  "quota": {{ "requests_per_day": {quota}, "used_today": {used} }}
}}"#,
        uid = 100_000 + i,
        f = f,
        l = l,
        fl = {
            let mut s = String::with_capacity(f.len() + l.len() + 1);
            s.push_str(f);
            s.push('.');
            s.push_str(l);
            s.make_ascii_lowercase();
            s
        },
        role = roles[i % roles.len()],
        plan = plans[(i / 3) % plans.len()],
        month = 1 + (i % 11),
        day = 1 + (i % 27),
        theme = if i.is_multiple_of(2) { "dark" } else { "light" },
        tz = ["America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Europe/Berlin"][i % 4],
        push = !i.is_multiple_of(3),
        quota = 10_000 * (1 + (i % 5) as i64),
        used = ((i * 47) % 9000) as i64,
    );
    json.into_bytes()
}

fn product_json(i: usize) -> Vec<u8> {
    let categories = ["electronics", "apparel", "home", "books", "outdoors"];
    let rating = 3.0 + (i as f32 * 0.13).fract() * 2.0;
    let json = format!(
        r#"{{
  "sku": "sku-{sku:05}",
  "name": "Product {sku:05}",
  "category": "{cat}",
  "price_cents": {price},
  "currency": "USD",
  "in_stock": {stock},
  "rating": {rating:.1}
}}"#,
        sku = 1000 + i,
        cat = categories[i % categories.len()],
        price = 1999 + (i as i64 * 137) % 20_000,
        stock = !i.is_multiple_of(4),
    );
    json.into_bytes()
}

fn fake_token(seed: usize, len: usize) -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut s = String::with_capacity(len);
    let mut x = (seed as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    for _ in 0..len {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        s.push(CHARSET[(x >> 32) as usize % CHARSET.len()] as char);
    }
    s
}

/// Minimal PNG header + random-ish body so the hex viewer shows something
/// recognizable. Not a valid PNG image — intentionally; we want to show the
/// binary/hex code path, not render an image.
fn fake_png() -> Vec<u8> {
    let mut v = Vec::with_capacity(512);
    // PNG magic
    v.extend_from_slice(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    // IHDR-ish pattern + random-ish bytes
    for i in 0..504u16 {
        v.push(((i.wrapping_mul(31)) ^ 0xA5) as u8);
    }
    v
}

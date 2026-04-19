use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CfApiResponse<T> {
    pub success: bool,
    pub errors: Vec<CfApiError>,
    pub result: Option<T>,
    pub result_info: Option<ResultInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CfApiError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResultInfo {
    pub count: Option<i64>,
    pub cursor: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub total_count: Option<i64>,
    pub total_pages: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CfNamespace {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CfKey {
    pub name: String,
    pub expiration: Option<i64>,
}

/// A key returned by list with full fidelity (includes metadata) for the
/// playground runtime. The Cloudflare list endpoint returns metadata per-key
/// when present; this type exposes it without flattening it away.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfKeyFull {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Matches the shape of `KVNamespace.list()` in the Workers binding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListKeysResponse {
    pub keys: Vec<CfKeyFull>,
    pub list_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// Options for `put_value_with_options` — mirrors the Workers binding's
/// `KVNamespacePutOptions` shape.
#[derive(Debug, Clone, Default)]
pub struct PutOptions {
    pub expiration: Option<i64>,
    pub expiration_ttl: Option<i64>,
    pub metadata: Option<serde_json::Value>,
}

/// Value + metadata pair, used by `get_with_metadata`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueWithMetadata {
    pub value: Vec<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CfTokenVerify {
    pub id: String,
    pub status: String,
}

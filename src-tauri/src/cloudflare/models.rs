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

#[derive(Debug, Serialize, Deserialize)]
pub struct CfTokenVerify {
    pub id: String,
    pub status: String,
}

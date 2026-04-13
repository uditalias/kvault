use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::StatusCode;

/// Characters that must be percent-encoded in URL path segments.
/// This encodes everything that is not unreserved (RFC 3986) or a sub-delimiter,
/// plus '/' which is significant in paths.
const PATH_SEGMENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'/')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

use super::error::CloudflareError;
use super::models::*;

const DEFAULT_BASE_URL: &str = "https://api.cloudflare.com/client/v4";

pub struct CloudflareClient {
    http: reqwest::Client,
    api_token: String,
    account_id: String,
    base_url: String,
}

impl CloudflareClient {
    pub fn new(api_token: String, account_id: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_token,
            account_id,
            base_url: DEFAULT_BASE_URL.to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_base_url(api_token: String, account_id: String, base_url: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            api_token,
            account_id,
            base_url,
        }
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.api_token)
    }

    async fn check_status_errors(&self, status: StatusCode) -> Result<(), CloudflareError> {
        if status == StatusCode::UNAUTHORIZED {
            return Err(CloudflareError::InvalidToken);
        }
        if status == StatusCode::TOO_MANY_REQUESTS {
            return Err(CloudflareError::RateLimited);
        }
        Ok(())
    }

    pub async fn verify_token(&self) -> Result<CfTokenVerify, CloudflareError> {
        let url = format!(
            "{}/accounts/{}/tokens/verify",
            self.base_url, self.account_id
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.check_status_errors(resp.status()).await?;

        let body: CfApiResponse<CfTokenVerify> = resp.json().await?;
        if !body.success {
            if let Some(err) = body.errors.first() {
                return Err(CloudflareError::Api {
                    code: err.code,
                    message: err.message.clone(),
                });
            }
        }
        body.result.ok_or(CloudflareError::Api {
            code: 0,
            message: "No result in response".to_string(),
        })
    }

    pub async fn list_namespaces(&self) -> Result<Vec<CfNamespace>, CloudflareError> {
        let mut all_namespaces = Vec::new();
        let mut page = 1u32;
        let per_page = 50u32;

        loop {
            let url = format!(
                "{}/accounts/{}/storage/kv/namespaces",
                self.base_url, self.account_id
            );
            let resp = self
                .http
                .get(&url)
                .header("Authorization", self.auth_header())
                .query(&[("page", page.to_string()), ("per_page", per_page.to_string())])
                .send()
                .await?;

            self.check_status_errors(resp.status()).await?;

            let body: CfApiResponse<Vec<CfNamespace>> = resp.json().await?;
            if !body.success {
                if let Some(err) = body.errors.first() {
                    return Err(CloudflareError::Api {
                        code: err.code,
                        message: err.message.clone(),
                    });
                }
            }

            if let Some(namespaces) = body.result {
                let count = namespaces.len();
                all_namespaces.extend(namespaces);

                // Check if we got fewer results than per_page, meaning last page
                if (count as u32) < per_page {
                    break;
                }

                // Also check result_info for total_pages
                if let Some(info) = &body.result_info {
                    if let (Some(total_pages), _) = (info.total_pages, info.page) {
                        if (page as i64) >= total_pages {
                            break;
                        }
                    }
                }

                page += 1;
            } else {
                break;
            }
        }

        Ok(all_namespaces)
    }

    pub async fn list_keys(
        &self,
        namespace_id: &str,
        cursor: Option<&str>,
        limit: u32,
    ) -> Result<(Vec<CfKey>, Option<String>), CloudflareError> {
        let url = format!(
            "{}/accounts/{}/storage/kv/namespaces/{}/keys",
            self.base_url, self.account_id, namespace_id
        );

        let mut request = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .query(&[("limit", limit.to_string())]);

        if let Some(cursor_val) = cursor {
            request = request.query(&[("cursor", cursor_val)]);
        }

        let resp = request.send().await?;
        self.check_status_errors(resp.status()).await?;

        let body: CfApiResponse<Vec<CfKey>> = resp.json().await?;
        if !body.success {
            if let Some(err) = body.errors.first() {
                return Err(CloudflareError::Api {
                    code: err.code,
                    message: err.message.clone(),
                });
            }
        }

        let keys = body.result.unwrap_or_default();
        let next_cursor = body.result_info.and_then(|info| {
            info.cursor
                .filter(|c| !c.is_empty())
        });

        Ok((keys, next_cursor))
    }

    pub async fn get_value(
        &self,
        namespace_id: &str,
        key_name: &str,
    ) -> Result<Vec<u8>, CloudflareError> {
        let url = format!(
            "{}/accounts/{}/storage/kv/namespaces/{}/values/{}",
            self.base_url, self.account_id, namespace_id,
            utf8_percent_encode(key_name, PATH_SEGMENT_ENCODE_SET)
        );

        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.check_status_errors(resp.status()).await?;

        let status = resp.status();
        if !status.is_success() {
            // Try to parse error body
            if let Ok(body) = resp.json::<CfApiResponse<serde_json::Value>>().await {
                if let Some(err) = body.errors.first() {
                    return Err(CloudflareError::Api {
                        code: err.code,
                        message: err.message.clone(),
                    });
                }
            }
            return Err(CloudflareError::Api {
                code: status.as_u16() as i32,
                message: format!("HTTP {}", status),
            });
        }

        Ok(resp.bytes().await?.to_vec())
    }

    pub async fn put_value(
        &self,
        namespace_id: &str,
        key_name: &str,
        value: &[u8],
        expiration_ttl: Option<i64>,
    ) -> Result<(), CloudflareError> {
        let url = format!(
            "{}/accounts/{}/storage/kv/namespaces/{}/values/{}",
            self.base_url, self.account_id, namespace_id,
            utf8_percent_encode(key_name, PATH_SEGMENT_ENCODE_SET)
        );

        let mut request = self
            .http
            .put(&url)
            .header("Authorization", self.auth_header())
            .body(value.to_vec());

        if let Some(ttl) = expiration_ttl {
            request = request.query(&[("expiration_ttl", ttl.to_string())]);
        }

        let resp = request.send().await?;
        self.check_status_errors(resp.status()).await?;

        let body: CfApiResponse<serde_json::Value> = resp.json().await?;
        if !body.success {
            if let Some(err) = body.errors.first() {
                return Err(CloudflareError::Api {
                    code: err.code,
                    message: err.message.clone(),
                });
            }
        }

        Ok(())
    }

    pub async fn delete_key(
        &self,
        namespace_id: &str,
        key_name: &str,
    ) -> Result<(), CloudflareError> {
        let url = format!(
            "{}/accounts/{}/storage/kv/namespaces/{}/values/{}",
            self.base_url, self.account_id, namespace_id,
            utf8_percent_encode(key_name, PATH_SEGMENT_ENCODE_SET)
        );

        let resp = self
            .http
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        self.check_status_errors(resp.status()).await?;

        let body: CfApiResponse<serde_json::Value> = resp.json().await?;
        if !body.success {
            if let Some(err) = body.errors.first() {
                return Err(CloudflareError::Api {
                    code: err.code,
                    message: err.message.clone(),
                });
            }
        }

        Ok(())
    }

    pub async fn delete_keys(
        &self,
        namespace_id: &str,
        key_names: Vec<String>,
    ) -> Result<(), CloudflareError> {
        let url = format!(
            "{}/accounts/{}/storage/kv/namespaces/{}/bulk",
            self.base_url, self.account_id, namespace_id
        );

        // Batch in chunks of 10000
        for chunk in key_names.chunks(10000) {
            let resp = self
                .http
                .delete(&url)
                .header("Authorization", self.auth_header())
                .json(&chunk)
                .send()
                .await?;

            self.check_status_errors(resp.status()).await?;

            let body: CfApiResponse<serde_json::Value> = resp.json().await?;
            if !body.success {
                if let Some(err) = body.errors.first() {
                    return Err(CloudflareError::Api {
                        code: err.code,
                        message: err.message.clone(),
                    });
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn success_response<T: serde::Serialize>(result: T) -> String {
        serde_json::json!({
            "success": true,
            "errors": [],
            "result": result,
            "result_info": null
        })
        .to_string()
    }

    fn success_response_with_info<T: serde::Serialize>(
        result: T,
        result_info: serde_json::Value,
    ) -> String {
        serde_json::json!({
            "success": true,
            "errors": [],
            "result": result,
            "result_info": result_info
        })
        .to_string()
    }

    fn error_response(code: i32, message: &str) -> String {
        serde_json::json!({
            "success": false,
            "errors": [{"code": code, "message": message}],
            "result": null,
            "result_info": null
        })
        .to_string()
    }

    fn make_client(base_url: &str) -> CloudflareClient {
        CloudflareClient::with_base_url(
            "test-token".to_string(),
            "test-account".to_string(),
            base_url.to_string(),
        )
    }

    #[tokio::test]
    async fn test_verify_token_valid() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/user/tokens/verify")
            .match_header("Authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response(serde_json::json!({
                "id": "token-id-123",
                "status": "active"
            })))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.verify_token().await.unwrap();

        assert_eq!(result.id, "token-id-123");
        assert_eq!(result.status, "active");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_verify_token_invalid() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/user/tokens/verify")
            .with_status(401)
            .with_header("content-type", "application/json")
            .with_body(error_response(1000, "Invalid API Token"))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.verify_token().await;

        assert!(matches!(result, Err(CloudflareError::InvalidToken)));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_namespaces_single_page() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/accounts/test-account/storage/kv/namespaces")
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("page".into(), "1".into()),
                mockito::Matcher::UrlEncoded("per_page".into(), "50".into()),
            ]))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response_with_info(
                serde_json::json!([
                    {"id": "ns1", "title": "Namespace 1"},
                    {"id": "ns2", "title": "Namespace 2"}
                ]),
                serde_json::json!({"page": 1, "per_page": 50, "total_pages": 1, "total_count": 2}),
            ))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let namespaces = client.list_namespaces().await.unwrap();

        assert_eq!(namespaces.len(), 2);
        assert_eq!(namespaces[0].id, "ns1");
        assert_eq!(namespaces[1].title, "Namespace 2");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_namespaces_multi_page() {
        let mut server = mockito::Server::new_async().await;

        // Build a full page of 50 namespaces for page 1
        let page1: Vec<serde_json::Value> = (0..50)
            .map(|i| {
                serde_json::json!({
                    "id": format!("ns{}", i),
                    "title": format!("Namespace {}", i)
                })
            })
            .collect();

        let mock1 = server
            .mock("GET", "/accounts/test-account/storage/kv/namespaces")
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("page".into(), "1".into()),
                mockito::Matcher::UrlEncoded("per_page".into(), "50".into()),
            ]))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response_with_info(
                serde_json::json!(page1),
                serde_json::json!({"page": 1, "per_page": 50, "total_pages": 2, "total_count": 52}),
            ))
            .create_async()
            .await;

        let mock2 = server
            .mock("GET", "/accounts/test-account/storage/kv/namespaces")
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("page".into(), "2".into()),
                mockito::Matcher::UrlEncoded("per_page".into(), "50".into()),
            ]))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response_with_info(
                serde_json::json!([
                    {"id": "ns50", "title": "Namespace 50"},
                    {"id": "ns51", "title": "Namespace 51"}
                ]),
                serde_json::json!({"page": 2, "per_page": 50, "total_pages": 2, "total_count": 52}),
            ))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let namespaces = client.list_namespaces().await.unwrap();

        assert_eq!(namespaces.len(), 52);
        assert_eq!(namespaces[0].id, "ns0");
        assert_eq!(namespaces[51].id, "ns51");
        mock1.assert_async().await;
        mock2.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_keys_with_cursor() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "GET",
                "/accounts/test-account/storage/kv/namespaces/ns1/keys",
            )
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("limit".into(), "10".into()),
            ]))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response_with_info(
                serde_json::json!([
                    {"name": "key1", "expiration": 1234567890},
                    {"name": "key2", "expiration": null}
                ]),
                serde_json::json!({"cursor": "next-cursor-abc", "count": 2}),
            ))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let (keys, next_cursor) = client.list_keys("ns1", None, 10).await.unwrap();

        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].name, "key1");
        assert_eq!(keys[0].expiration, Some(1234567890));
        assert_eq!(keys[1].name, "key2");
        assert_eq!(keys[1].expiration, None);
        assert_eq!(next_cursor, Some("next-cursor-abc".to_string()));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_keys_with_cursor_param() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "GET",
                "/accounts/test-account/storage/kv/namespaces/ns1/keys",
            )
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("limit".into(), "10".into()),
                mockito::Matcher::UrlEncoded("cursor".into(), "prev-cursor".into()),
            ]))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response_with_info(
                serde_json::json!([{"name": "key3"}]),
                serde_json::json!({"cursor": "", "count": 1}),
            ))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let (keys, next_cursor) = client
            .list_keys("ns1", Some("prev-cursor"), 10)
            .await
            .unwrap();

        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].name, "key3");
        assert_eq!(next_cursor, None); // empty cursor means no more pages
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_get_value() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "GET",
                "/accounts/test-account/storage/kv/namespaces/ns1/values/my-key",
            )
            .match_header("Authorization", "Bearer test-token")
            .with_status(200)
            .with_body("hello world")
            .create_async()
            .await;

        let client = make_client(&server.url());
        let value = client.get_value("ns1", "my-key").await.unwrap();

        assert_eq!(value, b"hello world");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_get_value_binary() {
        let mut server = mockito::Server::new_async().await;
        let binary_data: Vec<u8> = vec![0x00, 0x01, 0x02, 0xFF, 0xFE];
        let mock = server
            .mock(
                "GET",
                "/accounts/test-account/storage/kv/namespaces/ns1/values/bin-key",
            )
            .with_status(200)
            .with_body(binary_data.clone())
            .create_async()
            .await;

        let client = make_client(&server.url());
        let value = client.get_value("ns1", "bin-key").await.unwrap();

        assert_eq!(value, binary_data);
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_put_value() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "PUT",
                "/accounts/test-account/storage/kv/namespaces/ns1/values/my-key",
            )
            .match_header("Authorization", "Bearer test-token")
            .match_body("test-value")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response(serde_json::json!(null)))
            .create_async()
            .await;

        let client = make_client(&server.url());
        client
            .put_value("ns1", "my-key", b"test-value", None)
            .await
            .unwrap();

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_put_value_with_ttl() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "PUT",
                "/accounts/test-account/storage/kv/namespaces/ns1/values/my-key",
            )
            .match_query(mockito::Matcher::UrlEncoded(
                "expiration_ttl".into(),
                "3600".into(),
            ))
            .match_header("Authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response(serde_json::json!(null)))
            .create_async()
            .await;

        let client = make_client(&server.url());
        client
            .put_value("ns1", "my-key", b"test-value", Some(3600))
            .await
            .unwrap();

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_delete_key() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "DELETE",
                "/accounts/test-account/storage/kv/namespaces/ns1/values/my-key",
            )
            .match_header("Authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response(serde_json::json!(null)))
            .create_async()
            .await;

        let client = make_client(&server.url());
        client.delete_key("ns1", "my-key").await.unwrap();

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_delete_keys_bulk() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "DELETE",
                "/accounts/test-account/storage/kv/namespaces/ns1/bulk",
            )
            .match_header("Authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(success_response(serde_json::json!(null)))
            .create_async()
            .await;

        let client = make_client(&server.url());
        client
            .delete_keys("ns1", vec!["key1".into(), "key2".into(), "key3".into()])
            .await
            .unwrap();

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_error_401_invalid_token() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/user/tokens/verify")
            .with_status(401)
            .with_header("content-type", "application/json")
            .with_body(error_response(1000, "Invalid API Token"))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.verify_token().await;

        assert!(matches!(result, Err(CloudflareError::InvalidToken)));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_error_429_rate_limited() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/user/tokens/verify")
            .with_status(429)
            .with_header("content-type", "application/json")
            .with_body(error_response(1015, "Rate limited"))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.verify_token().await;

        assert!(matches!(result, Err(CloudflareError::RateLimited)));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_error_500_api_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock(
                "GET",
                "/accounts/test-account/storage/kv/namespaces",
            )
            .match_query(mockito::Matcher::Any)
            .with_status(200) // CF sometimes returns 200 with success: false
            .with_header("content-type", "application/json")
            .with_body(error_response(5000, "Internal server error"))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.list_namespaces().await;

        match result {
            Err(CloudflareError::Api { code, message }) => {
                assert_eq!(code, 5000);
                assert_eq!(message, "Internal server error");
            }
            other => panic!("Expected Api error, got: {:?}", other),
        }
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_list_namespaces_401() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/accounts/test-account/storage/kv/namespaces")
            .match_query(mockito::Matcher::Any)
            .with_status(401)
            .with_header("content-type", "application/json")
            .with_body(error_response(1000, "Invalid API Token"))
            .create_async()
            .await;

        let client = make_client(&server.url());
        let result = client.list_namespaces().await;

        assert!(matches!(result, Err(CloudflareError::InvalidToken)));
        mock.assert_async().await;
    }
}

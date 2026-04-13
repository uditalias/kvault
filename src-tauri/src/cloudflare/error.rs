use std::fmt;

#[derive(Debug)]
pub enum CloudflareError {
    Http(reqwest::Error),
    Api { code: i32, message: String },
    InvalidToken,
    RateLimited,
}

impl fmt::Display for CloudflareError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CloudflareError::Http(e) => write!(f, "HTTP error: {}", e),
            CloudflareError::Api { code, message } => {
                write!(f, "API error: {} — {}", code, message)
            }
            CloudflareError::InvalidToken => write!(f, "Invalid token"),
            CloudflareError::RateLimited => write!(f, "Rate limited"),
        }
    }
}

impl std::error::Error for CloudflareError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CloudflareError::Http(e) => Some(e),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for CloudflareError {
    fn from(err: reqwest::Error) -> Self {
        CloudflareError::Http(err)
    }
}

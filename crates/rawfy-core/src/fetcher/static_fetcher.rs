//! Rawfy — Static HTTP fetcher
//!
//! Tier 1 fetch using reqwest with gzip/brotli decompression, follow redirects (max 5),
//! 15s default timeout, realistic modern User-Agent, and RAWFY_PROXY support.

use crate::types::{FetchMethod, FetchResult, RawfyError, RawfyOptions};
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Default timeout for static fetches (15 seconds)
pub const DEFAULT_TIMEOUT_MS: u64 = 15_000;

/// Maximum number of redirects to follow
pub const MAX_REDIRECTS: usize = 5;

/// Modern realistic macOS Chrome browser User-Agent
pub const DEFAULT_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

/// Build a configured `reqwest::Client` with decompression, redirect policies, and optional proxy.
pub fn build_client(
    timeout_ms: u64,
    proxy_url: Option<&str>,
) -> Result<reqwest::Client, RawfyError> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .gzip(true)
        .brotli(true);

    if let Some(proxy_str) = proxy_url {
        let trimmed = proxy_str.trim();
        if !trimmed.is_empty() {
            let proxy = reqwest::Proxy::all(trimmed).map_err(|e| RawfyError::FetchFailed {
                message: format!("Invalid proxy configuration in RAWFY_PROXY: {}", e),
                url: None,
            })?;
            builder = builder.proxy(proxy);
        }
    }

    builder.build().map_err(|e| RawfyError::FetchFailed {
        message: format!("Failed to build HTTP client: {}", e),
        url: None,
    })
}

/// Fetch a URL using static HTTP request.
///
/// - Validates URL (http/https only)
/// - Decompresses gzip and brotli payloads
/// - Follows up to 5 redirects
/// - Enforces timeout (default 15s or from options)
/// - Sets realistic modern User-Agent header
/// - Supports RAWFY_PROXY environment variable
/// - Maps errors to `RawfyError::InvalidUrl`, `RawfyError::FetchTimeout`, `RawfyError::FetchFailed`
pub async fn fetch_static(
    url: &str,
    options: Option<&RawfyOptions>,
) -> Result<FetchResult, RawfyError> {
    // 1. Validate URL upfront
    let parsed_url = match url::Url::parse(url) {
        Ok(u) => u,
        Err(e) => {
            return Err(RawfyError::InvalidUrl {
                message: format!("Invalid URL: {}: {}", url, e),
                url: Some(url.to_string()),
            });
        }
    };

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(RawfyError::InvalidUrl {
            message: format!("Unsupported protocol: {}", parsed_url.scheme()),
            url: Some(url.to_string()),
        });
    }

    let timeout_ms = options
        .and_then(|o| o.timeout_ms)
        .unwrap_or(DEFAULT_TIMEOUT_MS);

    let proxy_env = std::env::var("RAWFY_PROXY").ok();
    let client = build_client(timeout_ms, proxy_env.as_deref())?;

    let start = Instant::now();

    let request = client
        .get(parsed_url.clone())
        .header(reqwest::header::USER_AGENT, DEFAULT_USER_AGENT)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(reqwest::header::ACCEPT_ENCODING, "gzip, deflate, br");

    let response = match request.send().await {
        Ok(resp) => resp,
        Err(err) => {
            if err.is_timeout() {
                return Err(RawfyError::FetchTimeout {
                    message: format!("Request to {} timed out after {}ms", url, timeout_ms),
                    url: Some(url.to_string()),
                });
            }
            return Err(RawfyError::FetchFailed {
                message: err.to_string(),
                url: Some(url.to_string()),
            });
        }
    };

    let status = response.status();
    if !status.is_success() {
        let status_code = status.as_u16();
        let reason = status.canonical_reason().unwrap_or("");
        return Err(RawfyError::FetchFailed {
            message: format!("HTTP {} {}", status_code, reason).trim().to_string(),
            url: Some(url.to_string()),
        });
    }

    let final_url = response.url().to_string();

    let mut headers = HashMap::new();
    for (name, val) in response.headers() {
        if let Ok(v) = val.to_str() {
            headers.insert(name.as_str().to_lowercase(), v.to_string());
        }
    }

    let html = match response.text().await {
        Ok(text) => text,
        Err(err) => {
            if err.is_timeout() {
                return Err(RawfyError::FetchTimeout {
                    message: format!(
                        "Reading response body from {} timed out after {}ms",
                        url, timeout_ms
                    ),
                    url: Some(url.to_string()),
                });
            }
            return Err(RawfyError::FetchFailed {
                message: format!("Failed to read response body: {}", err),
                url: Some(url.to_string()),
            });
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(FetchResult {
        html,
        final_url,
        headers,
        method: FetchMethod::Static,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_invalid_url() {
        let result = fetch_static("not-a-valid-url", None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            RawfyError::InvalidUrl { url, .. } => {
                assert_eq!(url, Some("not-a-valid-url".to_string()));
            }
            err => panic!("Expected InvalidUrl error, got {:?}", err),
        }
    }

    #[tokio::test]
    async fn test_unsupported_protocol() {
        let result = fetch_static("ftp://ftp.example.com/file.txt", None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            RawfyError::InvalidUrl { message, .. } => {
                assert!(message.contains("Unsupported protocol: ftp"));
            }
            err => panic!("Expected InvalidUrl error, got {:?}", err),
        }
    }

    #[test]
    fn test_client_builder_defaults() {
        let client = build_client(DEFAULT_TIMEOUT_MS, None);
        assert!(client.is_ok());
    }

    #[test]
    fn test_client_builder_with_proxy() {
        let client = build_client(5000, Some("http://127.0.0.1:8080"));
        assert!(client.is_ok());
    }
}

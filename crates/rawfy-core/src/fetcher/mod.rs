//! Rawfy — Fetcher Module
//!
//! Provides static HTTP fetching with reqwest and intelligent JavaScript-rendering detection.
//! Unified `fetch_page` entry point coordinates between static fetch and client-side rendering detection.

pub mod detector;
pub mod static_fetcher;

pub use detector::{
    detect_needs_playwright, extract_text_length, has_high_script_density, has_noscript_warning,
    is_app_shell, is_empty_body, DetectionResult, MIN_BODY_TEXT_LENGTH,
};
pub use static_fetcher::{
    build_client, fetch_static, DEFAULT_TIMEOUT_MS, DEFAULT_USER_AGENT, MAX_REDIRECTS,
};

use crate::types::{FetchResult, RawfyError, RawfyOptions};

/// Normalizes a user-supplied URL.
/// If the URL lacks a scheme but looks like a domain (contains '.' or starts with 'localhost'),
/// 'https://' is automatically prepended.
pub fn normalize_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if !trimmed.contains("://") && !trimmed.starts_with("//") {
        if trimmed.starts_with("localhost") || trimmed.contains('.') {
            format!("https://{}", trimmed)
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    }
}

/// Unified fetch page router.
///
/// 1. Validates the URL upfront (protocol must be http or https).
/// 2. Performs static HTTP fetch via `fetch_static`.
/// 3. If `no_playwright` is set, returns the static result immediately.
/// 4. Analyzes the fetched HTML using `detect_needs_playwright`.
/// 5. If JS rendering is needed (or forced) and a headless browser engine is not
///    configured, falls back gracefully to the static result.
///
/// Returns `FetchResult` or `RawfyError`.
pub async fn fetch_page(url: &str, options: &RawfyOptions) -> Result<FetchResult, RawfyError> {
    let normalized = normalize_url(url);

    // 1. Validate URL upfront
    let parsed = url::Url::parse(&normalized).map_err(|e| RawfyError::InvalidUrl {
        message: format!("Invalid URL: {}: {}", url, e),
        url: Some(url.to_string()),
    })?;

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(RawfyError::InvalidUrl {
            message: format!("Unsupported protocol: {}", parsed.scheme()),
            url: Some(url.to_string()),
        });
    }

    // 2. Perform static fetch
    let static_result = fetch_static(&normalized, Some(options)).await?;

    // 3. If Playwright is explicitly disabled, return static result directly
    if options.no_playwright {
        return Ok(static_result);
    }

    // 4. Run JS-rendering detection
    let detection = detect_needs_playwright(&static_result.html);

    if !detection.needs_playwright && !options.force_playwright {
        return Ok(static_result);
    }

    // 5. In headless core without separate browser runner process, return static result
    // (a partial static result is better than failing completely)
    Ok(static_result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_page_invalid_url() {
        let opts = RawfyOptions::default();
        let result = fetch_page("invalid-url-here", &opts).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            RawfyError::InvalidUrl { url, .. } => {
                assert_eq!(url, Some("invalid-url-here".to_string()));
            }
            err => panic!("Expected InvalidUrl error, got {:?}", err),
        }
    }

    #[tokio::test]
    async fn test_fetch_page_unsupported_protocol() {
        let opts = RawfyOptions::default();
        let result = fetch_page("file:///etc/passwd", &opts).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            RawfyError::InvalidUrl { message, .. } => {
                assert!(message.contains("Unsupported protocol: file"));
            }
            err => panic!("Expected InvalidUrl error, got {:?}", err),
        }
    }
}

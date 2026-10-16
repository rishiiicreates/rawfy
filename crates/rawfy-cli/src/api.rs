use axum::{
    extract::Query,
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rawfy_core::{
    output::{serialize_json, serialize_text, serialize_wsm},
    types::{OutputFormat, RawfyOptions},
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize)]
pub struct FetchQuery {
    pub url: Option<String>,
    pub format: Option<String>,
    pub vision: Option<bool>,
    pub no_playwright: Option<bool>,
    pub max_tokens: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct MetadataQuery {
    pub url: Option<String>,
    pub no_playwright: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MetadataBody {
    pub url: String,
    pub no_playwright: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct FetchBody {
    pub url: String,
    pub format: Option<String>,
    pub vision: Option<bool>,
    pub vision_provider: Option<String>,
    pub vision_model: Option<String>,
    pub no_playwright: Option<bool>,
    pub max_tokens: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct ExtractBody {
    pub url: Option<String>,
    pub html: Option<String>,
    pub format: Option<String>,
    pub vision: Option<bool>,
    pub vision_provider: Option<String>,
    pub vision_model: Option<String>,
    pub no_playwright: Option<bool>,
    pub max_tokens: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ExtractResponse {
    pub url: String,
    pub title: Option<String>,
    pub content: String,
    pub metadata: rawfy_core::types::PageMetadata,
    pub interactive_elements: Vec<rawfy_core::types::InteractiveElement>,
    pub links: Vec<LinkInfo>,
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct LinkInfo {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

pub fn create_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/version", get(version_handler))
        .route("/fetch", get(fetch_get_handler).post(fetch_post_handler))
        .route("/metadata", get(metadata_handler).post(metadata_post_handler))
        .route("/extract", post(extract_handler))
        .layer(cors)
}

fn error_to_response(err: rawfy_core::types::RawfyError, default_code: &str, url: Option<String>) -> Response {
    let status = match &err {
        rawfy_core::types::RawfyError::InvalidUrl { .. } => StatusCode::BAD_REQUEST,
        rawfy_core::types::RawfyError::FetchTimeout { .. } => StatusCode::GATEWAY_TIMEOUT,
        rawfy_core::types::RawfyError::FetchFailed { message, .. } => {
            if message.contains("404") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::BAD_GATEWAY
            }
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    (
        status,
        Json(ErrorResponse {
            error: default_code.to_string(),
            message: err.to_string(),
            url,
        }),
    )
        .into_response()
}

pub async fn start_api_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("🚀 Rawfy API server (Rust native) running at http://localhost:{}", port);
    println!("   GET  /fetch?url=<url>&format=markdown|json|text");
    println!("   POST /extract  JSON: {{ url, format, vision }}");
    println!("   GET  /metadata?url=<url>");
    println!("   GET  /health");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": VERSION,
        "engine": "rust"
    }))
}

async fn version_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "version": VERSION,
        "engine": "rust"
    }))
}

async fn fetch_get_handler(Query(query): Query<FetchQuery>) -> Response {
    let url = match query.url {
        Some(u) if !u.is_empty() => u,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "BAD_REQUEST".to_string(),
                    message: "Missing required query parameter: url".to_string(),
                    url: None,
                }),
            )
                .into_response()
        }
    };

    let format_str = query.format.as_deref().unwrap_or("markdown");
    let format = format_str.parse::<OutputFormat>().unwrap_or_default();

    let options = RawfyOptions {
        format,
        vision: query.vision.unwrap_or(false),
        no_playwright: query.no_playwright.unwrap_or(false),
        max_tokens: query.max_tokens,
        ..Default::default()
    };

    match rawfy_core::rawfy_fetch(&url, &options).await {
        Ok(result) => {
            let latency_header = (
                axum::http::HeaderName::from_static("x-response-time-ms"),
                result.fetch_stats.duration_ms.to_string(),
            );
            match format {
                OutputFormat::Json => ([latency_header], Json(result)).into_response(),
                OutputFormat::Html => ([latency_header], Html(result.content.html)).into_response(),
                OutputFormat::Text => (
                    [
                        (axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8".to_string()),
                        (axum::http::HeaderName::from_static("x-response-time-ms"), result.fetch_stats.duration_ms.to_string()),
                    ],
                    serialize_text(&result),
                ).into_response(),
                OutputFormat::Markdown => (
                    [
                        (axum::http::header::CONTENT_TYPE, "text/markdown; charset=utf-8".to_string()),
                        (axum::http::HeaderName::from_static("x-response-time-ms"), result.fetch_stats.duration_ms.to_string()),
                    ],
                    serialize_wsm(&result),
                ).into_response(),
            }
        }
        Err(err) => error_to_response(err, "FETCH_FAILED", Some(url)),
    }
}

async fn fetch_post_handler(Json(body): Json<FetchBody>) -> Response {
    let format_str = body.format.as_deref().unwrap_or("markdown");
    let format = format_str.parse::<OutputFormat>().unwrap_or_default();

    let options = RawfyOptions {
        format,
        vision: body.vision.unwrap_or(false),
        vision_provider: body.vision_provider,
        vision_model: body.vision_model,
        no_playwright: body.no_playwright.unwrap_or(false),
        max_tokens: body.max_tokens,
        ..Default::default()
    };

    match rawfy_core::rawfy_fetch(&body.url, &options).await {
        Ok(result) => {
            let latency_header = (
                axum::http::HeaderName::from_static("x-response-time-ms"),
                result.fetch_stats.duration_ms.to_string(),
            );
            match format {
                OutputFormat::Json => ([latency_header], Json(result)).into_response(),
                OutputFormat::Html => ([latency_header], Html(result.content.html)).into_response(),
                OutputFormat::Text => (
                    [
                        (axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8".to_string()),
                        (axum::http::HeaderName::from_static("x-response-time-ms"), result.fetch_stats.duration_ms.to_string()),
                    ],
                    serialize_text(&result),
                ).into_response(),
                OutputFormat::Markdown => (
                    [
                        (axum::http::header::CONTENT_TYPE, "text/markdown; charset=utf-8".to_string()),
                        (axum::http::HeaderName::from_static("x-response-time-ms"), result.fetch_stats.duration_ms.to_string()),
                    ],
                    serialize_wsm(&result),
                ).into_response(),
            }
        }
        Err(err) => error_to_response(err, "FETCH_FAILED", Some(body.url)),
    }
}

async fn metadata_handler(Query(query): Query<MetadataQuery>) -> Response {
    let url = match query.url {
        Some(u) if !u.is_empty() => u,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "BAD_REQUEST".to_string(),
                    message: "Missing required query parameter: url".to_string(),
                    url: None,
                }),
            )
                .into_response()
        }
    };

    let options = RawfyOptions {
        no_playwright: query.no_playwright.unwrap_or(false),
        ..Default::default()
    };

    let start_time = std::time::Instant::now();
    match rawfy_core::rawfy_metadata(&url, &options).await {
        Ok(metadata) => (
            [(axum::http::HeaderName::from_static("x-response-time-ms"), start_time.elapsed().as_millis().to_string())],
            Json(metadata),
        ).into_response(),
        Err(err) => error_to_response(err, "METADATA_FAILED", Some(url)),
    }
}

async fn metadata_post_handler(Json(body): Json<MetadataBody>) -> Response {
    if body.url.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "BAD_REQUEST".to_string(),
                message: "Missing required field: url".to_string(),
                url: None,
            }),
        )
            .into_response();
    }

    let options = RawfyOptions {
        no_playwright: body.no_playwright.unwrap_or(false),
        ..Default::default()
    };

    let start_time = std::time::Instant::now();
    match rawfy_core::rawfy_metadata(&body.url, &options).await {
        Ok(metadata) => (
            [(axum::http::HeaderName::from_static("x-response-time-ms"), start_time.elapsed().as_millis().to_string())],
            Json(metadata),
        ).into_response(),
        Err(err) => error_to_response(err, "METADATA_FAILED", Some(body.url)),
    }
}

#[axum::debug_handler]
async fn extract_handler(Json(body): Json<ExtractBody>) -> Response {
    let format_str = body.format.as_deref().unwrap_or("markdown");
    let format = format_str.parse::<OutputFormat>().unwrap_or_default();

    let options = RawfyOptions {
        format,
        vision: body.vision.unwrap_or(false),
        vision_provider: body.vision_provider,
        vision_model: body.vision_model,
        no_playwright: body.no_playwright.unwrap_or(false),
        max_tokens: body.max_tokens,
        ..Default::default()
    };

    // If caller passed raw html, extract directly from it offline
    if let Some(ref raw_html) = body.html {
        let target_url = body.url.as_deref().unwrap_or("https://example.com");
        match rawfy_core::rawfy_extract(raw_html, target_url, &options) {
            Ok(result) => {
                let content = match format {
                    OutputFormat::Json => serialize_json(&result).unwrap_or_default(),
                    OutputFormat::Html => result.content.html.clone(),
                    OutputFormat::Text => serialize_text(&result),
                    OutputFormat::Markdown => serialize_wsm(&result),
                };

                let links: Vec<LinkInfo> = result
                    .interactive_elements
                    .iter()
                    .filter(|e| e.r#type == rawfy_core::types::InteractiveElementType::Link)
                    .map(|e| LinkInfo {
                        label: e.label.clone(),
                        href: e.href.clone().unwrap_or_default(),
                    })
                    .collect();

                return (
                    [(
                        axum::http::HeaderName::from_static("x-response-time-ms"),
                        "0".to_string(),
                    )],
                    Json(ExtractResponse {
                        url: result.metadata.url.clone(),
                        title: result.metadata.title.clone(),
                        content,
                        metadata: result.metadata,
                        interactive_elements: result.interactive_elements,
                        links,
                        format: format_str.to_string(),
                    }),
                )
                .into_response();
            }
            Err(err) => return error_to_response(err, "EXTRACT_FAILED", body.url),
        }
    }

    let url = match body.url {
        Some(ref u) if !u.trim().is_empty() => u.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "BAD_REQUEST".to_string(),
                    message: "Either 'html' or 'url' must be provided".to_string(),
                    url: None,
                }),
            )
                .into_response();
        }
    };

    match rawfy_core::rawfy_fetch(&url, &options).await {
        Ok(result) => {
            let duration_str = result.fetch_stats.duration_ms.to_string();
            let content = match format {
                OutputFormat::Json => serialize_json(&result).unwrap_or_default(),
                OutputFormat::Html => result.content.html.clone(),
                OutputFormat::Text => serialize_text(&result),
                OutputFormat::Markdown => serialize_wsm(&result),
            };

            let links: Vec<LinkInfo> = result
                .interactive_elements
                .iter()
                .filter(|e| e.r#type == rawfy_core::types::InteractiveElementType::Link)
                .map(|e| LinkInfo {
                    label: e.label.clone(),
                    href: e.href.clone().unwrap_or_default(),
                })
                .collect();

            (
                [(
                    axum::http::HeaderName::from_static("x-response-time-ms"),
                    duration_str,
                )],
                Json(ExtractResponse {
                    url: result.metadata.url.clone(),
                    title: result.metadata.title.clone(),
                    content,
                    metadata: result.metadata,
                    interactive_elements: result.interactive_elements,
                    links,
                    format: format_str.to_string(),
                }),
            )
            .into_response()
        }
        Err(err) => error_to_response(err, "EXTRACT_FAILED", Some(url)),
    }
}

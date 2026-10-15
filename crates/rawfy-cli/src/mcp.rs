use rawfy_core::{
    output::{serialize_json, serialize_text, serialize_wsm},
    types::{OutputFormat, RawfyOptions},
};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub const SERVER_NAME: &str = "rawfy";
pub const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");



#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub async fn run_mcp_stdio_server() -> Result<(), Box<dyn std::error::Error>> {
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin).lines();

    while let Some(line) = reader.next_line().await? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32700,
                        "message": format!("Parse error: {}", e)
                    }
                });
                let mut out = serde_json::to_string(&err_resp)?;
                out.push('\n');
                stdout.write_all(out.as_bytes()).await?;
                stdout.flush().await?;
                continue;
            }
        };

        let obj = match val.as_object() {
            Some(o) => o,
            None => {
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32600,
                        "message": "Invalid Request: expected object"
                    }
                });
                let mut out = serde_json::to_string(&err_resp)?;
                out.push('\n');
                stdout.write_all(out.as_bytes()).await?;
                stdout.flush().await?;
                continue;
            }
        };

        // Check for missing jsonrpc member (code: -32600)
        if !obj.contains_key("jsonrpc") {
            let err_resp = json!({
                "jsonrpc": "2.0",
                "id": obj.get("id").cloned().unwrap_or(Value::Null),
                "error": {
                    "code": -32600,
                    "message": "Invalid Request: missing 'jsonrpc' field"
                }
            });
            let mut out = serde_json::to_string(&err_resp)?;
            out.push('\n');
            stdout.write_all(out.as_bytes()).await?;
            stdout.flush().await?;
            continue;
        }

        // Notification: "id" member is completely omitted
        if !obj.contains_key("id") {
            continue;
        }
        let id = obj.get("id").cloned().unwrap_or(Value::Null);
        let method = obj.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = obj.get("params");

        let response = handle_request(method, params, id).await;
        let mut out = serde_json::to_string(&response)?;
        out.push('\n');
        stdout.write_all(out.as_bytes()).await?;
        stdout.flush().await?;
    }

    Ok(())
}

async fn handle_request(method: &str, params: Option<&Value>, id: Value) -> JsonRpcResponse {
    match method {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION
                }
            })),
            error: None,
        },
        "ping" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({})),
            error: None,
        },
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "tools": [
                    {
                        "name": "rawfy_fetch",
                        "description": "Fetch a web page and return its content as structured, agent-readable markdown with described images, transcribed video, and interactive element maps.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "url": {
                                    "type": "string",
                                    "description": "The URL to fetch and process"
                                },
                                "format": {
                                    "type": "string",
                                    "enum": ["markdown", "json", "text", "html"],
                                    "default": "markdown",
                                    "description": "Output format: markdown (WSM, default), json, text, or html"
                                },
                                "vision": {
                                    "type": "boolean",
                                    "default": false,
                                    "description": "Enable vision API for image descriptions (Gemini, OpenAI, or Anthropic)"
                                },
                                "no_playwright": {
                                    "type": "boolean",
                                    "default": false,
                                    "description": "Skip Playwright, use static fetch only"
                                },
                                "max_tokens": {
                                    "type": "integer",
                                    "default": 50000,
                                    "description": "Maximum output tokens (default: 50000)"
                                }
                            },
                            "required": ["url"]
                        }
                    },
                    {
                        "name": "rawfy_metadata",
                        "description": "Fetch only the metadata for a web page (title, description, type, language, word count). Lightweight — no media extraction.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "url": {
                                    "type": "string",
                                    "description": "The URL to fetch metadata for"
                                },
                                "no_playwright": {
                                    "type": "boolean",
                                    "default": false,
                                    "description": "Skip Playwright, use static fetch only"
                                }
                            },
                            "required": ["url"]
                        }
                    },
                    {
                        "name": "rawfy_extract",
                        "description": "Extract structured content and semantic markdown from raw HTML offline without making network requests.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "html": {
                                    "type": "string",
                                    "description": "The raw HTML string to extract from"
                                },
                                "url": {
                                    "type": "string",
                                    "default": "https://example.com",
                                    "description": "Base URL for resolving relative links"
                                },
                                "format": {
                                    "type": "string",
                                    "enum": ["markdown", "json", "text", "html"],
                                    "default": "markdown",
                                    "description": "Output format: markdown (default), json, text, or html"
                                }
                            },
                            "required": ["html"]
                        }
                    }
                ]
            })),
            error: None,
        },
        "tools/call" => {
            let tool_name = params
                .and_then(|p| p.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("");
            let arguments = params.and_then(|p| p.get("arguments")).cloned().unwrap_or(json!({}));

            match tool_name {
                "rawfy_fetch" => {
                    let url = arguments.get("url").and_then(|u| u.as_str()).unwrap_or("");
                    if url.is_empty() {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": "Error: Missing required argument 'url'" }],
                                "isError": true
                            })),
                            error: None,
                        };
                    }

                    let format_str = arguments.get("format").and_then(|f| f.as_str()).unwrap_or("markdown");
                    let format = format_str.parse::<OutputFormat>().unwrap_or_default();
                    let vision = arguments.get("vision").and_then(|v| v.as_bool()).unwrap_or(false);
                    let no_playwright = arguments.get("no_playwright").and_then(|p| p.as_bool()).unwrap_or(false);
                    let max_tokens = arguments.get("max_tokens").and_then(|m| {
                        if let Some(u) = m.as_u64() {
                            Some(u as usize)
                        } else if let Some(f) = m.as_f64() {
                            Some(f as usize)
                        } else {
                            None
                        }
                    });

                    let options = RawfyOptions {
                        format,
                        vision,
                        no_playwright,
                        max_tokens,
                        ..Default::default()
                    };

                    match rawfy_core::rawfy_fetch(url, &options).await {
                        Ok(data) => {
                            let text = match format {
                                OutputFormat::Json => serialize_json(&data).unwrap_or_default(),
                                OutputFormat::Html => data.content.html.clone(),
                                OutputFormat::Text => serialize_text(&data),
                                OutputFormat::Markdown => serialize_wsm(&data),
                            };
                            JsonRpcResponse {
                                jsonrpc: "2.0".to_string(),
                                id,
                                result: Some(json!({
                                    "content": [{ "type": "text", "text": text }]
                                })),
                                error: None,
                            }
                        }
                        Err(e) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": format!("Rawfy error: {}", e) }],
                                "isError": true
                            })),
                            error: None,
                        },
                    }
                }
                "rawfy_metadata" => {
                    let url = arguments.get("url").and_then(|u| u.as_str()).unwrap_or("");
                    if url.is_empty() {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": "Error: Missing required argument 'url'" }],
                                "isError": true
                            })),
                            error: None,
                        };
                    }

                    let no_playwright = arguments.get("no_playwright").and_then(|p| p.as_bool()).unwrap_or(false);
                    let options = RawfyOptions {
                        no_playwright,
                        ..Default::default()
                    };

                    match rawfy_core::rawfy_metadata(url, &options).await {
                        Ok(metadata) => {
                            let text = serde_json::to_string_pretty(&metadata).unwrap_or_default();
                            JsonRpcResponse {
                                jsonrpc: "2.0".to_string(),
                                id,
                                result: Some(json!({
                                    "content": [{ "type": "text", "text": text }]
                                })),
                                error: None,
                            }
                        }
                        Err(e) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": format!("Rawfy error: {}", e) }],
                                "isError": true
                            })),
                            error: None,
                        },
                    }
                }
                "rawfy_extract" => {
                    let html = arguments.get("html").and_then(|h| h.as_str()).unwrap_or("");
                    if html.is_empty() {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": "Error: Missing required argument 'html'" }],
                                "isError": true
                            })),
                            error: None,
                        };
                    }

                    let url = arguments.get("url").and_then(|u| u.as_str()).unwrap_or("https://example.com");
                    let format_str = arguments.get("format").and_then(|f| f.as_str()).unwrap_or("markdown");
                    let format = format_str.parse::<OutputFormat>().unwrap_or_default();
                    let options = RawfyOptions {
                        format,
                        ..Default::default()
                    };

                    match rawfy_core::rawfy_extract(html, url, &options) {
                        Ok(data) => {
                            let text = match format {
                                OutputFormat::Json => serialize_json(&data).unwrap_or_default(),
                                OutputFormat::Html => data.content.html.clone(),
                                OutputFormat::Text => serialize_text(&data),
                                OutputFormat::Markdown => serialize_wsm(&data),
                            };
                            JsonRpcResponse {
                                jsonrpc: "2.0".to_string(),
                                id,
                                result: Some(json!({
                                    "content": [{ "type": "text", "text": text }]
                                })),
                                error: None,
                            }
                        }
                        Err(e) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id,
                            result: Some(json!({
                                "content": [{ "type": "text", "text": format!("Rawfy extract error: {}", e) }],
                                "isError": true
                            })),
                            error: None,
                        },
                    }
                }
                _ => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id,
                    result: Some(json!({
                        "content": [{ "type": "text", "text": format!("Tool '{}' not found", tool_name) }],
                        "isError": true
                    })),
                    error: None,
                },
            }
        }
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(json!({
                "code": -32601,
                "message": format!("Method not found: {}", method)
            })),
        },
    }
}

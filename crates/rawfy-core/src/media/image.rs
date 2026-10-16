use crate::types::{ImageDescriptionSource, ImageResult, RawfyOptions};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use scraper::{ElementRef, Html, Selector};
use std::sync::OnceLock;

/// Options for image extraction
#[derive(Debug, Clone, Default)]
pub struct ImageExtractOptions {
    /// Enable vision API for images missing alt text
    pub vision: bool,
    /// Explicit vision provider override: 'gemini', 'openai', 'anthropic'
    pub vision_provider: Option<String>,
    /// Model name override for vision API
    pub vision_model: Option<String>,
    /// Optional API key override
    pub api_key: Option<String>,
}

impl From<&RawfyOptions> for ImageExtractOptions {
    fn from(opts: &RawfyOptions) -> Self {
        Self {
            vision: opts.vision,
            vision_provider: opts.vision_provider.clone(),
            vision_model: opts.vision_model.clone(),
            api_key: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VisionProvider {
    Gemini,
    OpenAi,
    Anthropic,
}

static IMG_SELECTOR: OnceLock<Selector> = OnceLock::new();
static FIGCAPTION_SELECTOR: OnceLock<Selector> = OnceLock::new();

fn img_selector() -> &'static Selector {
    IMG_SELECTOR.get_or_init(|| Selector::parse("img").expect("valid img selector"))
}

fn figcaption_selector() -> &'static Selector {
    FIGCAPTION_SELECTOR.get_or_init(|| Selector::parse("figcaption").expect("valid figcaption selector"))
}

/// Extract image information from HTML.
///
/// Finds all `<img>` elements and builds structured `ImageResult` objects
/// using the description priority chain: alt → figcaption/title → vision API.
struct RawImageCandidate {
    src: String,
    alt: Option<String>,
    context_description: Option<String>,
}

fn find_image_candidates(html: &str, base_url: &str) -> Vec<RawImageCandidate> {
    let document = Html::parse_document(html);
    let mut candidates = Vec::new();

    for img in document.select(img_selector()) {
        let raw_src = img
            .value()
            .attr("src")
            .or_else(|| img.value().attr("data-src"))
            .or_else(|| img.value().attr("data-lazy-src"))
            .map(|s| s.trim())
            .unwrap_or("");

        if raw_src.is_empty() || is_tracking_pixel(&img) {
            continue;
        }

        let src = resolve_url(raw_src, base_url);
        let alt = img.value().attr("alt").map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());
        let figcaption = get_figcaption(&img);
        let title = img
            .value()
            .attr("title")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let context_description = figcaption.or(title);

        candidates.push(RawImageCandidate {
            src,
            alt,
            context_description,
        });
    }

    candidates
}

/// Extract image information from HTML.
///
/// Finds all `<img>` elements and builds structured `ImageResult` objects
/// using the description priority chain: alt → figcaption/title → vision API.
pub async fn extract_images(
    html: &str,
    base_url: &str,
    options: &ImageExtractOptions,
) -> Vec<ImageResult> {
    let candidates = find_image_candidates(html, base_url);
    let mut results = Vec::new();

    let http_client = if options.vision {
        Some(
            reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
        )
    } else {
        None
    };

    for candidate in candidates {
        // Priority 1: Alt text
        if let Some(ref alt_text) = candidate.alt {
            if !is_placeholder_alt(alt_text) {
                results.push(ImageResult {
                    r#type: "image".to_string(),
                    src: candidate.src,
                    alt: Some(alt_text.clone()),
                    description: Some(alt_text.clone()),
                    description_source: Some(ImageDescriptionSource::AltText),
                });
                continue;
            }
        }

        // Priority 2: Figcaption or title attribute
        if let Some(ref desc) = candidate.context_description {
            results.push(ImageResult {
                r#type: "image".to_string(),
                src: candidate.src,
                alt: candidate.alt,
                description: Some(desc.clone()),
                description_source: Some(ImageDescriptionSource::Figcaption),
            });
            continue;
        }

        // Priority 3: Vision API (when vision is enabled)
        if options.vision {
            if let Some(ref client) = http_client {
                if let Some((provider, key)) = resolve_vision_provider_and_key(options) {
                    let model_override = options.vision_model.as_deref();
                    if let Ok(vision_text) = run_vision(client, &candidate.src, provider, &key, model_override).await {
                        if !vision_text.is_empty() {
                            results.push(ImageResult {
                                r#type: "image".to_string(),
                                src: candidate.src,
                                alt: candidate.alt,
                                description: Some(vision_text),
                                description_source: Some(ImageDescriptionSource::VisionApi),
                            });
                            continue;
                        }
                    }
                }
            }
        }

        // Fallback: image with no description
        results.push(ImageResult {
            r#type: "image".to_string(),
            src: candidate.src,
            alt: candidate.alt,
            description: None,
            description_source: None,
        });
    }

    results
}

/// Format an ImageResult into the WSM placeholder format.
pub fn format_image(image: &ImageResult) -> String {
    let desc = image
        .description
        .as_deref()
        .or(image.alt.as_deref())
        .unwrap_or("no description");

    let mut parts = vec![format!("IMAGE: {}", desc)];
    if !image.src.is_empty() {
        parts.push(format!("src: {}", image.src));
    }
    if let Some(ref source) = image.description_source {
        if *source != ImageDescriptionSource::AltText {
            let via = match source {
                ImageDescriptionSource::Figcaption => "figcaption",
                ImageDescriptionSource::Ocr => "ocr",
                ImageDescriptionSource::VisionApi => "vision_api",
                ImageDescriptionSource::AltText => "alt_text",
            };
            parts.push(format!("via: {}", via));
        }
    }
    format!("[{}]", parts.join(" | "))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn resolve_url(raw: &str, base: &str) -> String {
    if let Ok(base_parsed) = url::Url::parse(base) {
        if let Ok(joined) = base_parsed.join(raw) {
            return joined.to_string();
        }
    }
    raw.to_string()
}

fn parse_dimension(val: &str) -> Option<u32> {
    let digits: String = val.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u32>().ok()
}

fn is_tracking_pixel(img: &ElementRef) -> bool {
    let raw_src = img
        .value()
        .attr("src")
        .or_else(|| img.value().attr("data-src"))
        .or_else(|| img.value().attr("data-lazy-src"))
        .unwrap_or("");
    let src_lower = raw_src.to_lowercase();
    if src_lower.contains("spacer.gif")
        || src_lower.contains("1x1.gif")
        || src_lower.contains("pixel.png")
        || src_lower.contains("tracking.gif")
        || src_lower.ends_with("/s.gif")
        || src_lower == "s.gif"
        || src_lower.contains("enwiki-25")
        || src_lower.contains("mediawiki_compact")
        || src_lower.contains("wikimedia.svg")
        || src_lower.contains("wikipedia-wordmark")
        || src_lower.contains("wikipedia-tagline")
        || src_lower.contains("mw-logo")
        || src_lower.contains("y18.svg")
        || src_lower.contains("avatar")
        || src_lower.contains("media/math/render")
        || src_lower.contains("math/render/svg")
        || src_lower.contains("latex.codecogs.com")
        || img.value().classes().any(|c| c.contains("mwe-math"))
    {
        return true;
    }

    let w = img.value().attr("width").and_then(parse_dimension);
    let h = img.value().attr("height").and_then(parse_dimension);

    if let (Some(w_val), Some(h_val)) = (w, h) {
        if (w_val < 32 && h_val < 32) || w_val < 3 || h_val < 3 {
            return true;
        }
    } else if let Some(w_val) = w {
        if w_val < 3 {
            return true;
        }
    } else if let Some(h_val) = h {
        if h_val < 3 {
            return true;
        }
    }
    false
}

fn is_placeholder_alt(alt: &str) -> bool {
    let lower = alt.trim().to_lowercase();
    if lower.is_empty() {
        return true;
    }
    const PLACEHOLDERS: &[&str] = &[
        "image",
        "photo",
        "picture",
        "img",
        "icon",
        "logo",
        "thumbnail",
        "placeholder",
        "untitled",
        "decorative",
    ];
    PLACEHOLDERS.contains(&lower.as_str())
}

fn get_figcaption(img: &ElementRef) -> Option<String> {
    let mut current = img.parent();
    while let Some(parent_node) = current {
        if let Some(parent_element) = ElementRef::wrap(parent_node) {
            if parent_element.value().name() == "figure" {
                if let Some(caption_el) = parent_element.select(figcaption_selector()).next() {
                    let text = caption_el.text().collect::<Vec<_>>().join("");
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
                break;
            }
        }
        current = parent_node.parent();
    }
    None
}

fn resolve_vision_provider_and_key(options: &ImageExtractOptions) -> Option<(VisionProvider, String)> {
    if let Some(ref override_provider) = options.vision_provider {
        let p = override_provider.to_lowercase();
        if p == "gemini" || p == "google" {
            let key = options
                .api_key
                .clone()
                .or_else(|| std::env::var("GEMINI_API_KEY").ok())
                .or_else(|| std::env::var("GOOGLE_API_KEY").ok())?;
            return Some((VisionProvider::Gemini, key));
        } else if p == "openai" {
            let key = options
                .api_key
                .clone()
                .or_else(|| std::env::var("OPENAI_API_KEY").ok())?;
            return Some((VisionProvider::OpenAi, key));
        } else if p == "anthropic" || p == "claude" {
            let key = options
                .api_key
                .clone()
                .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())?;
            return Some((VisionProvider::Anthropic, key));
        }
    }

    // Auto-detect based on available environment variables or api_key
    if let Ok(key) = std::env::var("GEMINI_API_KEY").or_else(|_| std::env::var("GOOGLE_API_KEY")) {
        return Some((VisionProvider::Gemini, key));
    }
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        return Some((VisionProvider::OpenAi, key));
    }
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        return Some((VisionProvider::Anthropic, key));
    }
    if let Some(ref key) = options.api_key {
        return Some((VisionProvider::Gemini, key.clone()));
    }

    None
}

async fn run_vision(
    client: &reqwest::Client,
    image_url: &str,
    provider: VisionProvider,
    api_key: &str,
    model: Option<&str>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let img_res = client.get(image_url).send().await?;
    if !img_res.status().is_success() {
        return Err("Failed to fetch image".into());
    }

    let headers = img_res.headers().clone();
    let bytes = img_res.bytes().await?;
    let base64_data = BASE64_STANDARD.encode(&bytes);

    let mime_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .filter(|ct| ct.starts_with("image/"))
        .unwrap_or_else(|| {
            if image_url.ends_with(".png") {
                "image/png"
            } else if image_url.ends_with(".webp") {
                "image/webp"
            } else if image_url.ends_with(".gif") {
                "image/gif"
            } else {
                "image/jpeg"
            }
        });

    const PROMPT: &str =
        "Describe this image in one concise sentence for a screen reader. Focus on what is shown, not how it looks.";

    match provider {
        VisionProvider::Gemini => {
            let model_name = model.unwrap_or("gemini-2.5-flash");
            let endpoint = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model_name, api_key
            );
            let body = serde_json::json!({
                "contents": [{
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64_data
                            }
                        },
                        {
                            "text": PROMPT
                        }
                    ]
                }]
            });
            let resp = client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                return Err(format!("Gemini API error: {}", resp.status()).into());
            }

            let json: serde_json::Value = resp.json().await?;
            if let Some(text) = json
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(|v| v.as_str())
            {
                return Ok(text.trim().to_string());
            }
            Err("No text found in Gemini response".into())
        }
        VisionProvider::OpenAi => {
            let model_name = model.unwrap_or("gpt-4o-mini");
            let data_url = format!("data:{};base64,{}", mime_type, base64_data);
            let body = serde_json::json!({
                "model": model_name,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": PROMPT
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url
                            }
                        }
                    ]
                }],
                "max_tokens": 200
            });
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                return Err(format!("OpenAI API error: {}", resp.status()).into());
            }

            let json: serde_json::Value = resp.json().await?;
            if let Some(content) = json
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
            {
                return Ok(content.trim().to_string());
            }
            Err("No content found in OpenAI response".into())
        }
        VisionProvider::Anthropic => {
            let model_name = model.unwrap_or("claude-3-5-haiku-20241022");
            let body = serde_json::json!({
                "model": model_name,
                "max_tokens": 200,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": base64_data
                            }
                        },
                        {
                            "type": "text",
                            "text": PROMPT
                        }
                    ]
                }]
            });
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                return Err(format!("Anthropic API error: {}", resp.status()).into());
            }

            let json: serde_json::Value = resp.json().await?;
            if let Some(arr) = json.get("content").and_then(|v| v.as_array()) {
                for item in arr {
                    if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                        if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                            return Ok(text.trim().to_string());
                        }
                    }
                }
            }
            Err("No text found in Anthropic response".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://example.com";

    #[tokio::test]
    async fn test_extract_images_priority1_alt_text() {
        let html = r#"<html><body><img src="/photo.jpg" alt="A sunset over the ocean"></body></html>"#;
        let options = ImageExtractOptions::default();
        let results = extract_images(html, BASE, &options).await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].description.as_deref(), Some("A sunset over the ocean"));
        assert_eq!(results[0].description_source, Some(ImageDescriptionSource::AltText));
        assert_eq!(results[0].src, "https://example.com/photo.jpg");
    }

    #[tokio::test]
    async fn test_extract_images_skips_placeholder_alt() {
        let placeholders = ["image", "photo", "picture", "img", "icon", "logo", "thumbnail", "placeholder"];
        let options = ImageExtractOptions::default();
        for ph in placeholders {
            let html = format!(r#"<html><body><img src="/photo.jpg" alt="{}"></body></html>"#, ph);
            let results = extract_images(&html, BASE, &options).await;
            assert_eq!(results.len(), 1);
            assert_ne!(results[0].description_source, Some(ImageDescriptionSource::AltText));
        }
    }

    #[tokio::test]
    async fn test_extract_images_priority2_figcaption() {
        let html = r#"
            <html><body>
                <figure>
                    <img src="/chart.png">
                    <figcaption>Figure 1: Revenue by quarter</figcaption>
                </figure>
            </body></html>
        "#;
        let options = ImageExtractOptions::default();
        let results = extract_images(html, BASE, &options).await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].description.as_deref(), Some("Figure 1: Revenue by quarter"));
        assert_eq!(results[0].description_source, Some(ImageDescriptionSource::Figcaption));
    }

    #[tokio::test]
    async fn test_extract_images_priority2_title_attribute() {
        let html = r#"<html><body><img src="/img.png" title="Product screenshot"></body></html>"#;
        let options = ImageExtractOptions::default();
        let results = extract_images(html, BASE, &options).await;

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].description.as_deref(), Some("Product screenshot"));
        assert_eq!(results[0].description_source, Some(ImageDescriptionSource::Figcaption));
    }

    #[tokio::test]
    async fn test_extract_images_filtering() {
        let options = ImageExtractOptions::default();

        // Skips image with no src
        let no_src = r#"<html><body><img alt="No source"></body></html>"#;
        assert_eq!(extract_images(no_src, BASE, &options).await.len(), 0);

        // Skips tracking pixels
        let pixel = r#"<html><body><img src="/pixel.gif" width="1" height="1"></body></html>"#;
        assert_eq!(extract_images(pixel, BASE, &options).await.len(), 0);

        // Handles data-src
        let lazy = r#"<html><body><img data-src="https://cdn.example.com/lazy.jpg" alt="Lazy image"></body></html>"#;
        let lazy_results = extract_images(lazy, BASE, &options).await;
        assert_eq!(lazy_results.len(), 1);
        assert_eq!(lazy_results[0].src, "https://cdn.example.com/lazy.jpg");
    }

    #[test]
    fn test_format_image() {
        let img1 = ImageResult {
            r#type: "image".to_string(),
            src: "https://example.com/photo.jpg".to_string(),
            alt: Some("A sunset".to_string()),
            description: Some("A sunset".to_string()),
            description_source: Some(ImageDescriptionSource::AltText),
        };
        assert_eq!(
            format_image(&img1),
            "[IMAGE: A sunset | src: https://example.com/photo.jpg]"
        );

        let img2 = ImageResult {
            r#type: "image".to_string(),
            src: "https://example.com/doc.png".to_string(),
            alt: None,
            description: Some("Chapter 1: Introduction".to_string()),
            description_source: Some(ImageDescriptionSource::Ocr),
        };
        assert_eq!(
            format_image(&img2),
            "[IMAGE: Chapter 1: Introduction | src: https://example.com/doc.png | via: ocr]"
        );

        let img3 = ImageResult {
            r#type: "image".to_string(),
            src: "https://example.com/mystery.jpg".to_string(),
            alt: None,
            description: None,
            description_source: None,
        };
        assert_eq!(
            format_image(&img3),
            "[IMAGE: no description | src: https://example.com/mystery.jpg]"
        );
    }
}

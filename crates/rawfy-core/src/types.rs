use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum RawfyError {
    #[error("{message}")]
    InvalidUrl { message: String, url: Option<String> },

    #[error("Fetch timeout: {message}")]
    FetchTimeout { message: String, url: Option<String> },

    #[error("Fetch failed: {message}")]
    FetchFailed { message: String, url: Option<String> },

    #[error("Parse failed: {message}")]
    ParseFailed { message: String, url: Option<String> },

    #[error("Playwright failed: {message}")]
    PlaywrightFailed { message: String, url: Option<String> },

    #[error("Vision API failed: {message}")]
    VisionFailed { message: String, url: Option<String> },

    #[error("Serialization failed: {message}")]
    SerializeFailed { message: String, url: Option<String> },

    #[error("Unknown error: {message}")]
    Unknown { message: String, url: Option<String> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FetchMethod {
    Static,
    Playwright,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub html: String,
    pub final_url: String,
    pub headers: HashMap<String, String>,
    pub method: FetchMethod,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    #[default]
    Markdown,
    Json,
    Text,
    Html,
}

impl std::str::FromStr for OutputFormat {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "markdown" | "md" => Ok(OutputFormat::Markdown),
            "json" => Ok(OutputFormat::Json),
            "text" | "txt" => Ok(OutputFormat::Text),
            "html" => Ok(OutputFormat::Html),
            _ => Err(format!("Unknown format: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PageType {
    Article,
    Product,
    Docs,
    Search,
    Homepage,
    Video,
    #[default]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenGraphData {
    pub title: Option<String>,
    pub r#type: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub url: Option<String>,
    pub site_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PageMetadata {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_url: Option<String>,
    pub r#type: PageType,
    pub fetched_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub word_count: usize,
    pub reading_time_minutes: usize,
    pub interactive_element_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub og: Option<OpenGraphData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub json_ld: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadabilityResult {
    pub title: String,
    pub content: String,
    pub excerpt: Option<String>,
    pub byline: Option<String>,
    pub site_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InteractiveElementType {
    Button,
    Link,
    Form,
    Input,
    Select,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractiveElement {
    pub r#type: InteractiveElementType,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageDescriptionSource {
    AltText,
    Figcaption,
    Ocr,
    VisionApi,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImageResult {
    #[serde(default, skip_serializing)]
    pub r#type: String, // "image"
    pub src: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description_source: Option<ImageDescriptionSource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VideoResult {
    #[serde(default, skip_serializing)]
    pub r#type: String, // "video"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioResult {
    #[serde(default, skip_serializing)]
    pub r#type: String, // "audio"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PdfResult {
    #[serde(default, skip_serializing)]
    pub r#type: String, // "pdf"
    pub src: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MediaResult {
    #[serde(rename = "image")]
    Image(ImageResult),
    #[serde(rename = "video")]
    Video(VideoResult),
    #[serde(rename = "audio")]
    Audio(AudioResult),
    #[serde(rename = "pdf")]
    Pdf(PdfResult),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageContent {
    pub markdown: String,
    pub text: String,
    pub html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchStats {
    pub method: FetchMethod,
    pub duration_ms: u64,
    pub estimated_tokens: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageData {
    pub metadata: PageMetadata,
    pub content: PageContent,
    pub media: Vec<MediaResult>,
    pub interactive_elements: Vec<InteractiveElement>,
    pub fetch_stats: FetchStats,
}

#[derive(Debug, Clone, Default)]
pub struct RawfyOptions {
    pub format: OutputFormat,
    pub vision: bool,
    pub vision_provider: Option<String>,
    pub vision_model: Option<String>,
    pub no_playwright: bool,
    pub force_playwright: bool,
    pub max_tokens: Option<usize>,
    pub timeout_ms: Option<u64>,
    pub links_only: bool,
    pub out: Option<String>,
}

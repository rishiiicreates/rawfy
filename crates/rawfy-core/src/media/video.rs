use crate::types::VideoResult;
use regex::Regex;
use scraper::{Html, Selector};
use std::sync::OnceLock;

/// Pre-extracted caption track (e.g. from Playwright or external extraction)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct VideoCaptionTrack {
    pub lang: Option<String>,
    pub text: String,
}

static YT_PARAM_RE: OnceLock<Regex> = OnceLock::new();
static YT_PATH_RE: OnceLock<Regex> = OnceLock::new();
static VIMEO_RE: OnceLock<Regex> = OnceLock::new();
static CAPTION_TEXT_RE: OnceLock<Regex> = OnceLock::new();
static TAG_RE: OnceLock<Regex> = OnceLock::new();

static IFRAME_SELECTOR: OnceLock<Selector> = OnceLock::new();
static VIDEO_SELECTOR: OnceLock<Selector> = OnceLock::new();
static SOURCE_SELECTOR: OnceLock<Selector> = OnceLock::new();

fn iframe_selector() -> &'static Selector {
    IFRAME_SELECTOR.get_or_init(|| Selector::parse("iframe").expect("valid iframe selector"))
}

fn video_selector() -> &'static Selector {
    VIDEO_SELECTOR.get_or_init(|| Selector::parse("video").expect("valid video selector"))
}

fn source_selector() -> &'static Selector {
    SOURCE_SELECTOR.get_or_init(|| Selector::parse("source").expect("valid source selector"))
}

/// Extract YouTube video ID from various URL formats.
/// Supports watch?v=, embed, youtu.be, nocookie, shorts, live, and /v/.
pub fn extract_youtube_id(url: &str) -> Option<String> {
    let param_re = YT_PARAM_RE.get_or_init(|| {
        Regex::new(r"(?:youtube(?:-nocookie)?\.com/(?:watch|live)(?:\.php)?\?(?:[^#]*?&)?v=)([a-zA-Z0-9_-]{11})")
            .unwrap()
    });
    if let Some(caps) = param_re.captures(url) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    let path_re = YT_PATH_RE.get_or_init(|| {
        Regex::new(
            r"(?:youtube(?:-nocookie)?\.com/(?:embed|shorts|live|v)/|youtu\.be/)([a-zA-Z0-9_-]{11})",
        )
        .unwrap()
    });
    if let Some(caps) = path_re.captures(url) {
        if let Some(m) = caps.get(1) {
            return Some(m.as_str().to_string());
        }
    }

    None
}

/// Extract Vimeo video ID from player embed URL or standard URL.
pub fn extract_vimeo_id(url: &str) -> Option<String> {
    let re = VIMEO_RE.get_or_init(|| {
        Regex::new(r"(?:player\.vimeo\.com/video/|vimeo\.com/)(\d+)").unwrap()
    });
    re.captures(url)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

struct RawVideoCandidate {
    youtube_ids: Vec<String>,
    vimeo_videos: Vec<VideoResult>,
    native_videos: Vec<VideoResult>,
}

fn find_video_candidates(
    html: &str,
    page_url: &str,
    caption_tracks: Option<&[VideoCaptionTrack]>,
) -> RawVideoCandidate {
    let document = Html::parse_document(html);
    let mut youtube_ids = Vec::new();
    let mut vimeo_videos = Vec::new();
    let mut native_videos = Vec::new();

    // 1. Extract YouTube and Vimeo iframes
    for iframe in document.select(iframe_selector()) {
        let raw_src = iframe
            .value()
            .attr("src")
            .or_else(|| iframe.value().attr("data-src"))
            .unwrap_or("")
            .trim();

        if raw_src.is_empty() {
            continue;
        }

        if let Some(youtube_id) = extract_youtube_id(raw_src) {
            if !youtube_ids.contains(&youtube_id) {
                youtube_ids.push(youtube_id);
            }
            continue;
        }

        if let Some(vimeo_id) = extract_vimeo_id(raw_src) {
            let title = iframe
                .value()
                .attr("title")
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            vimeo_videos.push(VideoResult {
                r#type: "video".to_string(),
                src: Some(format!("https://vimeo.com/{}", vimeo_id)),
                title,
                duration_seconds: None,
                transcript: None,
                thumbnail_url: None,
            });
        }
    }

    // 2. Extract native <video> elements
    for video in document.select(video_selector()) {
        let direct_src = video.value().attr("src");
        let source_src = video
            .select(source_selector())
            .next()
            .and_then(|s| s.value().attr("src"));

        let raw_src = direct_src.or(source_src).map(|s| s.trim()).unwrap_or("");
        let resolved_src = if !raw_src.is_empty() {
            Some(resolve_url(raw_src, page_url))
        } else {
            None
        };

        let title = video
            .value()
            .attr("title")
            .or_else(|| video.value().attr("aria-label"))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        let poster = video
            .value()
            .attr("poster")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        let duration_seconds = video
            .value()
            .attr("duration")
            .or_else(|| video.value().attr("data-duration"))
            .and_then(|d| d.parse::<f64>().ok())
            .map(|d| d.round() as u64);

        let mut transcript = None;
        if let Some(tracks) = caption_tracks {
            if !tracks.is_empty() {
                let joined = tracks
                    .iter()
                    .map(|t| t.text.trim())
                    .filter(|t| !t.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                if !joined.is_empty() {
                    transcript = Some(joined);
                }
            }
        }

        native_videos.push(VideoResult {
            r#type: "video".to_string(),
            src: resolved_src,
            title,
            duration_seconds,
            transcript,
            thumbnail_url: poster,
        });
    }

    RawVideoCandidate {
        youtube_ids,
        vimeo_videos,
        native_videos,
    }
}

/// Extract video information from HTML and page URL.
///
/// Discovers YouTube embeds/shorts/live, Vimeo embeds, and native `<video>` elements.
pub async fn extract_videos(
    html: &str,
    page_url: &str,
    caption_tracks: Option<&[VideoCaptionTrack]>,
) -> Vec<VideoResult> {
    let candidate = find_video_candidates(html, page_url, caption_tracks);
    let mut results = Vec::new();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    // 1. Process YouTube iframes
    for youtube_id in candidate.youtube_ids {
        if !results.iter().any(|r: &VideoResult| {
            r.src.as_deref().map_or(false, |s| s.contains(&youtube_id))
        }) {
            let video = build_youtube_result(&youtube_id, &client).await;
            results.push(video);
        }
    }

    // 2. Process Vimeo videos
    results.extend(candidate.vimeo_videos);

    // 3. Check if the page URL itself is a YouTube video
    if let Some(page_youtube_id) = extract_youtube_id(page_url) {
        if !results.iter().any(|r: &VideoResult| {
            r.src.as_deref().map_or(false, |s| s.contains(&page_youtube_id))
        }) {
            let video = build_youtube_result(&page_youtube_id, &client).await;
            results.push(video);
        }
    }

    // 4. Native videos
    results.extend(candidate.native_videos);

    results
}

/// Format a VideoResult into the WSM placeholder format.
pub fn format_video(video: &VideoResult) -> String {
    let mut parts: Vec<String> = vec!["VIDEO".to_string()];
    if let Some(ref title) = video.title {
        parts.push(format!("\"{}\"", title));
    }
    if let Some(duration) = video.duration_seconds {
        parts.push(format_duration(duration));
    }
    if let Some(ref src) = video.src {
        parts.push(format!("src: {}", src));
    }
    if let Some(ref transcript) = video.transcript {
        let truncated = if transcript.chars().count() > 500 {
            let s: String = transcript.chars().take(497).collect();
            format!("{}...", s)
        } else {
            transcript.clone()
        };
        parts.push(format!("transcript: {}", truncated));
    } else {
        parts.push("transcript: unavailable".to_string());
    }
    format!("[{}]", parts.join(" | "))
}

/// Format seconds into human-readable duration (e.g. "1:01:01" or "2:05").
pub fn format_duration(seconds: u64) -> String {
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;

    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{}:{:02}", m, s)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn build_youtube_result(video_id: &str, client: &reqwest::Client) -> VideoResult {
    let mut result = VideoResult {
        r#type: "video".to_string(),
        src: Some(format!("https://www.youtube.com/watch?v={}", video_id)),
        title: None,
        duration_seconds: None,
        transcript: None,
        thumbnail_url: Some(format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id)),
    };

    // 1. Fetch title from oEmbed API
    let oembed_url = format!(
        "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={}&format=json",
        video_id
    );
    if let Ok(resp) = client.get(&oembed_url).send().await {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(title) = json.get("title").and_then(|t| t.as_str()) {
                    let trimmed = title.trim();
                    if !trimmed.is_empty() {
                        result.title = Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    // 2. Fetch transcript from timedtext API
    let timedtext_url = format!("https://www.youtube.com/api/timedtext?v={}&lang=en", video_id);
    if let Ok(resp) = client.get(&timedtext_url).send().await {
        if resp.status().is_success() {
            if let Ok(xml) = resp.text().await {
                if let Some(transcript) = parse_caption_xml(&xml) {
                    result.transcript = Some(transcript);
                }
            }
        }
    }

    result
}

/// Parse YouTube caption XML into plain text.
pub fn parse_caption_xml(xml: &str) -> Option<String> {
    let text_re = CAPTION_TEXT_RE.get_or_init(|| {
        Regex::new(r"(?s)<text[^>]*>(.*?)</text>").unwrap()
    });
    let tag_re = TAG_RE.get_or_init(|| {
        Regex::new(r"<[^>]+>").unwrap()
    });

    let mut segments = Vec::new();
    for cap in text_re.captures_iter(xml) {
        if let Some(m) = cap.get(1) {
            let clean = tag_re.replace_all(m.as_str(), "");
            let decoded = clean
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace('\n', " ");
            let trimmed = decoded.trim();
            if !trimmed.is_empty() {
                segments.push(trimmed.to_string());
            }
        }
    }

    if segments.is_empty() {
        return None;
    }

    let full = segments.join(" ");
    if full.len() > 10 {
        Some(full)
    } else {
        None
    }
}

fn resolve_url(raw: &str, base: &str) -> String {
    if let Ok(base_parsed) = url::Url::parse(base) {
        if let Ok(joined) = base_parsed.join(raw) {
            return joined.to_string();
        }
    }
    raw.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://example.com";

    #[test]
    fn test_extract_youtube_id_all_formats() {
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/embed/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube-nocookie.com/embed/abcdef12345"),
            Some("abcdef12345".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/live/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/v/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_extract_vimeo_id() {
        assert_eq!(
            extract_vimeo_id("https://player.vimeo.com/video/123456789"),
            Some("123456789".to_string())
        );
        assert_eq!(
            extract_vimeo_id("https://vimeo.com/987654321"),
            Some("987654321".to_string())
        );
    }

    #[test]
    fn test_parse_caption_xml() {
        let xml = "<transcript><text start=\"0\" dur=\"2\">Hello from captions</text></transcript>";
        assert_eq!(
            parse_caption_xml(xml),
            Some("Hello from captions".to_string())
        );
    }

    #[tokio::test]
    async fn test_extract_videos_from_iframe_and_page_url() {
        let html = r#"
            <html><body>
                <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
                <iframe src="https://player.vimeo.com/video/123456789" title="My Vimeo Video"></iframe>
            </body></html>
        "#;
        let results = extract_videos(html, BASE, None).await;
        assert_eq!(results.len(), 2);

        assert!(results[0].src.as_deref().unwrap().contains("dQw4w9WgXcQ"));
        assert_eq!(results[1].src.as_deref(), Some("https://vimeo.com/123456789"));
        assert_eq!(results[1].title.as_deref(), Some("My Vimeo Video"));
    }

    #[tokio::test]
    async fn test_extract_native_video() {
        let html = r#"
            <html><body>
                <video src="/video.mp4" poster="/thumb.jpg" title="Demo Video"></video>
                <video>
                    <source src="/clip.webm" type="video/webm">
                </video>
            </body></html>
        "#;
        let captions = [VideoCaptionTrack {
            lang: Some("en".to_string()),
            text: "Hello world, this is a transcript.".to_string(),
        }];
        let results = extract_videos(html, BASE, Some(&captions)).await;
        assert_eq!(results.len(), 2);

        assert_eq!(results[0].src.as_deref(), Some("https://example.com/video.mp4"));
        assert_eq!(results[0].thumbnail_url.as_deref(), Some("/thumb.jpg"));
        assert_eq!(results[0].title.as_deref(), Some("Demo Video"));
        assert!(results[0].transcript.as_deref().unwrap().contains("Hello world"));

        assert_eq!(results[1].src.as_deref(), Some("https://example.com/clip.webm"));
    }

    #[test]
    fn test_format_video() {
        let v1 = VideoResult {
            r#type: "video".to_string(),
            src: Some("https://youtube.com/watch?v=abc".to_string()),
            title: Some("My Video".to_string()),
            duration_seconds: None,
            transcript: Some("Hello, this is a test.".to_string()),
            thumbnail_url: None,
        };
        let formatted1 = format_video(&v1);
        assert!(formatted1.contains("VIDEO"));
        assert!(formatted1.contains("\"My Video\""));
        assert!(formatted1.contains("transcript: Hello, this is a test."));

        let v2 = VideoResult {
            r#type: "video".to_string(),
            src: Some("https://example.com/v.mp4".to_string()),
            title: None,
            duration_seconds: Some(3661),
            transcript: None,
            thumbnail_url: None,
        };
        let formatted2 = format_video(&v2);
        assert!(formatted2.contains("1:01:01"));
        assert!(formatted2.contains("transcript: unavailable"));
    }
}

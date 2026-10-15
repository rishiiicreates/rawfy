use crate::media::video::format_duration;
use crate::types::AudioResult;
use scraper::{ElementRef, Html, Selector};
use std::sync::OnceLock;

static AUDIO_SELECTOR: OnceLock<Selector> = OnceLock::new();
static SOURCE_SELECTOR: OnceLock<Selector> = OnceLock::new();
static LINK_SELECTOR: OnceLock<Selector> = OnceLock::new();
static HEADING_SELECTOR: OnceLock<Selector> = OnceLock::new();

fn audio_selector() -> &'static Selector {
    AUDIO_SELECTOR.get_or_init(|| Selector::parse("audio").expect("valid audio selector"))
}

fn source_selector() -> &'static Selector {
    SOURCE_SELECTOR.get_or_init(|| Selector::parse("source").expect("valid source selector"))
}

fn link_selector() -> &'static Selector {
    LINK_SELECTOR.get_or_init(|| Selector::parse("a[href]").expect("valid link selector"))
}

fn heading_selector() -> &'static Selector {
    HEADING_SELECTOR.get_or_init(|| {
        Selector::parse("h1, h2, h3, h4, h5, h6").expect("valid heading selector")
    })
}

/// Extract audio element information and podcast audio links from HTML.
pub fn extract_audio(html: &str, base_url: &str) -> Vec<AudioResult> {
    let document = Html::parse_document(html);
    let mut results = Vec::new();

    // 1. Extract native <audio> elements
    for audio in document.select(audio_selector()) {
        let direct_src = audio.value().attr("src");
        let source_src = audio
            .select(source_selector())
            .next()
            .and_then(|s| s.value().attr("src"));

        let raw_src = direct_src.or(source_src).map(|s| s.trim()).unwrap_or("");
        let resolved_src = if !raw_src.is_empty() {
            Some(resolve_url(raw_src, base_url))
        } else {
            None
        };

        let title = audio
            .value()
            .attr("title")
            .or_else(|| audio.value().attr("aria-label"))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| find_nearby_heading(&audio));

        let duration_seconds = audio
            .value()
            .attr("duration")
            .or_else(|| audio.value().attr("data-duration"))
            .and_then(|d| d.parse::<f64>().ok())
            .map(|d| d.round() as u64);

        let transcript = find_transcript_link(&audio, base_url);

        results.push(AudioResult {
            r#type: "audio".to_string(),
            src: resolved_src,
            title,
            duration_seconds,
            transcript,
        });
    }

    // 2. Extract podcast / audio links in <a> tags
    for link in document.select(link_selector()) {
        let href = link.value().attr("href").map(|s| s.trim()).unwrap_or("");
        if href.is_empty() {
            continue;
        }

        let is_audio = is_audio_url(href)
            || link
                .value()
                .attr("type")
                .map_or(false, |t| t.to_lowercase().starts_with("audio/"));

        if is_audio {
            let resolved = resolve_url(href, base_url);
            // Avoid duplicate with already discovered audio
            if results
                .iter()
                .any(|r| r.src.as_deref().map_or(false, |s| s == resolved))
            {
                continue;
            }

            let link_text = link.text().collect::<Vec<_>>().join("");
            let trimmed_text = link_text.trim();
            let title = if !trimmed_text.is_empty() {
                Some(trimmed_text.to_string())
            } else {
                find_nearby_heading(&link)
            };

            let transcript = find_transcript_link(&link, base_url);

            results.push(AudioResult {
                r#type: "audio".to_string(),
                src: Some(resolved),
                title,
                duration_seconds: None,
                transcript,
            });
        }
    }

    results
}

/// Format an AudioResult into the WSM placeholder format.
pub fn format_audio(audio: &AudioResult) -> String {
    let mut parts: Vec<String> = vec!["AUDIO".to_string()];
    if let Some(ref title) = audio.title {
        parts.push(format!("\"{}\"", title));
    }
    if let Some(duration) = audio.duration_seconds {
        parts.push(format_duration(duration));
    }
    if let Some(ref src) = audio.src {
        parts.push(format!("src: {}", src));
    }
    if let Some(ref transcript) = audio.transcript {
        parts.push(format!("transcript: {}", transcript));
    } else {
        parts.push("transcript: unavailable".to_string());
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

fn is_audio_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    let path = lower.split('?').next().unwrap_or("");
    path.ends_with(".mp3")
        || path.ends_with(".m4a")
        || path.ends_with(".wav")
        || path.ends_with(".ogg")
        || path.ends_with(".aac")
        || path.ends_with(".flac")
        || path.ends_with(".opus")
}

fn find_nearby_heading(element: &ElementRef) -> Option<String> {
    let mut current = element.parent();
    for _ in 0..3 {
        if let Some(parent_node) = current {
            if let Some(parent_el) = ElementRef::wrap(parent_node) {
                if let Some(heading) = parent_el.select(heading_selector()).next() {
                    let text = heading.text().collect::<Vec<_>>().join("");
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
            current = parent_node.parent();
        } else {
            break;
        }
    }
    None
}

fn find_transcript_link(element: &ElementRef, base_url: &str) -> Option<String> {
    let mut current = element.parent();
    for _ in 0..3 {
        if let Some(parent_node) = current {
            if let Some(parent_el) = ElementRef::wrap(parent_node) {
                for link in parent_el.select(link_selector()) {
                    let href = link.value().attr("href").unwrap_or("");
                    let text = link.text().collect::<Vec<_>>().join("").to_lowercase();
                    if text.contains("transcript") || href.to_lowercase().contains("transcript") {
                        let resolved = resolve_url(href, base_url);
                        return Some(resolved);
                    }
                }
            }
            current = parent_node.parent();
        } else {
            break;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://example.com";

    #[test]
    fn test_extract_audio_basic() {
        let html = r#"
            <html><body>
                <audio src="/podcast.mp3" title="Episode 42"></audio>
            </body></html>
        "#;
        let results = extract_audio(html, BASE);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].src.as_deref(), Some("https://example.com/podcast.mp3"));
        assert_eq!(results[0].title.as_deref(), Some("Episode 42"));
    }

    #[test]
    fn test_extract_audio_with_source() {
        let html = r#"
            <html><body>
                <audio>
                    <source src="/music.ogg" type="audio/ogg">
                </audio>
            </body></html>
        "#;
        let results = extract_audio(html, BASE);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].src.as_deref(), Some("https://example.com/music.ogg"));
    }

    #[test]
    fn test_extract_audio_nearby_heading() {
        let html = r#"
            <html><body>
                <div class="episode">
                    <h3>Episode 42: The Answer</h3>
                    <audio src="/ep42.mp3"></audio>
                </div>
            </body></html>
        "#;
        let results = extract_audio(html, BASE);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title.as_deref(), Some("Episode 42: The Answer"));
    }

    #[test]
    fn test_extract_audio_transcript_link() {
        let html = r#"
            <html><body>
                <div>
                    <audio src="/podcast.mp3" title="My Podcast"></audio>
                    <a href="/transcripts/ep42.txt">View Transcript</a>
                </div>
            </body></html>
        "#;
        let results = extract_audio(html, BASE);
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].transcript.as_deref(),
            Some("https://example.com/transcripts/ep42.txt")
        );
    }

    #[test]
    fn test_podcast_audio_links() {
        let html = r#"
            <html><body>
                <a href="/episodes/interview.mp3">Download Interview</a>
            </body></html>
        "#;
        let results = extract_audio(html, BASE);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].src.as_deref(), Some("https://example.com/episodes/interview.mp3"));
        assert_eq!(results[0].title.as_deref(), Some("Download Interview"));
    }

    #[test]
    fn test_format_audio() {
        let a1 = AudioResult {
            r#type: "audio".to_string(),
            src: Some("https://example.com/podcast.mp3".to_string()),
            title: Some("Episode 42".to_string()),
            duration_seconds: None,
            transcript: Some("https://example.com/transcript.txt".to_string()),
        };
        let formatted = format_audio(&a1);
        assert!(formatted.contains("AUDIO"));
        assert!(formatted.contains("\"Episode 42\""));
        assert!(formatted.contains("transcript: https://example.com/transcript.txt"));

        let a2 = AudioResult {
            r#type: "audio".to_string(),
            src: Some("https://example.com/long.mp3".to_string()),
            title: None,
            duration_seconds: Some(125),
            transcript: None,
        };
        let formatted2 = format_audio(&a2);
        assert!(formatted2.contains("2:05"));
        assert!(formatted2.contains("transcript: unavailable"));
    }
}

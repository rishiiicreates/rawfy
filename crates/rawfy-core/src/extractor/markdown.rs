use regex::{Captures, Regex};
use url::Url;

/// Convert HTML to clean, AI-agent-friendly Markdown.
///
/// Ported from `src/extractor/html-to-md.ts`.
/// - <img> → [IMAGE: alt | src: url]
/// - <video> → [VIDEO | src: url | poster: url]
/// - <audio> → [AUDIO | src: url]
/// - <figure> → preserve with *figcaption*
/// - <details>/<summary> → preserve with **summary**
/// - <code> and <pre><code> → code and fenced code blocks
/// - <table> → markdown tables
/// - <a> → [text](url) with resolved URLs
/// - Cleans excessive whitespace and collapses 3+ newlines to 2.
pub fn html_to_markdown(html: &str, base_url: &str) -> String {
    if html.trim().is_empty() {
        return String::new();
    }

    // Step 1: Pre-process custom media and semantic elements
    let preprocessed = preprocess_html(html, base_url);

    // Step 2: Convert using html2md
    let md = html2md::parse_html(&preprocessed);

    // Step 3: Post-processing cleanup
    postprocess_markdown(&md)
}

fn resolve_url(raw: &str, base: &str) -> String {
    if let Ok(base_url) = Url::parse(base) {
        if let Ok(resolved) = base_url.join(raw) {
            return resolved.to_string();
        }
    }
    raw.to_string()
}

fn extract_attribute(attrs: &str, name: &str) -> Option<String> {
    let pattern = format!(r#"(?i)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#, name);
    if let Ok(re) = Regex::new(&pattern) {
        if let Some(caps) = re.captures(attrs) {
            if let Some(m) = caps.get(1).or_else(|| caps.get(2)).or_else(|| caps.get(3)) {
                return Some(m.as_str().trim().to_string());
            }
        }
    }
    None
}

fn preprocess_html(html: &str, base_url: &str) -> String {
    let mut result = html.to_string();

    // 1. Transform <details><summary>Summary</summary>Body</details>
    if let Ok(re_details) = Regex::new(r"(?is)<details\b[^>]*>\s*<summary\b[^>]*>(.*?)</summary>(.*?)</details>") {
        result = re_details
            .replace_all(&result, |caps: &Captures| {
                let summary = caps[1].trim();
                let body = caps[2].trim();
                let heading = if summary.is_empty() { "Details" } else { summary };
                format!("<p><strong>{}</strong></p>\n<div>{}</div>", heading, body)
            })
            .to_string();
    }

    // 2. Transform <figure> with <figcaption>
    if let Ok(re_figure) = Regex::new(r"(?is)<figure\b[^>]*>(.*?)</figure>") {
        if let Ok(re_caption) = Regex::new(r"(?is)<figcaption\b[^>]*>(.*?)</figcaption>") {
            result = re_figure
                .replace_all(&result, |caps: &Captures| {
                    let content = &caps[1];
                    let mut caption_text = None;
                    let without_caption = re_caption
                        .replace_all(content, |c_caps: &Captures| {
                            caption_text = Some(c_caps[1].trim().to_string());
                            ""
                        })
                        .to_string();

                    if let Some(cap) = caption_text {
                        format!("{}\n<p><em>{}</em></p>", without_caption.trim(), cap)
                    } else {
                        without_caption
                    }
                })
                .to_string();
        }
    }

    // 3. Transform <video> elements
    if let Ok(re_video) = Regex::new(r"(?is)<video\b([^>]*)>(.*?)</video>|<video\b([^>]*)/>") {
        result = re_video
            .replace_all(&result, |caps: &Captures| {
                let attrs = caps.get(1).or_else(|| caps.get(3)).map(|m| m.as_str()).unwrap_or("");
                let body = caps.get(2).map(|m| m.as_str()).unwrap_or("");

                let mut src = extract_attribute(attrs, "src");
                let poster = extract_attribute(attrs, "poster");

                if src.is_none() {
                    // Check <source src="..."> in body
                    if let Ok(re_src) = Regex::new(r#"(?i)<source\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']"#) {
                        if let Some(c) = re_src.captures(body) {
                            src = Some(c[1].trim().to_string());
                        }
                    }
                }

                let final_src = src.map(|s| resolve_url(&s, base_url));
                let mut parts = vec!["VIDEO".to_string()];
                if let Some(ref s) = final_src {
                    if !s.is_empty() {
                        parts.push(format!("src: {}", s));
                    }
                }
                if let Some(ref p) = poster {
                    if !p.is_empty() {
                        let resolved_poster = resolve_url(p, base_url);
                        parts.push(format!("poster: {}", resolved_poster));
                    }
                }

                format!("<p>[{}]</p>", parts.join(" | "))
            })
            .to_string();
    }

    // 4. Transform <audio> elements
    if let Ok(re_audio) = Regex::new(r"(?is)<audio\b([^>]*)>(.*?)</audio>|<audio\b([^>]*)/>") {
        result = re_audio
            .replace_all(&result, |caps: &Captures| {
                let attrs = caps.get(1).or_else(|| caps.get(3)).map(|m| m.as_str()).unwrap_or("");
                let body = caps.get(2).map(|m| m.as_str()).unwrap_or("");

                let mut src = extract_attribute(attrs, "src");
                if src.is_none() {
                    if let Ok(re_src) = Regex::new(r#"(?i)<source\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']"#) {
                        if let Some(c) = re_src.captures(body) {
                            src = Some(c[1].trim().to_string());
                        }
                    }
                }

                let final_src = src.map(|s| resolve_url(&s, base_url));
                if let Some(ref s) = final_src {
                    if !s.is_empty() {
                        return format!("<p>[AUDIO | src: {}]</p>", s);
                    }
                }
                "<p>[AUDIO]</p>".to_string()
            })
            .to_string();
    }

    // 5. Transform <img> elements
    if let Ok(re_img) = Regex::new(r"(?is)<img\b([^>]*)>") {
        result = re_img
            .replace_all(&result, |caps: &Captures| {
                let attrs = &caps[1];
                let alt = extract_attribute(attrs, "alt").unwrap_or_else(|| "no alt text".to_string());
                let alt_clean = if alt.is_empty() { "no alt text".to_string() } else { alt };

                let raw_src = extract_attribute(attrs, "src")
                    .or_else(|| extract_attribute(attrs, "data-src"))
                    .or_else(|| extract_attribute(attrs, "data-lazy-src"))
                    .unwrap_or_default();

                if raw_src.is_empty() {
                    format!("<p>[IMAGE: {}]</p>", alt_clean)
                } else {
                    let resolved_src = resolve_url(&raw_src, base_url);
                    format!("<p>[IMAGE: {} | src: {}]</p>", alt_clean, resolved_src)
                }
            })
            .to_string();
    }

    // 6. Resolve relative URLs in <a> tags
    if let Ok(re_a) = Regex::new(r#"(?is)(<a\b[^>]*?\bhref\s*=\s*["'])([^"']*)(["'][^>]*)>"#) {
        result = re_a
            .replace_all(&result, |caps: &Captures| {
                let prefix = &caps[1];
                let href = &caps[2];
                let suffix = &caps[3];

                if href.starts_with('#')
                    || href.starts_with("javascript:")
                    || href.starts_with("mailto:")
                    || href.starts_with("tel:")
                {
                    format!("{}{}{}>", prefix, href, suffix)
                } else {
                    let resolved = resolve_url(href, base_url);
                    format!("{}{}{}>", prefix, resolved, suffix)
                }
            })
            .to_string();
    }

    result
}

fn postprocess_markdown(md: &str) -> String {
    let mut text = md.to_string();

    // Collapse 3+ newlines to 2
    if let Ok(re_nl) = Regex::new(r"\n{3,}") {
        text = re_nl.replace_all(&text, "\n\n").to_string();
    }

    text.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_html_to_markdown_basic() {
        let html = r#"
            <h1>Main Title</h1>
            <p>This is a paragraph with <a href="/docs/guide">a relative link</a>.</p>
            <img src="/assets/diagram.png" alt="Architecture Diagram" />
            <table>
                <tr><th>Col A</th><th>Col B</th></tr>
                <tr><td>Val 1</td><td>Val 2</td></tr>
            </table>
        "#;

        let md = html_to_markdown(html, "https://example.com");

        assert!(md.contains("Main Title"));
        assert!(md.contains("[a relative link](https://example.com/docs/guide)"));
        assert!(md.contains("[IMAGE: Architecture Diagram | src: https://example.com/assets/diagram.png]"));
        assert!(md.contains("Col A"));
        assert!(md.contains("Col B"));
        assert!(md.contains("Val 1"));
    }

    #[test]
    fn test_media_and_details_transformation() {
        let html = r#"
            <details>
                <summary>Click to view secret</summary>
                <p>Secret content here</p>
            </details>
            <video src="/media/demo.mp4" poster="/media/poster.jpg"></video>
            <audio src="/media/podcast.mp3"></audio>
        "#;

        let md = html_to_markdown(html, "https://example.com");

        assert!(md.contains("**Click to view secret**"));
        assert!(md.contains("Secret content here"));
        assert!(md.contains("[VIDEO | src: https://example.com/media/demo.mp4 | poster: https://example.com/media/poster.jpg]"));
        assert!(md.contains("[AUDIO | src: https://example.com/media/podcast.mp3]"));
    }
}

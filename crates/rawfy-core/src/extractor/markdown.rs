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

    // 0. Clean MediaWiki citation tags, edit sections, and jump links
    if let Ok(re_cite) = Regex::new(r#"(?is)<sup\b[^>]*?(?:class="[^"]*reference[^"]*"|id="cite_ref[^"]*"|data-mw)[^>]*?>.*?</sup>"#) {
        result = re_cite.replace_all(&result, "").to_string();
    }
    if let Ok(re_edit) = Regex::new(r#"(?is)<span\b[^>]*?class="[^"]*mw-editsection[^"]*"[\s\S]*?</span>\s*</span>"#) {
        result = re_edit.replace_all(&result, "").to_string();
    }
    if let Ok(re_jump) = Regex::new(r#"(?is)<a\b[^>]*?class="[^"]*mw-jump-link[^"]*"[^>]*?>.*?</a>"#) {
        result = re_jump.replace_all(&result, "").to_string();
    }
    if let Ok(re_hlink) = Regex::new(r#"(?is)<a\b[^>]*?class=["'][^"']*(?:headerlink|anchor)[^"']*["'][^>]*>.*?</a>"#) {
        result = re_hlink.replace_all(&result, "").to_string();
    }

    // 0a. Transform GitHub/Git diff tables into clean diff code blocks
    if let Ok(re_diff_table) = Regex::new(r#"(?is)<table\b[^>]*?(?:data-diff-anchor|aria-label=["']Diff for|class=["'][^"']*(?:diff-table|js-diff-table|tab-size)[^"']*)[^>]*>(.*?)</table>"#) {
        result = re_diff_table.replace_all(&result, |caps: &Captures| {
            let table_content = &caps[1];
            let mut diff_lines = Vec::new();
            if let Ok(re_row) = Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>") {
                for row_cap in re_row.captures_iter(table_content) {
                    let row = &row_cap[1];
                    if let Ok(re_code_cell) = Regex::new(r#"(?is)<td\b[^>]*?class=["'][^"']*(?:blob-code|diff-text-cell)[^"']*["'][^>]*>(.*?)</td>"#) {
                        if let Some(cell_cap) = re_code_cell.captures(row) {
                            let cell_html = &cell_cap[1];
                            let text = scraper::Html::parse_fragment(cell_html)
                                .root_element()
                                .text()
                                .collect::<String>();
                            let trimmed = text.trim_end_matches(['\r', '\n']);
                            if !trimmed.is_empty() {
                                diff_lines.push(trimmed.to_string());
                            }
                        }
                    }
                }
            }
            if !diff_lines.is_empty() {
                format!("<pre><code class=\"language-diff\">\n{}\n</code></pre>", diff_lines.join("\n"))
            } else {
                String::new()
            }
        }).to_string();
    }

    // 0b. Pre-flatten nested and layout tables so html2md does not explode memory on comment trees
    result = flatten_layout_tables(&result);

    // 0c. Clean Playground, Godbolt, and noisy web IDE links
    if let Ok(re_ide) = Regex::new(r#"(?is)<a\b[^>]*?href=["'][^"']*(?:play\.rust-lang\.org|godbolt\.org)\/\?code=[^"']*["'][^>]*>.*?</a>"#) {
        result = re_ide.replace_all(&result, "").to_string();
    }

    // 0e. Strip styling tags inside <pre> blocks so terminal ANSI colors and spans don't leak
    if let Ok(re_pre) = Regex::new(r"(?is)<pre\b([^>]*)>(.*?)</pre>") {
        result = re_pre.replace_all(&result, |caps: &Captures| {
            let pre_attrs = &caps[1];
            let pre_body = &caps[2];
            if let Ok(re_tags) = Regex::new(r"(?is)</?(?:font|span|u|b|i|em|strong)\b[^>]*>") {
                let stripped = re_tags.replace_all(pre_body, "").to_string();
                format!("<pre{}>{}</pre>", pre_attrs, stripped)
            } else {
                format!("<pre{}>{}</pre>", pre_attrs, pre_body)
            }
        }).to_string();
    }

    // 0f. Strip legacy <font> tags globally and decode &apos;
    if let Ok(re_font) = Regex::new(r"(?is)</?font\b[^>]*>") {
        result = re_font.replace_all(&result, "").to_string();
    }
    result = result.replace("&apos;", "'");

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
    if let Ok(re_video) = Regex::new(r#"(?is)<video\b((?:[^>'"]|"[^"]*"|'[^']*')*)>(.*?)</video>|<video\b((?:[^>'"]|"[^"]*"|'[^']*')*)/>"#) {
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
    if let Ok(re_audio) = Regex::new(r#"(?is)<audio\b((?:[^>'"]|"[^"]*"|'[^']*')*)>(.*?)</audio>|<audio\b((?:[^>'"]|"[^"]*"|'[^']*')*)/>"#) {
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

    // 5. Transform <img> elements (quote-aware to support inline SVG data URLs)
    if let Ok(re_img) = Regex::new(r#"(?is)<img\b((?:[^>'"]|"[^"]*"|'[^']*')*)>"#) {
        result = re_img
            .replace_all(&result, |caps: &Captures| {
                let attrs = &caps[1];

                // Filter 1x1 tracking pixels and small UI icons (<32px)
                let width = extract_attribute(attrs, "width").and_then(|w| w.parse::<u32>().ok());
                let height = extract_attribute(attrs, "height").and_then(|h| h.parse::<u32>().ok());
                if let (Some(w), Some(h)) = (width, height) {
                    if (w < 32 && h < 32) || w < 3 || h < 3 {
                        return String::new();
                    }
                } else if let Some(w) = width {
                    if w < 3 {
                        return String::new();
                    }
                } else if let Some(h) = height {
                    if h < 3 {
                        return String::new();
                    }
                }

                let alt = extract_attribute(attrs, "alt").unwrap_or_default();
                let alt_trimmed = alt.trim();
                let is_placeholder = alt_trimmed.is_empty()
                    || ["image", "photo", "picture", "img", "icon", "logo", "thumbnail", "placeholder", "untitled", "decorative"]
                        .contains(&alt_trimmed.to_lowercase().as_str());
                let title = extract_attribute(attrs, "title").unwrap_or_default();
                let title_trimmed = title.trim();

                let alt_clean = if !is_placeholder {
                    alt_trimmed.to_string()
                } else if !title_trimmed.is_empty() {
                    title_trimmed.to_string()
                } else {
                    "no description".to_string()
                };

                let raw_src = extract_attribute(attrs, "src")
                    .or_else(|| extract_attribute(attrs, "data-src"))
                    .or_else(|| extract_attribute(attrs, "data-lazy-src"))
                    .unwrap_or_default();

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
                {
                    return String::new();
                }

                if raw_src.is_empty() {
                    format!("<p>[IMAGE: {}]</p>", alt_clean)
                } else {
                    let resolved_src = resolve_url(&raw_src, base_url);
                    format!("<p>[IMAGE: {} | src: {}]</p>", alt_clean, resolved_src)
                }
            })
            .to_string();
    }

    // 6. Transform definition lists <dl><dt>...</dt><dd>...</dd></dl> into <ul><li><strong>$1</strong>: $2</li></ul>
    if let Ok(re_dt_dd) = Regex::new(r"(?is)<dt\b[^>]*>(.*?)</dt>\s*<dd\b[^>]*>(.*?)</dd>") {
        result = re_dt_dd.replace_all(&result, "<li><strong>$1</strong>: $2</li>").to_string();
    }
    if let Ok(re_dl_open) = Regex::new(r"(?is)<dl\b[^>]*>") {
        result = re_dl_open.replace_all(&result, "<ul>").to_string();
    }
    if let Ok(re_dl_close) = Regex::new(r"(?is)</dl>") {
        result = re_dl_close.replace_all(&result, "</ul>").to_string();
    }

    // 7. Resolve relative URLs in <a> tags
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

fn flatten_layout_tables(html: &str) -> String {
    if !html.contains("<table") && !html.contains("<TABLE") {
        return html.to_string();
    }

    let mut current = html.to_string();

    // 1. Unwrap tables explicitly marked as presentation or comment layout
    if let Ok(re_pres) = Regex::new(r#"(?is)<table\b[^>]*?(?:role=["'](?:presentation|none)["']|class=["'][^"']*(?:comment-tree|fatitem|subtext|itemlist|athing)[^"']*")[^>]*>(.*?)</table>"#) {
        let mut passes = 0;
        while re_pres.is_match(&current) && passes < 10 {
            passes += 1;
            current = re_pres.replace_all(&current, |caps: &Captures| {
                unwrap_table_tags(&caps[1])
            }).to_string();
        }
    }

    // 2. Unwrap any table that contains another <table inside it or has no <th> / <thead> / class="wikitable"
    if let Ok(re_nested) = Regex::new(r"(?is)<table\b[^>]*>(.*?)</table>") {
        let mut changed = true;
        let mut loop_count = 0;
        while changed && loop_count < 10 {
            changed = false;
            loop_count += 1;
            current = re_nested.replace_all(&current, |caps: &Captures| {
                let inner = &caps[1];
                let is_nested = inner.contains("<table") || inner.contains("<TABLE");
                let has_headers = inner.contains("<th") || inner.contains("<TH") || inner.contains("<thead") || inner.contains("<THEAD") || inner.contains("wikitable");

                if is_nested || !has_headers {
                    changed = true;
                    unwrap_table_tags(inner)
                } else {
                    caps[0].to_string()
                }
            }).to_string();
        }
    }

    current
}

fn unwrap_table_tags(content: &str) -> String {
    let mut s = content.to_string();
    if let Ok(re_tr) = Regex::new(r"(?is)<tr\b[^>]*>") {
        s = re_tr.replace_all(&s, "<div>").to_string();
    }
    s = s.replace("</tr>", "</div>");
    s = s.replace("</TR>", "</div>");

    if let Ok(re_td) = Regex::new(r"(?is)<td\b[^>]*>") {
        s = re_td.replace_all(&s, "<div>").to_string();
    }
    s = s.replace("</td>", "</div>");
    s = s.replace("</TD>", "</div>");

    if let Ok(re_body) = Regex::new(r"(?is)</?(?:tbody|thead|tfoot)\b[^>]*>") {
        s = re_body.replace_all(&s, "").to_string();
    }
    format!("<div>{}</div>", s)
}

fn postprocess_markdown(md: &str) -> String {
    let mut in_code_block = false;
    let mut lines = Vec::new();
    let re_spaces = Regex::new(r" {2,}").unwrap();
    let re_dashes = Regex::new(r"-{4,}").unwrap();
    let re_prose_spaces = Regex::new(r" {4,}").unwrap();

    for line in md.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            lines.push(line.to_string());
            continue;
        }

        if in_code_block {
            lines.push(line.to_string());
        } else {
            // Drop empty divider artifacts
            if trimmed == "|" || trimmed == "| |" || trimmed == "||" {
                continue;
            }

            // Outside code blocks:
            // If the line contains table pipes, collapse runs of 2+ spaces so html2md column-padding
            // does not explode into tens of thousands of spaces per line.
            let cleaned = if line.contains('|') {
                let compacted = re_spaces.replace_all(line, " ").to_string();
                re_dashes.replace_all(&compacted, "---").to_string()
            } else if line.len() > 4000 {
                line.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
            } else {
                re_prose_spaces.replace_all(line, " ").to_string()
            };

            lines.push(cleaned);
        }
    }

    let mut text = lines.join("\n");

    // Clean Wikipedia edit links like "## Heading [edit](...)" or "## Heading [[edit](...)]"
    if let Ok(re_heading_edit) = Regex::new(r#"(?m)^(#{1,6}\s+.*?)\s*\[{1,2}\s*(?:edit|Edit)\s*\](?:\([^)]*\))?\]?"#) {
        text = re_heading_edit.replace_all(&text, "$1").to_string();
    }

    // Clean standalone [edit] or [[edit](url)] lines
    if let Ok(re_edit_line) = Regex::new(r#"(?m)^\s*\[{1,2}\s*(?:edit|Edit)\s*\](?:\([^)]*\))?\]?\s*$\n?"#) {
        text = re_edit_line.replace_all(&text, "").to_string();
    }

    // Clean section jump anchor prefixes like "[§](url)Examples" or "[#](url)Examples"
    if let Ok(re_sec_atx) = Regex::new(r"(?m)^(#{1,6}\s+)\[[§#¶]\](?:\([^)]*\))?\s*(.*)$") {
        text = re_sec_atx.replace_all(&text, "$1$2").to_string();
    }
    if let Ok(re_sec_setext) = Regex::new(r"(?m)^\[[§#¶]\](?:\([^)]*\))?\s*(.*?)\n([=-]{3,})$") {
        text = re_sec_setext.replace_all(&text, "$1\n$2").to_string();
    }

    // Clean trailing section jump anchor links (e.g. "### Heading [#](url)" or "Heading [#](url)\n---")
    if let Ok(re_trail_anchor) = Regex::new(r"(?m)\s*\[[#§¶]\](?:\([^)]*\))?\s*$") {
        text = re_trail_anchor.replace_all(&text, "").to_string();
    }

    // Clean trailing closed ATX heading hashes (e.g. "### Title ###" -> "### Title")
    if let Ok(re_closed_heading) = Regex::new(r"(?m)^(#{1,6}\s+.*?)\s+#+\s*$") {
        text = re_closed_heading.replace_all(&text, "$1").to_string();
    }

    // Merge standalone language line before code block: "js\n\n```" or "python\n```" -> "```js"
    if let Ok(re_lang_fence) = Regex::new(r"(?m)^(js|javascript|ts|typescript|py|python|rust|rs|bash|sh|json|sql|html|css|c|cpp|yaml|diff|toml|text|go)\s*\n+\s*```\s*$") {
        text = re_lang_fence.replace_all(&text, "```$1").to_string();
    }

    // Clean empty link artifacts like "[\n\n](url)" or "[](url)"
    if let Ok(re_empty_link) = Regex::new(r"(?m)\[\s*\]\([^)]+\)") {
        text = re_empty_link.replace_all(&text, "").to_string();
    }

    // Strip leaked raw HTML styling tags (e.g. <font color="...">, <fontcolor="...">, <span>, <u>)
    if let Ok(re_leak) = Regex::new(r"(?is)</?(?:font\w*|span|u|b)\b[^>]*>") {
        text = re_leak.replace_all(&text, "").to_string();
    }
    text = text.replace("&apos;", "'");

    // Ensure space between alphanumeric char and markdown link (e.g. "see[link]" -> "see [link]")
    if let Ok(re_link_space) = Regex::new(r"([a-zA-Z0-9])(\[[^\]\n]+\]\([^\)\n]+\))") {
        text = re_link_space.replace_all(&text, "$1 $2").to_string();
    }

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

    #[test]
    fn test_svg_data_url_and_tracking_pixels() {
        let html = r#"
            <div>
                <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><circle cx='10' cy='10' r='10'/></svg>" alt="Vector Icon" />
                <img src="/tracker.gif" width="1" height="1" alt="tracking" />
                <img src="/spacer.gif" alt="" />
            </div>
        "#;
        let md = html_to_markdown(html, "https://example.com");
        assert!(md.contains("[IMAGE: Vector Icon | src: data:image/svg+xml"));
        assert!(!md.contains("tracker.gif"));
        assert!(!md.contains("spacer.gif"));
    }

    #[test]
    fn test_definition_lists_and_citations() {
        let html = r##"
            <p>Rust is memory safe<sup class="reference" id="cite_ref-1"><a href="#cite_note-1">[1]</a></sup>.</p>
            <dl>
                <dt>Ownership</dt>
                <dd>Each value in Rust has an owner.</dd>
                <dt>Borrowing</dt>
                <dd>References can be shared or mutable.</dd>
            </dl>
        "##;
        let md = html_to_markdown(html, "https://example.com");
        assert!(md.contains("Rust is memory safe"));
        assert!(!md.contains("[1]"));
        assert!(md.contains("**Ownership**: Each value in Rust has an owner."));
        assert!(md.contains("**Borrowing**: References can be shared or mutable."));
    }

    #[test]
    fn test_sphinx_code_block() {
        let html = r#"
            <div class="highlight-python3 notranslate"><div class="highlight"><pre><span></span><span class="k">async</span> <span class="k">def</span><span class="w"> </span><span class="nf">main</span><span class="p">():</span>
    <span class="k">await</span> <span class="n">asyncio</span><span class="o">.</span><span class="n">sleep</span><span class="p">(</span><span class="mi">1</span><span class="p">)</span>
    <span class="nb">print</span><span class="p">(</span><span class="s1">&#39;hello&#39;</span><span class="p">)</span>
</pre></div></div>
        "#;
        let md = html_to_markdown(html, "https://example.com");
        println!("=== MD OUTPUT ===\n{}\n================", md);
        assert!(md.contains("async def main():"), "Got md:\n{}", md);
    }
}

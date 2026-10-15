use crate::types::ReadabilityResult;
use regex::Regex;
use scraper::{Html, Selector};
use std::io::Cursor;
use url::Url;

/// Extract readable article content from raw HTML using Readability with DOM fallback.
///
/// Ported from `src/extractor/readability.ts`.
/// - Wraps the `readability` crate to extract article title and content.
/// - Falls back to cleaned `<body>` HTML if Readability yields nothing or
///   suspiciously small output (< 100 words) on large documents (> 50KB).
/// - Enriches results with `excerpt`, `byline`, and `site_name` from metadata.
pub fn extract_readability(html: &str, url: &str) -> ReadabilityResult {
    let parsed_url = Url::parse(url).unwrap_or_else(|_| Url::parse("https://example.com").unwrap());
    let mut cursor = Cursor::new(html.as_bytes());

    if let Ok(product) = readability::extractor::extract(&mut cursor, &parsed_url) {
        let word_count = product.content.split_whitespace().count();

        // Heuristic: If output is suspiciously small but HTML is huge (>50KB),
        // Readability likely stripped too much (e.g. API docs / dashboards).
        if word_count < 100 && html.len() > 50_000 {
            return extract_body_fallback(html, url);
        }

        let (site_name, byline, excerpt) = extract_meta_enrichments(html);
        let title = if product.title.trim().is_empty() {
            extract_title_fallback(html)
        } else {
            product.title.trim().to_string()
        };

        ReadabilityResult {
            title,
            content: product.content.trim().to_string(),
            excerpt,
            byline,
            site_name,
        }
    } else {
        extract_body_fallback(html, url)
    }
}

/// Fallback extraction: grab cleaned `<body>` inner HTML.
pub fn extract_body_fallback(html: &str, _url: &str) -> ReadabilityResult {
    let document = Html::parse_document(html);
    let title = extract_title_fallback(html);
    let (site_name, byline, excerpt) = extract_meta_enrichments(html);

    let raw_content = if let Ok(sel) = Selector::parse("body") {
        if let Some(body) = document.select(&sel).next() {
            body.inner_html()
        } else {
            html.to_string()
        }
    } else {
        html.to_string()
    };

    // Remove <script>, <style>, <noscript> blocks
    let cleaned = strip_non_content_tags(&raw_content);

    ReadabilityResult {
        title,
        content: cleaned.trim().to_string(),
        excerpt,
        byline,
        site_name,
    }
}

fn extract_title_fallback(html: &str) -> String {
    let document = Html::parse_document(html);

    if let Ok(sel) = Selector::parse("title") {
        if let Some(el) = document.select(&sel).next() {
            let t = el.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return t;
            }
        }
    }

    if let Ok(sel) = Selector::parse("h1") {
        if let Some(el) = document.select(&sel).next() {
            let t = el.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return t;
            }
        }
    }

    String::new()
}

fn extract_meta_enrichments(html: &str) -> (Option<String>, Option<String>, Option<String>) {
    let document = Html::parse_document(html);

    let mut site_name = get_meta_attr(&document, "property", "og:site_name")
        .or_else(|| get_meta_attr(&document, "name", "application-name"));

    let mut byline = get_meta_attr(&document, "name", "author")
        .or_else(|| get_meta_attr(&document, "property", "article:author"));

    let excerpt = get_meta_attr(&document, "name", "description")
        .or_else(|| get_meta_attr(&document, "property", "og:description"));

    // Check author link rel="author"
    if byline.is_none() {
        if let Ok(sel) = Selector::parse("[rel~=\"author\"]") {
            if let Some(el) = document.select(&sel).next() {
                let author_text = el.text().collect::<String>().trim().to_string();
                if !author_text.is_empty() {
                    byline = Some(author_text);
                }
            }
        }
    }

    if site_name.as_deref() == Some("") {
        site_name = None;
    }
    if byline.as_deref() == Some("") {
        byline = None;
    }

    (site_name, byline, excerpt)
}

fn get_meta_attr(document: &Html, attr_name: &str, attr_val: &str) -> Option<String> {
    let selector_str = format!("meta[{}={:?}]", attr_name, attr_val);
    if let Ok(sel) = Selector::parse(&selector_str) {
        for el in document.select(&sel) {
            if let Some(content) = el.value().attr("content") {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn strip_non_content_tags(html: &str) -> String {
    // Strip <script>...</script>, <style>...</style>, <noscript>...</noscript>
    if let Ok(re) = Regex::new(r"(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>") {
        let stripped = re.replace_all(html, "");
        // Strip self-closing or empty script/style tags
        if let Ok(re_self) = Regex::new(r"(?is)<(script|style|noscript)[^>]*?/>") {
            return re_self.replace_all(&stripped, "").to_string();
        }
        return stripped.to_string();
    }
    html.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_readability_article_extraction() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Rust Web Scraping Article</title>
                <meta name="author" content="Ferris the Crab">
                <meta name="description" content="A guide to scraping web pages with Rust.">
                <meta property="og:site_name" content="Rustacean Daily">
            </head>
            <body>
                <header><nav><a href="/">Home</a></nav></header>
                <article>
                    <h1>Rust Web Scraping Article</h1>
                    <p>Rust is a blazingly fast and memory-efficient systems programming language with a rich ecosystem.</p>
                    <p>Scraping web pages in Rust with crates like scraper and readability is straightforward and pleasant.</p>
                </article>
                <footer><p>Copyright 2026</p></footer>
            </body>
            </html>
        "#;

        let result = extract_readability(html, "https://example.com/rust-scraping");
        assert!(result.title.contains("Rust"));
        assert!(!result.content.is_empty());
        assert_eq!(result.byline.as_deref(), Some("Ferris the Crab"));
        assert_eq!(result.excerpt.as_deref(), Some("A guide to scraping web pages with Rust."));
        assert_eq!(result.site_name.as_deref(), Some("Rustacean Daily"));
    }

    #[test]
    fn test_body_fallback() {
        let html = r#"
            <html>
            <head><title>Dashboard</title></head>
            <body>
                <script>console.log("secret code");</script>
                <style>body { color: red; }</style>
                <div><h2>Active Tasks</h2><p>Here are your current tasks.</p></div>
            </body>
            </html>
        "#;

        let result = extract_body_fallback(html, "https://example.com/dashboard");
        assert_eq!(result.title, "Dashboard");
        assert!(!result.content.contains("console.log"));
        assert!(!result.content.contains("color: red"));
        assert!(result.content.contains("Active Tasks"));
    }
}

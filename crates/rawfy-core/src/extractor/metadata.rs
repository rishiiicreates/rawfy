use crate::types::{OpenGraphData, PageMetadata, PageType};
use scraper::{Html, Selector};
use std::collections::HashMap;
use url::Url;

/// Extract structured metadata from HTML.
///
/// Ported from `src/extractor/metadata.ts`.
/// - Page title (from `<title>`, `og:title`, `h1`)
/// - Meta description
/// - Canonical URL
/// - Language (`<html lang>` or `content-language` header)
/// - OpenGraph (`og:title`, `og:type`, `og:description`, `og:image`, `og:url`, `og:site_name`)
/// - JSON-LD schemas (`<script type="application/ld+json">`)
/// - Word count and reading time (words / 200)
/// - Page type classification (Article, Product, Docs, Search, Homepage, Video, Other)
pub fn extract_metadata(
    html: &str,
    url: &str,
    headers: Option<&HashMap<String, String>>,
    body_text: Option<&str>,
    interactive_count: usize,
) -> PageMetadata {
    let document = Html::parse_document(html);

    // OpenGraph data
    let og_data = extract_open_graph(&document);

    // Title: <title>, og:title fallback, then first <h1>
    let title = extract_title(&document, og_data.as_ref());

    // Description: <meta name="description">, then og:description
    let description = get_meta_tag(&document, "description")
        .or_else(|| og_data.as_ref().and_then(|o| o.description.clone()));

    // Canonical URL
    let canonical_url = extract_canonical_url(&document, url);

    // Language: <html lang>, then content-language header
    let lang = extract_lang(&document, headers);

    // JSON-LD schemas
    let json_ld = extract_json_ld(&document);

    // Word count and reading time
    let (word_count, reading_time_minutes) = calculate_word_metrics(&document, body_text);

    // Page type classification
    let page_type = classify_page_type(html, url, og_data.as_ref(), json_ld.as_deref());

    let fetched_at = chrono::Utc::now().to_rfc3339();

    PageMetadata {
        url: url.to_string(),
        canonical_url,
        r#type: page_type,
        fetched_at,
        lang,
        title,
        description,
        word_count,
        reading_time_minutes,
        interactive_element_count: interactive_count,
        og: og_data,
        json_ld,
    }
}

/// Convenience overload for extract_metadata with defaults.
pub fn extract_metadata_simple(html: &str, url: &str) -> PageMetadata {
    extract_metadata(html, url, None, None, 0)
}

fn extract_title(document: &Html, og: Option<&OpenGraphData>) -> Option<String> {
    // 1. <title> tag
    if let Ok(sel) = Selector::parse("title") {
        if let Some(el) = document.select(&sel).next() {
            let t = el.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }

    // 2. og:title fallback
    if let Some(og_title) = og.and_then(|o| o.title.as_deref()) {
        if !og_title.is_empty() {
            return Some(og_title.to_string());
        }
    }

    // 3. <h1> tag fallback
    if let Ok(sel) = Selector::parse("h1") {
        if let Some(el) = document.select(&sel).next() {
            let t = el.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }

    None
}

fn extract_canonical_url(document: &Html, base_url: &str) -> Option<String> {
    if let Ok(sel) = Selector::parse("link[rel~=\"canonical\"]") {
        if let Some(el) = document.select(&sel).next() {
            if let Some(href) = el.value().attr("href") {
                let trimmed = href.trim();
                if !trimmed.is_empty() {
                    // Try to resolve relative URL if needed
                    if let Ok(base) = Url::parse(base_url) {
                        if let Ok(resolved) = base.join(trimmed) {
                            return Some(resolved.to_string());
                        }
                    }
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn extract_lang(document: &Html, headers: Option<&HashMap<String, String>>) -> Option<String> {
    if let Ok(sel) = Selector::parse("html[lang]") {
        if let Some(el) = document.select(&sel).next() {
            if let Some(lang) = el.value().attr("lang") {
                let trimmed = lang.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if k.eq_ignore_ascii_case("content-language") {
                let first = v.split(',').next().map(|s| s.trim()).unwrap_or("");
                if !first.is_empty() {
                    return Some(first.to_string());
                }
            }
        }
    }

    None
}

fn get_meta_tag(document: &Html, name_or_prop: &str) -> Option<String> {
    get_meta_content(document, "property", name_or_prop)
        .or_else(|| get_meta_content(document, "name", name_or_prop))
}

fn get_meta_content(document: &Html, attr_name: &str, attr_val: &str) -> Option<String> {
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

fn extract_open_graph(document: &Html) -> Option<OpenGraphData> {
    let title = get_meta_tag(document, "og:title");
    let r#type = get_meta_tag(document, "og:type");
    let description = get_meta_tag(document, "og:description");
    let image = get_meta_tag(document, "og:image");
    let url = get_meta_tag(document, "og:url");
    let site_name = get_meta_tag(document, "og:site_name");

    let has_any = title.is_some()
        || r#type.is_some()
        || description.is_some()
        || image.is_some()
        || url.is_some()
        || site_name.is_some();

    if has_any {
        Some(OpenGraphData {
            title,
            r#type,
            description,
            image,
            url,
            site_name,
        })
    } else {
        None
    }
}

fn extract_json_ld(document: &Html) -> Option<Vec<serde_json::Value>> {
    let mut results = Vec::new();

    if let Ok(sel) = Selector::parse("script[type=\"application/ld+json\"]") {
        for el in document.select(&sel) {
            let text = el.text().collect::<String>().trim().to_string();
            if !text.is_empty() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    results.push(value);
                }
            }
        }
    }

    if results.is_empty() {
        None
    } else {
        Some(results)
    }
}

fn calculate_word_metrics(document: &Html, body_text: Option<&str>) -> (usize, usize) {
    let count = if let Some(txt) = body_text {
        if !txt.is_empty() {
            if txt.contains('<') && txt.contains('>') {
                let fragment = Html::parse_fragment(txt);
                fragment
                    .root_element()
                    .text()
                    .collect::<String>()
                    .split_whitespace()
                    .count()
            } else {
                txt.split_whitespace().count()
            }
        } else {
            count_words_from_doc(document)
        }
    } else {
        count_words_from_doc(document)
    };

    let reading_time = if count == 0 {
        0
    } else {
        std::cmp::max(1, (count + 199) / 200)
    };

    (count, reading_time)
}

fn count_words_from_doc(document: &Html) -> usize {
    if let Ok(sel) = Selector::parse("body") {
        if let Some(body) = document.select(&sel).next() {
            let text = body.text().collect::<String>();
            return text.split_whitespace().count();
        }
    }
    let all_text = document.root_element().text().collect::<String>();
    all_text.split_whitespace().count()
}

/// Classify page type using JSON-LD, OpenGraph, URL, and Content heuristics.
pub fn classify_page_type(
    html: &str,
    url: &str,
    og: Option<&OpenGraphData>,
    json_ld: Option<&[serde_json::Value]>,
) -> PageType {
    // 1. JSON-LD @type check
    if let Some(schemas) = json_ld {
        if let Some(t) = get_json_ld_type(schemas) {
            return t;
        }
    }

    // 2. OG:type check
    if let Some(og_data) = og {
        if let Some(ref og_type) = og_data.r#type {
            if let Some(t) = map_og_type(og_type) {
                return t;
            }
        }
    }

    // 3. URL-based heuristics
    if let Some(t) = classify_by_url(url) {
        return t;
    }

    // 4. Content-based heuristics
    if let Some(t) = classify_by_content(html) {
        return t;
    }

    PageType::Other
}

fn get_json_ld_type(schemas: &[serde_json::Value]) -> Option<PageType> {
    for schema in schemas {
        if let Some(t) = inspect_json_ld_item(schema) {
            return Some(t);
        }
    }
    None
}

fn inspect_json_ld_item(val: &serde_json::Value) -> Option<PageType> {
    match val {
        serde_json::Value::Object(map) => {
            if let Some(type_val) = map.get("@type") {
                if let Some(t) = match_type_string(type_val) {
                    return Some(t);
                }
            }
            // Check @graph array if present
            if let Some(serde_json::Value::Array(graph)) = map.get("@graph") {
                for item in graph {
                    if let Some(t) = inspect_json_ld_item(item) {
                        return Some(t);
                    }
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(t) = inspect_json_ld_item(item) {
                    return Some(t);
                }
            }
        }
        _ => {}
    }
    None
}

fn match_type_string(type_val: &serde_json::Value) -> Option<PageType> {
    let check_str = |s: &str| -> Option<PageType> {
        let lower = s.to_lowercase();
        if lower.contains("article")
            || lower.contains("newsarticle")
            || lower.contains("blogposting")
            || lower.contains("scholararticle")
        {
            return Some(PageType::Article);
        }
        if lower.contains("product") || lower.contains("offer") {
            return Some(PageType::Product);
        }
        if lower.contains("videoobject") {
            return Some(PageType::Video);
        }
        if lower.contains("searchresultspage") {
            return Some(PageType::Search);
        }
        None
    };

    match type_val {
        serde_json::Value::String(s) => check_str(s),
        serde_json::Value::Array(arr) => {
            for v in arr {
                if let serde_json::Value::String(s) = v {
                    if let Some(t) = check_str(s) {
                        return Some(t);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

fn map_og_type(og_type: &str) -> Option<PageType> {
    let lower = og_type.trim().to_lowercase();
    if lower == "article" {
        return Some(PageType::Article);
    }
    if lower == "product" || lower == "product.item" {
        return Some(PageType::Product);
    }
    if lower.starts_with("video") {
        return Some(PageType::Video);
    }
    None
}

fn classify_by_url(url: &str) -> Option<PageType> {
    let parsed = Url::parse(url).ok()?;
    let path = parsed.path().to_lowercase();

    // Homepage
    if path.is_empty() || path == "/" {
        return Some(PageType::Homepage);
    }

    // Search query or path
    let has_search_query = parsed.query_pairs().any(|(k, _)| {
        let k_lower = k.to_lowercase();
        k_lower == "q" || k_lower == "query" || k_lower == "search"
    });
    if has_search_query || path.contains("/search") {
        return Some(PageType::Search);
    }

    // Docs
    if path.contains("/docs")
        || path.contains("/documentation")
        || path.contains("/guide")
        || path.contains("/tutorial")
        || path.contains("/reference")
        || path.contains("/api/")
    {
        return Some(PageType::Docs);
    }

    // Article
    if path.contains("/blog")
        || path.contains("/post")
        || path.contains("/article")
        || path.contains("/news")
    {
        return Some(PageType::Article);
    }

    // Product
    if path.contains("/product") || path.contains("/item") || path.contains("/shop/") {
        return Some(PageType::Product);
    }

    None
}

fn classify_by_content(html: &str) -> Option<PageType> {
    let lower = html.to_lowercase();

    if lower.contains("<video")
        || lower.contains("youtube.com/embed")
        || lower.contains("player.vimeo.com")
    {
        return Some(PageType::Video);
    }

    if lower.contains("<article")
        || lower.contains("class=\"post-content\"")
        || lower.contains("class=\"entry-content\"")
        || lower.contains("class=\"article-body\"")
    {
        return Some(PageType::Article);
    }

    if lower.contains("add-to-cart")
        || lower.contains("add_to_cart")
        || lower.contains("class=\"price\"")
    {
        return Some(PageType::Product);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_metadata_basic() {
        let html = r#"
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <title>Test Page Title</title>
                <meta name="description" content="This is a test description.">
                <link rel="canonical" href="https://example.com/canonical-test">
                <meta property="og:title" content="OG Title">
                <meta property="og:type" content="article">
                <meta property="og:image" content="https://example.com/image.png">
                <script type="application/ld+json">
                {
                    "@context": "https://schema.org",
                    "@type": "BlogPosting",
                    "headline": "Test Post"
                }
                </script>
            </head>
            <body>
                <h1>Header One</h1>
                <p>This is a paragraph with several words to test word counting calculation properly.</p>
            </body>
            </html>
        "#;

        let meta = extract_metadata(html, "https://example.com/test", None, None, 2);

        assert_eq!(meta.url, "https://example.com/test");
        assert_eq!(meta.title.as_deref(), Some("Test Page Title"));
        assert_eq!(meta.description.as_deref(), Some("This is a test description."));
        assert_eq!(meta.canonical_url.as_deref(), Some("https://example.com/canonical-test"));
        assert_eq!(meta.lang.as_deref(), Some("en"));
        assert_eq!(meta.r#type, PageType::Article);
        assert_eq!(meta.interactive_element_count, 2);

        let og = meta.og.expect("og data should be present");
        assert_eq!(og.title.as_deref(), Some("OG Title"));
        assert_eq!(og.r#type.as_deref(), Some("article"));
        assert_eq!(og.image.as_deref(), Some("https://example.com/image.png"));

        assert!(meta.json_ld.is_some());
        assert_eq!(meta.json_ld.unwrap().len(), 1);
        assert!(meta.word_count > 0);
        assert_eq!(meta.reading_time_minutes, 1);
    }

    #[test]
    fn test_classify_by_url_and_content() {
        assert_eq!(classify_by_url("https://example.com/"), Some(PageType::Homepage));
        assert_eq!(classify_by_url("https://example.com/docs/intro"), Some(PageType::Docs));
        assert_eq!(classify_by_url("https://example.com/blog/rust-tips"), Some(PageType::Article));
        assert_eq!(classify_by_url("https://example.com/search?q=rust"), Some(PageType::Search));
        assert_eq!(classify_by_url("https://example.com/product/shoes"), Some(PageType::Product));

        let html_video = "<div><video src='video.mp4'></video></div>";
        assert_eq!(classify_by_content(html_video), Some(PageType::Video));
    }
}

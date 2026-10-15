use crate::types::PdfResult;
use regex::Regex;
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::sync::OnceLock;

/// Options for PDF extraction
#[derive(Debug, Clone)]
pub struct PdfExtractOptions {
    /// Maximum number of PDFs to process (default: 3)
    pub max_pdfs: usize,
    /// Maximum pages to extract per PDF (default: 20)
    pub max_pages: usize,
    /// Fetch timeout per PDF in ms (default: 15000)
    pub timeout_ms: u64,
}

impl Default for PdfExtractOptions {
    fn default() -> Self {
        Self {
            max_pdfs: 3,
            max_pages: 20,
            timeout_ms: 15000,
        }
    }
}

static LINK_SELECTOR: OnceLock<Selector> = OnceLock::new();
static EMBED_SELECTOR: OnceLock<Selector> = OnceLock::new();
static PDF_EXT_RE: OnceLock<Regex> = OnceLock::new();
static WS_RE: OnceLock<Regex> = OnceLock::new();

fn link_selector() -> &'static Selector {
    LINK_SELECTOR.get_or_init(|| Selector::parse("a[href]").expect("valid link selector"))
}

fn embed_selector() -> &'static Selector {
    EMBED_SELECTOR.get_or_init(|| {
        Selector::parse("iframe[src], embed[src], object[data]").expect("valid embed selector")
    })
}

/// Detect PDF links and iframe/embed tags in HTML.
pub async fn extract_pdfs(
    html: &str,
    base_url: &str,
    options: Option<&PdfExtractOptions>,
) -> Vec<PdfResult> {
    let default_options = PdfExtractOptions::default();
    let opts = options.unwrap_or(&default_options);

    let to_process = {
        let document = Html::parse_document(html);
        let mut candidate_urls = Vec::new();
        let mut seen = HashSet::new();

        // 1. Scan <a> links
        for link in document.select(link_selector()) {
            let href = link.value().attr("href").unwrap_or("").trim();
            if href.is_empty() {
                continue;
            }

            let is_pdf = href.to_lowercase().ends_with(".pdf")
                || href.to_lowercase().contains(".pdf?")
                || href.to_lowercase().contains("/pdf/")
                || link
                    .value()
                    .attr("type")
                    .map_or(false, |t| t.to_lowercase().contains("pdf"));

            if is_pdf {
                let resolved = resolve_url(href, base_url);
                if seen.insert(resolved.clone()) {
                    candidate_urls.push(resolved);
                }
            }
        }

        // 2. Scan iframes, embeds, and objects
        for el in document.select(embed_selector()) {
            let src = el
                .value()
                .attr("src")
                .or_else(|| el.value().attr("data"))
                .unwrap_or("")
                .trim();

            if src.is_empty() {
                continue;
            }

            let is_pdf = src.to_lowercase().contains(".pdf")
                || el
                    .value()
                    .attr("type")
                    .map_or(false, |t| t.to_lowercase().contains("pdf"));

            if is_pdf {
                let resolved = resolve_url(src, base_url);
                if seen.insert(resolved.clone()) {
                    candidate_urls.push(resolved);
                }
            }
        }

        candidate_urls
            .into_iter()
            .take(opts.max_pdfs)
            .collect::<Vec<_>>()
    };

    let mut results = Vec::new();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(opts.timeout_ms))
        .build()
        .unwrap_or_default();

    for pdf_url in to_process {
        let title = extract_title_from_url(&pdf_url);
        // Attempt fetch
        match client
            .get(&pdf_url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            )
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                // If fetch succeeded, record the PDF with metadata
                results.push(PdfResult {
                    r#type: "pdf".to_string(),
                    src: pdf_url,
                    title,
                    page_count: None,
                    text: None,
                });
            }
            _ => {
                // Fetch failed or timed out, still record the PDF
                results.push(PdfResult {
                    r#type: "pdf".to_string(),
                    src: pdf_url,
                    title,
                    page_count: None,
                    text: None,
                });
            }
        }
    }

    results
}

/// Format a PdfResult into the WSM placeholder format.
pub fn format_pdf(pdf: &PdfResult) -> String {
    let mut parts: Vec<String> = vec!["PDF".to_string()];
    if let Some(ref title) = pdf.title {
        parts.push(format!("\"{}\"", title));
    }
    if let Some(page_count) = pdf.page_count {
        parts.push(format!("{} pages", page_count));
    }
    if let Some(ref text) = pdf.text {
        let truncated = if text.chars().count() > 500 {
            let s: String = text.chars().take(497).collect();
            format!("{}...", s)
        } else {
            text.clone()
        };
        parts.push(format!("text: {}", truncated));
    } else {
        parts.push("text: extraction failed".to_string());
    }
    format!("[{}]", parts.join(" | "))
}

/// Extract human-readable title from a PDF URL.
pub fn extract_title_from_url(raw_url: &str) -> Option<String> {
    let parsed = url::Url::parse(raw_url).ok()?;
    let path = parsed.path();
    let filename = path.split('/').next_back()?;
    if filename.is_empty() {
        return None;
    }

    let re = PDF_EXT_RE.get_or_init(|| Regex::new(r"(?i)\.pdf$").unwrap());
    let without_ext = re.replace(filename, "");
    let cleaned = without_ext.replace(['-', '_'], " ");
    let ws = WS_RE.get_or_init(|| Regex::new(r"\s+").unwrap());
    let trimmed = ws.replace_all(&cleaned, " ").trim().to_string();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://example.com";

    #[test]
    fn test_extract_title_from_url() {
        assert_eq!(
            extract_title_from_url("https://example.com/docs/manual.pdf"),
            Some("manual".to_string())
        );
        assert_eq!(
            extract_title_from_url("https://example.com/files/annual_report_2024.pdf?v=2"),
            Some("annual report 2024".to_string())
        );
    }

    #[tokio::test]
    async fn test_extract_pdfs_link_detection() {
        let html = r#"
            <html><body>
                <a href="/docs/manual.pdf">Download Manual</a>
                <a href="/files/report.pdf?v=2">Report</a>
                <a href="/docs/manual.pdf">Duplicate Link</a>
            </body></html>
        "#;
        let results = extract_pdfs(html, BASE, None).await;
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].src, "https://example.com/docs/manual.pdf");
        assert_eq!(results[0].title.as_deref(), Some("manual"));
        assert_eq!(results[1].src, "https://example.com/files/report.pdf?v=2");
    }

    #[tokio::test]
    async fn test_extract_pdfs_max_pdfs() {
        let mut links = String::new();
        for i in 0..10 {
            links.push_str(&format!(r#"<a href="/doc{}.pdf">PDF {}</a>"#, i, i));
        }
        let html = format!("<html><body>{}</body></html>", links);
        let options = PdfExtractOptions {
            max_pdfs: 2,
            ..Default::default()
        };
        let results = extract_pdfs(&html, BASE, Some(&options)).await;
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_format_pdf() {
        let p1 = PdfResult {
            r#type: "pdf".to_string(),
            src: "https://example.com/doc.pdf".to_string(),
            title: Some("Annual Report".to_string()),
            page_count: Some(42),
            text: Some("Revenue increased by 15%...".to_string()),
        };
        let formatted = format_pdf(&p1);
        assert!(formatted.contains("PDF"));
        assert!(formatted.contains("\"Annual Report\""));
        assert!(formatted.contains("42 pages"));
        assert!(formatted.contains("text: Revenue increased by 15%..."));

        let p2 = PdfResult {
            r#type: "pdf".to_string(),
            src: "https://example.com/doc.pdf".to_string(),
            title: None,
            page_count: None,
            text: None,
        };
        let formatted2 = format_pdf(&p2);
        assert!(formatted2.contains("text: extraction failed"));
    }
}

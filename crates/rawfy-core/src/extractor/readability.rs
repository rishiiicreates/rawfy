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
    let preprocessed_html = preprocess_html_for_readability(html);
    let parsed_url = Url::parse(url).unwrap_or_else(|_| Url::parse("https://example.com").unwrap());

    let mut cursor = Cursor::new(preprocessed_html.as_bytes());

    if let Ok(product) = readability::extractor::extract(&mut cursor, &parsed_url) {
        let word_count = product.content.split_whitespace().count();

        // Table preservation heuristic:
        // On data/spec-dense pages (like Wikipedia lists or comparison tables),
        // Readability aggressively strips <table> tags due to low prose density.
        let orig_has_table = (preprocessed_html.contains("<th") || preprocessed_html.contains("<TH") || preprocessed_html.contains("<thead") || preprocessed_html.contains("<THEAD") || preprocessed_html.contains("class=\"wikitable\""))
            && (preprocessed_html.contains("<table") || preprocessed_html.contains("<TABLE"));
        let prod_has_table = product.content.contains("<table") || product.content.contains("<TABLE");
        if orig_has_table && !prod_has_table && word_count < 300 {
            return extract_body_fallback(&preprocessed_html, url);
        }

        // Suspiciously small output (< 35 words) on discussion pages or pages with content (>8KB)
        if word_count < 35 && (preprocessed_html.len() > 8_000 || preprocessed_html.contains("class=\"comment\"") || preprocessed_html.contains("class=\"commtext\"") || preprocessed_html.contains("id=\"hnmain\"")) {
            return extract_body_fallback(&preprocessed_html, url);
        }

        // Suspiciously small output on large documents (>50KB)
        if word_count < 100 && preprocessed_html.len() > 50_000 {
            return extract_body_fallback(&preprocessed_html, url);
        }

        // Sphinx / API documentation signature preservation heuristic:
        // If the preprocessed HTML contained API signatures (class="sig"), but Readability's product.content dropped them,
        // fallback to body extraction where the main container keeps all signatures.
        if preprocessed_html.contains("class=\"sig") && !product.content.contains("class=\"sig") {
            return extract_body_fallback(&preprocessed_html, url);
        }

        // Wikipedia / MediaWiki article truncation heuristic:
        // Readability crate often scores a single subsection div highest on Wikipedia/MediaWiki articles,
        // prematurely cutting off later sections (e.g. Formal analysis, Variants, etc.).
        if preprocessed_html.contains("mw-parser-output") {
            if let Ok(sel) = Selector::parse(".mw-parser-output") {
                let doc = Html::parse_document(&preprocessed_html);
                if let Some(mw_content) = doc.select(&sel).next() {
                    let mw_text = mw_content.text().collect::<String>();
                    let mw_words = mw_text.split_whitespace().count();
                    // If Readability dropped more than 35% of the article body from mw-parser-output
                    if mw_words > 1000 && word_count < (mw_words * 65 / 100) {
                        return extract_body_fallback(&preprocessed_html, url);
                    }
                }
            }
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
        extract_body_fallback(&preprocessed_html, url)
    }
}

/// Preprocess raw HTML before running Readability to preserve technical content:
/// 1. Sphinx / API documentation function signatures (`<dt class="sig...">`) -> `<h3><code>...</code></h3>`
/// 2. Code blocks (`<pre>...</pre>`): strip styling spans, convert whitespace spans, ensure `<code>` wrapping so Readability doesn't collapse indentation.
/// 3. Math tags (`<math>...</math>`): extract LaTeX from `<annotation>` or `alttext` and deduplicate KaTeX/MathJax.
pub fn preprocess_html_for_readability(html: &str) -> String {
    let mut result = html.to_string();

    // 1. Transform Sphinx / API documentation signatures: <dt class="sig ..."> -> <h3 class="sig"><code>...</code></h3>
    if let Ok(re_sig) = Regex::new(r#"(?is)<dt\b[^>]*?class=["'][^"']*sig[^"']*["'][^>]*>(.*?)</dt>"#) {
        if let Ok(re_hlink) = Regex::new(r#"(?is)<a\b[^>]*?class=["'][^"']*headerlink[^"']*["'][^>]*>.*?</a>"#) {
            result = re_sig.replace_all(&result, |caps: &regex::Captures| {
                let inner = &caps[1];
                let without_link = re_hlink.replace_all(inner, "").to_string();
                let trimmed = without_link.trim();
                format!("<h3 class=\"sig\"><code>{}</code></h3>", trimmed)
            }).to_string();
        }
    }

    // 2. Deduplicate and clean MathML / KaTeX / MathJax tags:
    // Remove KaTeX visual HTML fallback (<span class="katex-html" aria-hidden="true">...</span>) to avoid double output
    if let Ok(re_katex_html) = Regex::new(r#"(?is)<span\b[^>]*?class=["'][^"']*katex-html[^"']*["'][^>]*>.*?</span>"#) {
        result = re_katex_html.replace_all(&result, "").to_string();
    }
    // Convert <math>...</math> to clean LaTeX $formula$
    if let Ok(re_math) = Regex::new(r#"(?is)<math\b([^>]*)>(.*?)</math>"#) {
        let re_tex = Regex::new(r#"(?is)<annotation\b[^>]*?encoding=["']application/x-tex["'][^>]*>(.*?)</annotation>"#).ok();
        let re_alt = Regex::new(r#"(?i)\balttext=["']([^"']*)["']"#).ok();

        result = re_math.replace_all(&result, |caps: &regex::Captures| {
            let attrs = &caps[1];
            let body = &caps[2];

            let tex_raw = if let Some(ref r_t) = re_tex {
                if let Some(c) = r_t.captures(body) {
                    Some(c[1].to_string())
                } else {
                    None
                }
            } else {
                None
            };

            let tex_alt = if tex_raw.is_none() {
                if let Some(ref r_a) = re_alt {
                    if let Some(c) = r_a.captures(attrs) {
                        Some(c[1].to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                tex_raw
            };

            if let Some(mut tex) = tex_alt {
                tex = tex.trim().to_string();
                if tex.starts_with("{\\displaystyle") && tex.ends_with('}') {
                    tex = tex[14..tex.len() - 1].trim().to_string();
                } else if tex.starts_with("\\displaystyle") {
                    tex = tex[13..].trim().to_string();
                }
                format!("${}$", tex)
            } else {
                let text = scraper::Html::parse_fragment(body)
                    .root_element()
                    .text()
                    .collect::<Vec<_>>()
                    .join("")
                    .trim()
                    .to_string();
                if !text.is_empty() {
                    format!("${}$", text)
                } else {
                    String::new()
                }
            }
        }).to_string();
    }

    // 3. Pre-process <pre> blocks so Readability does not collapse syntax-highlighted whitespace
    if let Ok(re_pre) = Regex::new(r#"(?is)<pre\b([^>]*)>(.*?)</pre>"#) {
        let re_w_span = Regex::new(r#"(?is)<span\b[^>]*?class=["'][^"']*\bw\b[^"']*["'][^>]*>(.*?)</span>"#).ok();
        let re_inline_tags = Regex::new(r#"(?is)</?(?:span|font|b|i|u|strong|em)\b[^>]*>"#).ok();

        result = re_pre.replace_all(&result, |caps: &regex::Captures| {
            let pre_attrs = &caps[1];
            let pre_body = &caps[2];

            let mut cleaned = pre_body.to_string();
            // Convert Pygments <span class="w"> </span> to literal spaces
            if let Some(ref r_w) = re_w_span {
                cleaned = r_w.replace_all(&cleaned, |c: &regex::Captures| {
                    let w_inner = &c[1];
                    if w_inner.is_empty() {
                        " ".to_string()
                    } else {
                        w_inner.to_string()
                    }
                }).to_string();
            }

            // Strip remaining inline styling tags so Readability sees plain text inside pre
            if let Some(ref r_tags) = re_inline_tags {
                cleaned = r_tags.replace_all(&cleaned, "").to_string();
            }

            // Ensure pre has <code> wrapping if not present
            if !cleaned.contains("<code") {
                format!("<pre{}><code>{}</code></pre>", pre_attrs, cleaned)
            } else {
                format!("<pre{}>{}</pre>", pre_attrs, cleaned)
            }
        }).to_string();
    }

    result
}

/// Fallback extraction: grab cleaned `<body>` inner HTML.
pub fn extract_body_fallback(html: &str, _url: &str) -> ReadabilityResult {
    let document = Html::parse_document(html);
    let title = extract_title_fallback(html);
    let (site_name, byline, excerpt) = extract_meta_enrichments(html);

    let target_node = if let Ok(sel) = Selector::parse(".mw-parser-output, #mw-content-text, main, article, [role=\"main\"], .main-content, #main-content, #content, .content") {
        document.select(&sel).next()
    } else {
        None
    };

    let raw_content = if let Some(target) = target_node {
        target.inner_html()
    } else if let Ok(body_sel) = Selector::parse("body") {
        if let Some(body) = document.select(&body_sel).next() {
            body.inner_html()
        } else {
            html.to_string()
        }
    } else {
        html.to_string()
    };

    // Remove non-content tags: scripts, styles, noscript, nav, header, footer, aside
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
    let mut cleaned = html.to_string();

    // Strip <script>...</script>, <style>...</style>, <noscript>...</noscript>
    if let Ok(re) = Regex::new(r"(?is)<(script|style|noscript)[^>]*>.*?</(script|style|noscript)>") {
        cleaned = re.replace_all(&cleaned, "").to_string();
        if let Ok(re_self) = Regex::new(r"(?is)<(script|style|noscript)[^>]*?/>") {
            cleaned = re_self.replace_all(&cleaned, "").to_string();
        }
    }

    // Strip chrome/boilerplate tags: <nav>, <header>, <footer>, <aside>, <form>
    if let Ok(re_chrome) = Regex::new(r"(?is)<(nav|header|footer|aside|form)\b[^>]*>.*?</(nav|header|footer|aside|form)>") {
        cleaned = re_chrome.replace_all(&cleaned, "").to_string();
    }

    // Strip jump links
    if let Ok(re_jump) = Regex::new(r#"(?is)<a\b[^>]*?class="[^"]*mw-jump-link[^"]*"[^>]*?>.*?</a>"#) {
        cleaned = re_jump.replace_all(&cleaned, "").to_string();
    }

    // Strip headerlink anchor tags (e.g. ¶ in Python/Sphinx docs)
    if let Ok(re_hlink) = Regex::new(r#"(?is)<a\b[^>]*?class=["'][^"']*(?:headerlink|anchor)[^"']*["'][^>]*>.*?</a>"#) {
        cleaned = re_hlink.replace_all(&cleaned, "").to_string();
    }

    // Strip Wikipedia portlet language and navigation bars
    if let Ok(re_nav_divs) = Regex::new(r#"(?is)<(?:div|nav)\b[^>]*?(?:class="[^"]*(?:vector-header|vector-page-toolbar|vector-menu|mw-portlet-lang|sidebar|navbox|mw-references-wrap|reflist)[^"]*"|id="(?:p-lang|mw-navigation|p-personal|toc|mw-toc)")[^>]*?>.*?</(?:div|nav)>"#) {
        cleaned = re_nav_divs.replace_all(&cleaned, "").to_string();
    }

    cleaned
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

    #[test]
    fn test_pre_block_whitespace_preservation() {
        let html = r#"
            <!DOCTYPE html>
            <html><body><article>
                <h1>Code Example</h1>
                <p>Check out this code snippet below:</p>
                <pre><code><span>fn</span> <span>main</span>() { <span>"hello"</span>; }</code></pre>
            </article></body></html>
        "#;
        let result = extract_readability(html, "https://example.com/code");
        assert!(result.content.contains("<pre><code>"));
    }

    #[test]
    fn test_sphinx_signature_and_code_block() {
        let html = r##"
            <!DOCTYPE html>
            <html><body><article>
                <h1>Runners</h1>
                <p>This section outlines high-level asyncio primitives.</p>
                <dl class="py function">
                    <dt class="sig sig-object py" id="asyncio.run">
                        <span class="sig-prename descclassname"><span class="pre">asyncio.</span></span><span class="sig-name descname"><span class="pre">run</span></span><span class="sig-paren">(</span><em class="sig-param"><span class="n"><span class="pre">coro</span></span></em>, <em class="sig-param"><span class="n"><span class="pre">debug</span></span><span class="o"><span class="pre">=</span></span><span class="default_value"><span class="pre">None</span></span></em><span class="sig-paren">)</span>
                        <a class="headerlink" href="#asyncio.run" title="Link to this definition">¶</a>
                    </dt>
                    <dd>
                        <p>Execute coro in an asyncio event loop.</p>
                        <div class="highlight-python3 notranslate"><div class="highlight"><pre><span></span><span class="k">async</span> <span class="k">def</span><span class="w"> </span><span class="nf">main</span><span class="p">():</span>
    <span class="k">await</span> <span class="n">asyncio</span><span class="o">.</span><span class="n">sleep</span><span class="p">(</span><span class="mi">1</span><span class="p">)</span>
    <span class="nb">print</span><span class="p">(</span><span class="s1">&#39;hello&#39;</span><span class="p">)</span>
</pre></div></div>
                    </dd>
                </dl>
            </article></body></html>
        "##;
        let res = extract_readability(html, "https://docs.python.org/3/library/asyncio-runner.html");
        let md = crate::extractor::markdown::html_to_markdown(&res.content, "https://docs.python.org/3/library/asyncio-runner.html");
        println!("=== TEST MD ===\n{}", md);

        // Verify signature is preserved
        assert!(md.contains("asyncio.run"), "Expected signature in md: {}", md);
        // Verify code block whitespace is preserved
        assert!(md.contains("async def main():"), "Expected preserved code block in md: {}", md);
        assert!(md.contains("    await asyncio.sleep(1)"), "Expected indentation in md: {}", md);
    }

    #[test]
    fn test_mathml_deduplication() {
        let html = r##"
            <!DOCTYPE html>
            <html><body><article>
                <p>Quicksort has worst-case time complexity of
                <math xmlns="http://www.w3.org/1998/Math/MathML" alttext="{\displaystyle O(n^{2})}">
                  <semantics>
                    <mrow><mi>O</mi><mo stretchy="false">(</mo><msup><mi>n</mi><mn>2</mn></msup><mo stretchy="false">)</mo></mrow>
                    <annotation encoding="application/x-tex">{\displaystyle O(n^{2})}</annotation>
                  </semantics>
                </math>
                and average-case of <math alttext="{\displaystyle O(n\log n)}"><annotation encoding="application/x-tex">{\displaystyle O(n\log n)}</annotation></math>.
                </p>
            </article></body></html>
        "##;
        let res = extract_readability(html, "https://example.com/math");
        let md = crate::extractor::markdown::html_to_markdown(&res.content, "https://example.com/math");
        assert!(md.contains("$O(n^{2})$"));
    }

    #[test]
    fn test_mediawiki_truncation_fallback() {
        let paragraphs = (0..50)
            .map(|i| format!("<p>Paragraph number {} with extensive text discussion explaining deep concepts and background details in algorithm analysis.</p>", i))
            .collect::<Vec<_>>()
            .join("\n");

        let html = format!(r##"
            <!DOCTYPE html>
            <html><body>
                <div id="content" class="mw-body">
                    <div id="mw-content-text">
                        <div class="mw-parser-output">
                            <h2>First Section</h2>
                            <p>Introductory overview</p>
                            <h2>Second Section</h2>
                            {}
                            <h2>Formal Analysis Section</h2>
                            <p>Detailed math and proofs that must not be truncated.</p>
                        </div>
                    </div>
                </div>
            </body></html>
        "##, paragraphs);

        let res = extract_readability(&html, "https://en.wikipedia.org/wiki/Algorithm");
        assert!(res.content.contains("Formal Analysis Section"), "Expected Formal Analysis Section in output");
        assert!(res.content.contains("Detailed math and proofs that must not be truncated."));
    }
}

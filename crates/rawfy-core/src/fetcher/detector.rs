//! Rawfy — Static vs JS rendering detection heuristic
//!
//! Determines whether an HTML page requires Playwright (headless browser) for full rendering
//! or if static HTTP fetch already captured meaningful content.
//!
//! Heuristics:
//! 1. SPA root mounts: empty app shells (#root, #app, #__next, #__nuxt, #___gatsby)
//! 2. Empty body: <body> tags with no visible text or only comments
//! 3. Noscript warnings: <noscript> messages demanding JavaScript enabled
//! 4. High script density: scripts dominating the payload with minimal rendered content
//! 5. Hydration walls: client-side framework signatures paired with sparse body content

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

/// Result of analyzing an HTML page for client-side JavaScript rendering needs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DetectionResult {
    pub needs_playwright: bool,
    pub reason: String,
}

/// Known JS framework signatures that indicate client-side rendering or SSR framework presence.
static FRAMEWORK_REGEXES: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    vec![
        // Next.js — the __NEXT_DATA__ script tag is always present
        ("Next.js", Regex::new(r"(?i)__NEXT_DATA__").unwrap()),
        // React — data-reactroot is added by ReactDOM.render/hydrateRoot
        ("React", Regex::new(r"(?i)data-reactroot").unwrap()),
        // React 18+ — the new root API uses data-reactroot or _reactRootContainer
        ("React", Regex::new(r"(?i)_reactRootContainer").unwrap()),
        // Vue.js — data-v- attributes are added by Vue's scoped CSS
        ("Vue.js", Regex::new(r"(?i)data-v-[a-f0-9]").unwrap()),
        // Vue + Nuxt — __NUXT__ global variable
        ("Nuxt.js", Regex::new(r"(?i)__NUXT__").unwrap()),
        // Angular — ng-version attribute on root element
        ("Angular", Regex::new(r#"(?i)ng-version=""#).unwrap()),
        // Svelte — svelte-specific class patterns
        ("SvelteKit", Regex::new(r"(?i)__sveltekit").unwrap()),
        // Remix — __remixContext or __remix_data
        ("Remix", Regex::new(r"(?i)__remixContext|__remix").unwrap()),
        // Gatsby — ___gatsby is the root div ID
        ("Gatsby", Regex::new(r"(?i)___gatsby").unwrap()),
        // Ember.js — data-ember-action attributes
        ("Ember.js", Regex::new(r"(?i)data-ember").unwrap()),
        // Astro — astro-island custom elements (for interactive islands)
        ("Astro", Regex::new(r"(?i)astro-island").unwrap()),
        // YouTube — uses a custom polymer-based framework and highly dynamic initial data
        ("YouTube", Regex::new(r"(?i)ytInitialPlayerResponse").unwrap()),
        // Webpack — common footprint for heavily bundled JS applications
        ("Webpack", Regex::new(r"(?i)window\.webpackJsonp").unwrap()),
    ]
});

/// Minimum body text length to consider a page "rendered" without JS
pub const MIN_BODY_TEXT_LENGTH: usize = 200;

/// Strip HTML tags, script, and style blocks to estimate approximate text length.
pub fn extract_text_length(html: &str) -> usize {
    static SCRIPT_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)<script\b[^>]*>[\s\S]*?</script>").unwrap()
    });
    static STYLE_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)<style\b[^>]*>[\s\S]*?</style>").unwrap()
    });
    static TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"<[^>]+>").unwrap()
    });
    static WS_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"\s+").unwrap()
    });

    let no_script = SCRIPT_RE.replace_all(html, "");
    let no_style = STYLE_RE.replace_all(&no_script, "");
    let no_tags = TAG_RE.replace_all(&no_style, " ");
    let cleaned = WS_RE.replace_all(&no_tags, " ");
    cleaned.trim().chars().count()
}

/// Check for common SPA app shell patterns (e.g. `<div id="root"></div>`, `<div id="app"></div>`,
/// `<div id="__next"></div>`, `<div id="___gatsby"></div>`) waiting for client hydration.
pub fn is_app_shell(html: &str) -> bool {
    static SHELL_REGEXES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
        vec![
            Regex::new(r#"(?i)<div\s+id=["'](?:root|app|__next|__nuxt|___gatsby)["']\s*>\s*</div>"#).unwrap(),
            Regex::new(r#"(?is)<div\s+id=["'](?:root|app)["']\s*>\s*(?:<noscript>.*?<\/noscript>\s*)?<\/div>"#).unwrap(),
            Regex::new(r#"(?is)<div\s+[^>]*\bid=["'](?:root|app|__next|__nuxt|___gatsby)["'][^>]*>\s*(?:<noscript>[\s\S]*?</noscript>\s*)?</div>"#).unwrap(),
            Regex::new(r#"(?is)<main\s+[^>]*\bid=["'](?:root|app|__next|__nuxt|___gatsby)["'][^>]*>\s*(?:<noscript>[\s\S]*?</noscript>\s*)?</main>"#).unwrap(),
        ]
    });

    SHELL_REGEXES.iter().any(|re| re.is_match(html))
}

/// Check for completely empty body content.
pub fn is_empty_body(html: &str) -> bool {
    static EMPTY_BODY_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)<body\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*</body>").unwrap()
    });
    EMPTY_BODY_RE.is_match(html)
}

/// Check for noscript warnings demanding JavaScript to be enabled.
pub fn has_noscript_warning(html: &str, text_length: usize) -> bool {
    static NOSCRIPT_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)<noscript\b[^>]*>(.*?)</noscript>").unwrap()
    });
    static WARNING_KEYWORD_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?i)(enable javascript|you need to enable javascript|you need javascript|requires javascript|javascript is required|javascript is disabled|requires a javascript-enabled browser|need to enable javascript)").unwrap()
    });

    if text_length < 500 {
        for cap in NOSCRIPT_RE.captures_iter(html) {
            if let Some(content) = cap.get(1) {
                if WARNING_KEYWORD_RE.is_match(content.as_str()) {
                    return true;
                }
            }
        }
    }
    false
}

/// Check if the page has disproportionately high script content relative to visible content.
pub fn has_high_script_density(html: &str, text_length: usize) -> Option<String> {
    static SCRIPT_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?is)<script\b[^>]*>([\s\S]*?)</script>|<script\b[^>]*/>").unwrap()
    });

    let mut script_count = 0;
    let mut script_bytes = 0;
    for cap in SCRIPT_TAG_RE.captures_iter(html) {
        script_count += 1;
        if let Some(m) = cap.get(0) {
            script_bytes += m.as_str().len();
        }
    }

    let total_len = html.len();
    if total_len > 800 && script_count >= 3 && text_length < 100 {
        let script_ratio = script_bytes as f64 / total_len as f64;
        if script_ratio > 0.65 {
            return Some(format!(
                "High script density ({:.0}% script, {} scripts) with sparse content ({} chars). Page likely requires JS rendering.",
                script_ratio * 100.0,
                script_count,
                text_length
            ));
        }
    }
    None
}

/// Analyze raw HTML to determine if the page requires JS rendering.
///
/// Detection strategy:
/// 1. An empty input or empty app shell (e.g. `<div id="root"></div>`) strongly triggers Playwright.
/// 2. An empty `<body>` tag indicates content is injected dynamically.
/// 3. Clear noscript warnings on sparse pages trigger Playwright.
/// 4. Heavy script density on sparse pages indicates a JS SPA bundle.
/// 5. Framework signatures with sparse content indicate client-side hydration walls.
/// 6. Framework signatures with substantial text content indicate SSR (no browser needed).
/// 7. Short body without JS framework signals is treated as static.
pub fn detect_needs_playwright(html: &str) -> DetectionResult {
    // 0. Empty document check
    if html.trim().is_empty() {
        return DetectionResult {
            needs_playwright: false,
            reason: "Empty document".to_string(),
        };
    }

    // 1. App shell check (empty root div) — strongest signal
    if is_app_shell(html) {
        return DetectionResult {
            needs_playwright: true,
            reason: "Page has an empty app shell (SPA root div with no content)".to_string(),
        };
    }

    // 2. Empty body check
    if is_empty_body(html) {
        return DetectionResult {
            needs_playwright: true,
            reason: "Page body is empty; content likely rendered client-side".to_string(),
        };
    }

    // 3. Extract text length
    let text_length = extract_text_length(html);
    let is_short_body = text_length < MIN_BODY_TEXT_LENGTH;

    // 4. Noscript warning check
    if has_noscript_warning(html, text_length) {
        return DetectionResult {
            needs_playwright: true,
            reason: "Page contains noscript warning requiring JavaScript".to_string(),
        };
    }

    // 5. High script density check
    if let Some(reason) = has_high_script_density(html, text_length) {
        return DetectionResult {
            needs_playwright: true,
            reason,
        };
    }

    // 6. Framework detection
    let mut detected_frameworks = Vec::new();
    for (name, re) in FRAMEWORK_REGEXES.iter() {
        if re.is_match(html) && !detected_frameworks.contains(name) {
            detected_frameworks.push(*name);
        }
    }

    // 7. Decision logic
    if !detected_frameworks.is_empty() && is_short_body {
        return DetectionResult {
            needs_playwright: true,
            reason: format!(
                "Detected {} with sparse content ({} chars). Page likely requires JS rendering.",
                detected_frameworks.join(", "),
                text_length
            ),
        };
    }

    if !detected_frameworks.is_empty() {
        // Framework detected but page has substantial content — likely SSR
        return DetectionResult {
            needs_playwright: false,
            reason: format!(
                "Detected {} but page has sufficient content ({} chars). Likely server-rendered.",
                detected_frameworks.join(", "),
                text_length
            ),
        };
    }

    if is_short_body {
        // Short body but no framework — might be a genuinely short page
        return DetectionResult {
            needs_playwright: false,
            reason: format!(
                "Page has sparse content ({} chars) but no JS framework detected. Treating as static.",
                text_length
            ),
        };
    }

    DetectionResult {
        needs_playwright: false,
        reason: format!(
            "Static page with sufficient content ({} chars). No JS framework detected.",
            text_length
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_html_with_substantial_content() {
        let text = "Lorem ipsum dolor sit amet. ".repeat(50);
        let html = format!(
            "<html><head><title>Test Page</title></head><body><h1>Hello World</h1><p>{}</p></body></html>",
            text
        );
        let result = detect_needs_playwright(&html);
        assert!(!result.needs_playwright);
        assert!(result.reason.contains("sufficient content"));
    }

    #[test]
    fn test_short_page_no_framework() {
        let html = "<html><head><title>Short Page</title></head><body><p>Brief content.</p></body></html>";
        let result = detect_needs_playwright(html);
        assert!(!result.needs_playwright);
        assert!(result.reason.contains("sparse content"));
        assert!(result.reason.contains("no JS framework"));
    }

    #[test]
    fn test_ssr_nextjs_full_content() {
        let text = "This is server-rendered content from Next.js. ".repeat(30);
        let html = format!(
            r#"<html><head><title>SSR Page</title></head><body>
            <div id="__next">
              <h1>Server-Rendered Article</h1>
              <p>{}</p>
            </div>
            <script id="__NEXT_DATA__" type="application/json">{{"props":{{}}}}</script>
          </body></html>"#,
            text
        );
        let result = detect_needs_playwright(&html);
        assert!(!result.needs_playwright);
        assert!(result.reason.contains("Next.js"));
        assert!(result.reason.contains("sufficient content"));
    }

    #[test]
    fn test_ssr_react_with_data_reactroot() {
        let text = "Article content rendered on the server. ".repeat(30);
        let html = format!(
            r#"<html><head><title>React SSR</title></head><body>
            <div data-reactroot>
              <article>
                <h1>React Server-Rendered Article</h1>
                <p>{}</p>
              </article>
            </div>
          </body></html>"#,
            text
        );
        let result = detect_needs_playwright(&html);
        assert!(!result.needs_playwright);
    }

    #[test]
    fn test_empty_react_app_shell() {
        let html = r#"<html><head><title>React App</title></head><body>
            <div id="root"></div>
            <script src="/static/js/bundle.js"></script>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
        assert!(result.reason.contains("app shell"));
    }

    #[test]
    fn test_empty_vue_app_shell() {
        let html = r#"<html><head><title>Vue App</title></head><body>
            <div id="app"></div>
            <script src="/js/app.js"></script>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
    }

    #[test]
    fn test_empty_nextjs_shell() {
        let html = r#"<html><head><title>Loading...</title></head><body>
            <div id="__next"></div>
            <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
    }

    #[test]
    fn test_framework_sparse_content_combo() {
        let html = r#"<html><head><title>SPA</title></head><body>
            <div data-reactroot>
              <div class="loading-spinner"></div>
            </div>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
        assert!(result.reason.contains("React"));
    }

    #[test]
    fn test_angular_with_ng_version_sparse() {
        let html = r#"<html><head><title>Angular App</title></head><body>
            <app-root ng-version="17.0.0">
              <div class="spinner">Loading...</div>
            </app-root>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
        assert!(result.reason.contains("Angular"));
    }

    #[test]
    fn test_empty_html_string() {
        let result = detect_needs_playwright("");
        assert!(!result.needs_playwright);
    }

    #[test]
    fn test_html_only_script_style_tags() {
        let html = r#"<html>
          <head><style>body { margin: 0; }</style></head>
          <body><script>console.log('hello')</script></body>
        </html>"#;
        let result = detect_needs_playwright(html);
        assert!(!result.needs_playwright);
    }

    #[test]
    fn test_gatsby_empty_shell() {
        let html = r#"<html><head><title>Gatsby Site</title></head><body>
            <div id="___gatsby"></div>
            <script src="/chunk.js"></script>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
    }

    #[test]
    fn test_noscript_fallback_in_app_shell() {
        let html = r#"<html><body>
            <div id="root"><noscript>You need JavaScript to run this app.</noscript></div>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
    }

    #[test]
    fn test_empty_body() {
        let html = "<html><body><!-- comment only --></body></html>";
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
        assert!(result.reason.contains("body is empty"));
    }

    #[test]
    fn test_noscript_warning_without_root_id() {
        let html = r#"<html><head><title>App</title></head><body>
            <div>Loading...</div>
            <noscript>You need to enable JavaScript to view this application.</noscript>
          </body></html>"#;
        let result = detect_needs_playwright(html);
        assert!(result.needs_playwright);
        assert!(result.reason.contains("noscript warning"));
    }
}

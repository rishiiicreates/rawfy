use crate::types::{InteractiveElement, InteractiveElementType};
use regex::Regex;
use scraper::{ElementRef, Html, Selector};
use std::collections::{HashMap, HashSet};
use url::Url;

/// Extract all interactive elements from HTML.
///
/// Ported from `src/extractor/interactive.ts`.
/// - Buttons: `<button>`, `[role="button"]`, `<input type="submit">`, `<input type="button">`
/// - Links: `<a>` with resolved `href`
/// - Forms: `<form>` with action and input/select/textarea fields
/// - Inputs: `<input>`, `<textarea>` (not inside a form)
/// - Selects: `<select>` with options (not inside a form)
pub fn extract_interactive_elements(html: &str, url: &str) -> Vec<InteractiveElement> {
    let document = Html::parse_document(html);
    let mut results = Vec::new();

    let label_map = build_label_map(&document);

    // 1. Buttons
    extract_buttons(&document, &label_map, &mut results);

    // 2. Forms
    extract_forms(&document, url, &mut results);

    // 3. Standalone inputs
    extract_standalone_inputs(&document, &label_map, &mut results);

    // 4. Standalone selects
    extract_standalone_selects(&document, &label_map, &mut results);

    // 5. Links
    extract_links(&document, url, &label_map, &mut results);

    results
}

fn is_gibberish(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    // Matches React-generated IDs like :R1sq8q6: or :r1:
    if let Ok(re) = Regex::new(r"^:[a-zA-Z0-9_-]+:$") {
        if re.is_match(trimmed) {
            return true;
        }
    }
    false
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Default)]
struct ResolveLabelOptions {
    check_value: bool,
    check_placeholder: bool,
    check_name_and_id: bool,
}

fn resolve_label(
    element: &ElementRef,
    label_map: &HashMap<String, String>,
    fallback: &str,
    options: ResolveLabelOptions,
) -> String {
    // 1. aria-label
    if let Some(aria) = element.value().attr("aria-label") {
        let trimmed = aria.trim();
        if !trimmed.is_empty() && !is_gibberish(trimmed) {
            return trimmed.to_string();
        }
    }

    // 2. Inner Text
    let text_content = collapse_whitespace(&element.text().collect::<String>());
    if !text_content.is_empty() && !is_gibberish(&text_content) {
        return text_content;
    }

    // 3. title attribute
    if let Some(title) = element.value().attr("title") {
        let trimmed = title.trim();
        if !trimmed.is_empty() && !is_gibberish(trimmed) {
            return trimmed.to_string();
        }
    }

    // 4. value attribute (for inputs)
    if options.check_value {
        if let Some(val) = element.value().attr("value") {
            let trimmed = val.trim();
            if !trimmed.is_empty() && !is_gibberish(trimmed) {
                return trimmed.to_string();
            }
        }
    }

    // 5. placeholder attribute
    if options.check_placeholder {
        if let Some(ph) = element.value().attr("placeholder") {
            let trimmed = ph.trim();
            if !trimmed.is_empty() && !is_gibberish(trimmed) {
                return trimmed.to_string();
            }
        }
    }

    // 6. Associated <label for="id">
    if let Some(id) = element.value().attr("id") {
        if let Some(lbl) = label_map.get(id.trim()) {
            if !lbl.is_empty() && !is_gibberish(lbl) {
                return lbl.clone();
            }
        }
    }

    // 7. name or id attribute fallback
    if options.check_name_and_id {
        if let Some(name) = element.value().attr("name") {
            let trimmed = name.trim();
            if !trimmed.is_empty() && !is_gibberish(trimmed) {
                return trimmed.to_string();
            }
        }
        if let Some(id) = element.value().attr("id") {
            let trimmed = id.trim();
            if !trimmed.is_empty() && !is_gibberish(trimmed) {
                return trimmed.to_string();
            }
        }
    }

    fallback.to_string()
}

fn build_label_map(document: &Html) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(sel) = Selector::parse("label[for]") {
        for el in document.select(&sel) {
            if let Some(for_id) = el.value().attr("for") {
                let text = collapse_whitespace(&el.text().collect::<String>());
                if !text.is_empty() && !is_gibberish(&text) {
                    map.insert(for_id.trim().to_string(), text);
                }
            }
        }
    }
    map
}

fn is_inside_form(element: &ElementRef) -> bool {
    element.ancestors().any(|node| {
        node.value().as_element().map(|e| e.name()) == Some("form")
    })
}

fn resolve_url(raw: &str, base: &str) -> String {
    if let Ok(base_url) = Url::parse(base) {
        if let Ok(resolved) = base_url.join(raw) {
            return resolved.to_string();
        }
    }
    raw.to_string()
}

fn extract_buttons(
    document: &Html,
    label_map: &HashMap<String, String>,
    results: &mut Vec<InteractiveElement>,
) {
    let mut seen_ids = HashSet::new();

    // 1. <button> elements
    if let Ok(sel) = Selector::parse("button") {
        for btn in document.select(&sel) {
            seen_ids.insert(btn.id());
            let label = resolve_label(&btn, label_map, "", ResolveLabelOptions::default());
            if label.is_empty() {
                continue;
            }
            let aria_label = btn.value().attr("aria-label").map(|s| s.trim().to_string());
            results.push(InteractiveElement {
                r#type: InteractiveElementType::Button,
                label,
                href: None,
                action: None,
                fields: None,
                aria_label,
            });
        }
    }

    // 2. [role="button"] elements
    if let Ok(sel) = Selector::parse("[role=\"button\"]") {
        for btn in document.select(&sel) {
            if seen_ids.insert(btn.id()) {
                let label = resolve_label(&btn, label_map, "", ResolveLabelOptions::default());
                if label.is_empty() {
                    continue;
                }
                let aria_label = btn.value().attr("aria-label").map(|s| s.trim().to_string());
                results.push(InteractiveElement {
                    r#type: InteractiveElementType::Button,
                    label,
                    href: None,
                    action: None,
                    fields: None,
                    aria_label,
                });
            }
        }
    }

    // 3. input[type="submit"], input[type="button"]
    if let Ok(sel) = Selector::parse("input[type=\"submit\"], input[type=\"button\"]") {
        for input in document.select(&sel) {
            if seen_ids.insert(input.id()) {
                let label = resolve_label(
                    &input,
                    label_map,
                    "Submit",
                    ResolveLabelOptions {
                        check_value: true,
                        ..Default::default()
                    },
                );
                let aria_label = input.value().attr("aria-label").map(|s| s.trim().to_string());
                results.push(InteractiveElement {
                    r#type: InteractiveElementType::Button,
                    label,
                    href: None,
                    action: None,
                    fields: None,
                    aria_label,
                });
            }
        }
    }
}

fn extract_forms(document: &Html, base_url: &str, results: &mut Vec<InteractiveElement>) {
    if let Ok(sel) = Selector::parse("form") {
        for form in document.select(&sel) {
            let raw_action = form.value().attr("action");
            let action = raw_action.map(|a| resolve_url(a, base_url));

            // Extract field names
            let mut fields = Vec::new();
            if let Ok(field_sel) = Selector::parse("input, select, textarea") {
                for input in form.select(&field_sel) {
                    let name = input
                        .value()
                        .attr("name")
                        .or_else(|| input.value().attr("placeholder"))
                        .or_else(|| input.value().attr("aria-label"))
                        .or_else(|| input.value().attr("id"));

                    if let Some(n) = name {
                        let trimmed = n.trim();
                        if !trimmed.is_empty() && !is_gibberish(trimmed) {
                            fields.push(trimmed.to_string());
                        }
                    }
                }
            }

            // Form label
            let mut form_label = form
                .value()
                .attr("aria-label")
                .or_else(|| form.value().attr("name"))
                .map(|s| s.trim().to_string());

            if let Some(ref l) = form_label {
                if is_gibberish(l) {
                    form_label = None;
                }
            }

            let label = form_label.unwrap_or_else(|| {
                if !fields.is_empty() {
                    let preview = fields
                        .iter()
                        .take(3)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ");
                    format!("Form with: {}", preview)
                } else {
                    "Form".to_string()
                }
            });

            let aria_label = form.value().attr("aria-label").map(|s| s.trim().to_string());

            results.push(InteractiveElement {
                r#type: InteractiveElementType::Form,
                label,
                href: None,
                action,
                fields: if fields.is_empty() {
                    None
                } else {
                    Some(fields)
                },
                aria_label,
            });
        }
    }
}

fn extract_standalone_inputs(
    document: &Html,
    label_map: &HashMap<String, String>,
    results: &mut Vec<InteractiveElement>,
) {
    if let Ok(sel) = Selector::parse("input, textarea") {
        for input in document.select(&sel) {
            // Skip if inside a form
            if is_inside_form(&input) {
                continue;
            }

            let input_type = input
                .value()
                .attr("type")
                .unwrap_or("text")
                .trim()
                .to_lowercase();

            if input_type == "hidden" || input_type == "submit" || input_type == "button" {
                continue;
            }

            let label = resolve_label(
                &input,
                label_map,
                &input_type,
                ResolveLabelOptions {
                    check_placeholder: true,
                    check_name_and_id: true,
                    ..Default::default()
                },
            );

            let aria_label = input.value().attr("aria-label").map(|s| s.trim().to_string());

            results.push(InteractiveElement {
                r#type: InteractiveElementType::Input,
                label: format!("{} ({})", label, input_type),
                href: None,
                action: None,
                fields: None,
                aria_label,
            });
        }
    }
}

fn extract_standalone_selects(
    document: &Html,
    label_map: &HashMap<String, String>,
    results: &mut Vec<InteractiveElement>,
) {
    if let Ok(sel) = Selector::parse("select") {
        for select in document.select(&sel) {
            if is_inside_form(&select) {
                continue;
            }

            let mut option_labels = Vec::new();
            if let Ok(opt_sel) = Selector::parse("option") {
                for opt in select.select(&opt_sel) {
                    let text = collapse_whitespace(&opt.text().collect::<String>());
                    if !text.is_empty() {
                        option_labels.push(text);
                    }
                }
            }

            let label = resolve_label(
                &select,
                label_map,
                "Select",
                ResolveLabelOptions {
                    check_name_and_id: true,
                    ..Default::default()
                },
            );

            let aria_label = select.value().attr("aria-label").map(|s| s.trim().to_string());

            results.push(InteractiveElement {
                r#type: InteractiveElementType::Select,
                label,
                href: None,
                action: None,
                fields: if option_labels.is_empty() {
                    None
                } else {
                    Some(option_labels)
                },
                aria_label,
            });
        }
    }
}

fn extract_links(
    document: &Html,
    base_url: &str,
    label_map: &HashMap<String, String>,
    results: &mut Vec<InteractiveElement>,
) {
    if let Ok(sel) = Selector::parse("a[href]") {
        for link in document.select(&sel) {
            let raw_href = match link.value().attr("href") {
                Some(h) => h.trim(),
                None => continue,
            };

            // Skip anchor-only, javascript, mailto, tel
            if raw_href.is_empty()
                || raw_href.starts_with('#')
                || raw_href.starts_with("javascript:")
                || raw_href.starts_with("mailto:")
                || raw_href.starts_with("tel:")
            {
                continue;
            }

            let href = resolve_url(raw_href, base_url);

            let label = resolve_label(
                &link,
                label_map,
                &href,
                ResolveLabelOptions::default(),
            );

            if label.is_empty() {
                continue;
            }

            // Truncate very long labels (> 100 chars)
            let truncated_label = if label.chars().count() > 100 {
                let prefix: String = label.chars().take(97).collect();
                format!("{}...", prefix)
            } else {
                label
            };

            let aria_label = link.value().attr("aria-label").map(|s| s.trim().to_string());

            results.push(InteractiveElement {
                r#type: InteractiveElementType::Link,
                label: truncated_label,
                href: Some(href),
                action: None,
                fields: None,
                aria_label,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_buttons_and_links() {
        let html = r###"
            <div>
                <button aria-label="Close modal">X</button>
                <div role="button">Custom Button</div>
                <input type="submit" value="Send Form" />
                <a href="/about" title="About Us">About</a>
                <a href="#section">Anchor Link</a>
            </div>
        "###;

        let elements = extract_interactive_elements(html, "https://example.com");

        let buttons: Vec<_> = elements
            .iter()
            .filter(|e| e.r#type == InteractiveElementType::Button)
            .collect();
        assert_eq!(buttons.len(), 3);
        assert_eq!(buttons[0].label, "Close modal");
        assert_eq!(buttons[1].label, "Custom Button");
        assert_eq!(buttons[2].label, "Send Form");

        let links: Vec<_> = elements
            .iter()
            .filter(|e| e.r#type == InteractiveElementType::Link)
            .collect();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].label, "About");
        assert_eq!(links[0].href.as_deref(), Some("https://example.com/about"));
    }

    #[test]
    fn test_extract_forms_and_standalone() {
        let html = r#"
            <form action="/login" name="login_form">
                <input type="text" name="username" placeholder="Username" />
                <input type="password" name="password" />
            </form>
            <input type="search" placeholder="Quick search..." />
        "#;

        let elements = extract_interactive_elements(html, "https://example.com");

        let forms: Vec<_> = elements
            .iter()
            .filter(|e| e.r#type == InteractiveElementType::Form)
            .collect();
        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].action.as_deref(), Some("https://example.com/login"));
        assert_eq!(forms[0].fields.as_ref().unwrap().len(), 2);

        let inputs: Vec<_> = elements
            .iter()
            .filter(|e| e.r#type == InteractiveElementType::Input)
            .collect();
        assert_eq!(inputs.len(), 1);
        assert_eq!(inputs[0].label, "Quick search... (search)");
    }
}

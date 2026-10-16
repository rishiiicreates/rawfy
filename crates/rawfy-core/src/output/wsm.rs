use crate::types::{InteractiveElement, InteractiveElementType, MediaResult, PageData};

/// Serialize PageData into WSM (Web Semantic Markdown) format.
pub fn serialize_wsm(data: &PageData) -> String {
    serialize_wsm_custom(data, false)
}

/// Serialize PageData into WSM format with optional promotional footer suppression.
pub fn serialize_wsm_custom(data: &PageData, no_footer: bool) -> String {
    let mut parts = Vec::new();

    // 1. YAML Frontmatter
    parts.push(build_frontmatter(data));

    // 2. Main Markdown Body
    parts.push(data.content.markdown.clone());

    // 3. Media Section
    if !data.media.is_empty() {
        parts.push(build_media_section(&data.media));
    }

    // 4. Interactive Elements Section
    if !data.interactive_elements.is_empty() {
        parts.push(build_interactive_section(&data.interactive_elements));
    }

    // 5. Fetch Stats Footer
    parts.push(build_stats_footer(data, no_footer));

    parts.join("\n\n")
}

fn build_frontmatter(data: &PageData) -> String {
    let mut lines = vec!["---".to_string()];

    lines.push(format!("url: {}", data.metadata.url));
    if let Some(ref canon) = data.metadata.canonical_url {
        lines.push(format!("canonical_url: {}", canon));
    }
    lines.push(format!("type: {:?}", data.metadata.r#type).to_lowercase());
    lines.push(format!("fetched_at: {}", data.metadata.fetched_at));

    if let Some(ref lang) = data.metadata.lang {
        lines.push(format!("lang: {}", lang));
    }
    if let Some(ref title) = data.metadata.title {
        lines.push(format!("title: \"{}\"", escape_yaml(title)));
    }
    if let Some(ref desc) = data.metadata.description {
        lines.push(format!("description: \"{}\"", escape_yaml(desc)));
    }

    lines.push(format!("word_count: {}", data.metadata.word_count));
    lines.push(format!(
        "reading_time_minutes: {}",
        data.metadata.reading_time_minutes
    ));
    lines.push(format!(
        "interactive_elements: {}",
        data.metadata.interactive_element_count
    ));
    lines.push(format!("media_count: {}", data.media.len()));

    if let Some(ref og) = data.metadata.og {
        lines.push("og:".to_string());
        if let Some(ref t) = og.title {
            lines.push(format!("  title: \"{}\"", escape_yaml(t)));
        }
        if let Some(ref ty) = og.r#type {
            lines.push(format!("  type: {}", ty));
        }
        if let Some(ref img) = og.image {
            lines.push(format!("  image: {}", img));
        }
        if let Some(ref site) = og.site_name {
            lines.push(format!("  site_name: \"{}\"", escape_yaml(site)));
        }
    }

    lines.push("---".to_string());
    lines.join("\n")
}

fn build_media_section(media: &[MediaResult]) -> String {
    let mut lines = vec!["## Media".to_string()];
    for item in media {
        lines.push(format!("- {}", crate::media::format_media(item)));
    }
    lines.join("\n")
}

fn build_interactive_section(elements: &[InteractiveElement]) -> String {
    let mut lines = vec!["## Interactive Elements".to_string()];

    let buttons: Vec<_> = elements
        .iter()
        .filter(|e| e.r#type == InteractiveElementType::Button)
        .collect();
    let forms: Vec<_> = elements
        .iter()
        .filter(|e| e.r#type == InteractiveElementType::Form)
        .collect();
    let inputs: Vec<_> = elements
        .iter()
        .filter(|e| e.r#type == InteractiveElementType::Input)
        .collect();
    let selects: Vec<_> = elements
        .iter()
        .filter(|e| e.r#type == InteractiveElementType::Select)
        .collect();
    let links: Vec<_> = elements
        .iter()
        .filter(|e| e.r#type == InteractiveElementType::Link)
        .collect();

    if !buttons.is_empty() {
        lines.push(format!("\n### Buttons ({})", buttons.len()));
        for btn in buttons {
            lines.push(format!("- {}", btn.label));
        }
    }

    if !forms.is_empty() {
        lines.push(format!("\n### Forms ({})", forms.len()));
        for form in forms {
            let mut line = format!("- {}", form.label);
            if let Some(ref action) = form.action {
                line.push_str(&format!(" → {}", action));
            }
            if let Some(ref fields) = form.fields {
                if !fields.is_empty() {
                    line.push_str(&format!(" [fields: {}]", fields.join(", ")));
                }
            }
            lines.push(line);
        }
    }

    if !inputs.is_empty() {
        lines.push(format!("\n### Inputs ({})", inputs.len()));
        for inp in inputs {
            lines.push(format!("- {}", inp.label));
        }
    }

    if !selects.is_empty() {
        lines.push(format!("\n### Selects ({})", selects.len()));
        for sel in selects {
            let mut line = format!("- {}", sel.label);
            if let Some(ref fields) = sel.fields {
                if !fields.is_empty() {
                    line.push_str(&format!(" [options: {}]", fields.join(", ")));
                }
            }
            lines.push(line);
        }
    }

    if !links.is_empty() {
        let shown = &links[..std::cmp::min(20, links.len())];
        let remaining = links.len().saturating_sub(shown.len());
        lines.push(format!("\n### Links ({})", links.len()));
        for link in shown {
            let href = link.href.as_deref().unwrap_or("#");
            lines.push(format!("- [{}]({})", link.label, href));
        }
        if remaining > 0 {
            lines.push(format!("- ... and {} more links", remaining));
        }
    }

    lines.join("\n")
}

fn build_stats_footer(data: &PageData, no_footer: bool) -> String {
    let mut lines = vec!["---".to_string(), "_Rawfy fetch stats:_".to_string()];
    lines.push(format!("- Method: {:?}", data.fetch_stats.method).to_lowercase());
    lines.push(format!("- Duration: {}ms", data.fetch_stats.duration_ms));
    lines.push(format!(
        "- Estimated tokens: {}",
        data.fetch_stats.estimated_tokens
    ));
    if data.fetch_stats.truncated {
        lines.push("- ⚠️ Output was truncated".to_string());
    }
    if !no_footer {
        lines.push("- ⭐ Star & follow @rishiiicreates on GitHub: https://github.com/rishiiicreates/rawfy".to_string());
    }
    lines.join("\n")
}

fn escape_yaml(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

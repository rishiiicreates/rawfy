use crate::types::PageData;
use regex::Regex;

/// Serialize PageData into clean plain text for low-token environments.
pub fn serialize_text(data: &PageData) -> String {
    let mut parts = Vec::new();

    // Title & source URL
    if let Some(ref title) = data.metadata.title {
        parts.push(title.to_uppercase());
        parts.push(format!("Source: {}", data.metadata.url));
        parts.push(String::new());
    }

    let mut text = data.content.markdown.clone();

    // Convert headings to uppercase
    if let Ok(re_h) = Regex::new(r"(?m)^#{1,6}\s+(.+)$") {
        text = re_h.replace_all(&text, "\n$1\n").to_string();
    }

    // Convert links to text (url)
    if let Ok(re_link) = Regex::new(r"\[([^\]]+)\]\(([^)]+)\)") {
        text = re_link.replace_all(&text, "$1 ($2)").to_string();
    }

    // Strip media placeholders
    if let Ok(re_media) = Regex::new(r"\[(IMAGE|VIDEO|AUDIO|PDF)[^\]]*\]") {
        text = re_media.replace_all(&text, "").to_string();
    }

    // Strip bold/italic/code
    if let Ok(re_bold) = Regex::new(r"\*\*(.*?)\*\*") {
        text = re_bold.replace_all(&text, "$1").to_string();
    }
    if let Ok(re_italic) = Regex::new(r"\*(.*?)\*") {
        text = re_italic.replace_all(&text, "$1").to_string();
    }
    if let Ok(re_code) = Regex::new(r"`([^`]+)`") {
        text = re_code.replace_all(&text, "$1").to_string();
    }
    if let Ok(re_codeblock) = Regex::new(r"(?s)```.*?```") {
        text = re_codeblock.replace_all(&text, "").to_string();
    }
    if let Ok(re_table) = Regex::new(r"(?m)^\|.*\|$") {
        text = re_table.replace_all(&text, "").to_string();
    }

    // Replace list bullets
    if let Ok(re_list) = Regex::new(r"(?m)^[-*+]\s+") {
        text = re_list.replace_all(&text, "• ").to_string();
    }
    if let Ok(re_num) = Regex::new(r"(?m)^\d+\.\s+") {
        text = re_num.replace_all(&text, "• ").to_string();
    }

    // Strip horizontal rules
    if let Ok(re_hr) = Regex::new(r"(?m)^---$") {
        text = re_hr.replace_all(&text, "").to_string();
    }

    // Collapse multiple blank lines
    if let Ok(re_ws) = Regex::new(r"\n{3,}") {
        text = re_ws.replace_all(&text, "\n\n").to_string();
    }

    parts.push(text.trim().to_string());
    parts.join("\n")
}

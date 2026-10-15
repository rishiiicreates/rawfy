/// Estimate the token count for a string (~4 characters per token).
pub fn estimate_tokens(text: &str) -> usize {
    if text.is_empty() {
        return 0;
    }
    // Roughly 4 characters per token for English/code, minimum 1 token for non-empty text
    let chars = text.chars().count();
    std::cmp::max(1, (chars + 3) / 4)
}

/// Result of truncating text to fit within a token budget.
pub struct TruncateResult {
    pub text: String,
    pub truncated: bool,
}

/// Truncate text to fit within a token budget.
/// Appends a truncation notice if content was cut.
pub fn truncate(text: &str, max_tokens: usize) -> TruncateResult {
    let estimated = estimate_tokens(text);
    if estimated <= max_tokens {
        return TruncateResult {
            text: text.to_string(),
            truncated: false,
        };
    }

    // Target roughly max_tokens * 4 characters
    let max_chars = max_tokens * 4;
    let mut char_count = 0;
    let mut byte_index = text.len();

    for (idx, _ch) in text.char_indices() {
        if char_count >= max_chars {
            byte_index = idx;
            break;
        }
        char_count += 1;
    }

    let mut cut_index = byte_index;
    // Walk back to find the nearest whitespace or newline boundary within reasonable distance
    if let Some(last_space) = text[..byte_index].rfind(|c: char| c.is_whitespace() || c == '\n') {
        if byte_index - last_space < 30 {
            cut_index = last_space;
        }
    }

    let truncated_slice = text[..cut_index].trim_end();
    let omitted = estimated.saturating_sub(max_tokens);
    let notice = format!(
        "\n\n[TRUNCATED: output exceeded {} token limit. ~{} tokens omitted. Use --max-tokens to increase limit.]",
        max_tokens, omitted
    );

    TruncateResult {
        text: format!("{}{}", truncated_slice, notice),
        truncated: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("hello world"), 3);
    }

    #[test]
    fn test_truncate_within_budget() {
        let text = "hello world";
        let res = truncate(text, 100);
        assert!(!res.truncated);
        assert_eq!(res.text, text);
    }

    #[test]
    fn test_truncate_exceeds_budget() {
        let text = "a".repeat(1000);
        let res = truncate(&text, 10);
        assert!(res.truncated);
        assert!(res.text.contains("[TRUNCATED: output exceeded 10 token limit"));
    }
}

pub mod interactive;
pub mod markdown;
pub mod metadata;
pub mod readability;

pub use interactive::extract_interactive_elements;
pub use markdown::html_to_markdown;
pub use metadata::{classify_page_type, extract_metadata, extract_metadata_simple};
pub use readability::{extract_body_fallback, extract_readability};

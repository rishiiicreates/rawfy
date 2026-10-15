use crate::types::PageData;

/// Serialize PageData into formatted JSON string.
pub fn serialize_json(data: &PageData) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(data)
}

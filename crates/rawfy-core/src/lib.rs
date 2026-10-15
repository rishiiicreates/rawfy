pub mod extractor;
pub mod fetcher;
pub mod media;
pub mod output;
pub mod truncate;
pub mod types;

pub use extractor::{
    classify_page_type, extract_body_fallback, extract_interactive_elements, extract_metadata,
    extract_metadata_simple, extract_readability, html_to_markdown,
};
pub use fetcher::{
    detect_needs_playwright, fetch_page, fetch_static, DetectionResult,
};
pub use media::{
    extract_audio, extract_images, extract_pdfs, extract_videos, format_audio, format_image,
    format_media, format_pdf, format_video, ImageExtractOptions, PdfExtractOptions, VideoCaptionTrack,
};
pub use output::{serialize_json, serialize_text, serialize_wsm};
pub use truncate::{estimate_tokens, truncate};
pub use types::*;

/// Run the full Rawfy perception pipeline on a URL.
pub async fn rawfy_fetch(url: &str, options: &RawfyOptions) -> Result<PageData, RawfyError> {
    let start_time = std::time::Instant::now();
    let max_tokens = options.max_tokens.unwrap_or(50_000);

    // Stage 1: Fetch
    let fetch_result = fetcher::fetch_page(url, options).await?;

    // Stage 2: Extract Interactive Elements
    let interactive_elements =
        extractor::extract_interactive_elements(&fetch_result.html, &fetch_result.final_url);

    // Stage 3: Extract Readability content
    let readability = extractor::extract_readability(&fetch_result.html, &fetch_result.final_url);

    // Stage 4: Convert to clean Markdown
    let mut markdown = extractor::html_to_markdown(&readability.content, &fetch_result.final_url);
    let plain_text = readability.content.clone();

    // Stage 5: Media extraction
    let mut media = Vec::new();

    // Images
    let image_opts = media::ImageExtractOptions::from(options);
    let images = media::extract_images(&fetch_result.html, &fetch_result.final_url, &image_opts).await;
    for img in images {
        media.push(MediaResult::Image(img));
    }

    // Videos
    let videos = media::extract_videos(&fetch_result.html, &fetch_result.final_url, None).await;
    for vid in videos {
        media.push(MediaResult::Video(vid));
    }

    // Audio
    let audios = media::extract_audio(&fetch_result.html, &fetch_result.final_url);
    for aud in audios {
        media.push(MediaResult::Audio(aud));
    }

    // PDFs
    let pdf_opts = media::PdfExtractOptions::default();
    let pdfs = media::extract_pdfs(&fetch_result.html, &fetch_result.final_url, Some(&pdf_opts)).await;
    for pdf in pdfs {
        media.push(MediaResult::Pdf(pdf));
    }

    // Stage 6: Metadata extraction
    let metadata = extractor::extract_metadata(
        &fetch_result.html,
        &fetch_result.final_url,
        Some(&fetch_result.headers),
        Some(&readability.content),
        interactive_elements.len(),
    );

    // Stage 7: Token calculation and truncation
    let token_count = truncate::estimate_tokens(&markdown);
    let mut truncated = false;
    if token_count > max_tokens {
        let trunc_res = truncate::truncate(&markdown, max_tokens);
        markdown = trunc_res.text;
        truncated = trunc_res.truncated;
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(PageData {
        metadata,
        content: PageContent {
            markdown,
            text: plain_text,
            html: fetch_result.html,
        },
        media,
        interactive_elements,
        fetch_stats: FetchStats {
            method: fetch_result.method,
            duration_ms,
            estimated_tokens: token_count,
            truncated,
        },
    })
}

/// Fetch only metadata for a URL (lightweight).
pub async fn rawfy_metadata(url: &str, options: &RawfyOptions) -> Result<PageMetadata, RawfyError> {
    let fetch_result = fetcher::fetch_page(url, options).await?;
    let interactive_elements =
        extractor::extract_interactive_elements(&fetch_result.html, &fetch_result.final_url);
    let readability = extractor::extract_readability(&fetch_result.html, &fetch_result.final_url);
    let metadata = extractor::extract_metadata(
        &fetch_result.html,
        &fetch_result.final_url,
        Some(&fetch_result.headers),
        Some(&readability.content),
        interactive_elements.len(),
    );
    Ok(metadata)
}

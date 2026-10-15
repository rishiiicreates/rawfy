pub mod audio;
pub mod image;
pub mod pdf;
pub mod video;

pub use audio::{extract_audio, format_audio};
pub use image::{extract_images, format_image, ImageExtractOptions};
pub use pdf::{extract_pdfs, format_pdf, PdfExtractOptions};
pub use video::{extract_videos, format_duration, format_video, VideoCaptionTrack};

use crate::types::MediaResult;

/// Format any MediaResult enum variant into its WSM representation.
pub fn format_media(media: &MediaResult) -> String {
    match media {
        MediaResult::Image(img) => format_image(img),
        MediaResult::Video(vid) => format_video(vid),
        MediaResult::Audio(aud) => format_audio(aud),
        MediaResult::Pdf(pdf) => format_pdf(pdf),
    }
}

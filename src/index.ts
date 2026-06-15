/**
 * Rawfy — Public API
 *
 * This is the library entry point for programmatic use:
 *   import { rawfyFetch, rawfyMetadata } from 'rawfy'
 *
 * Re-exports the public interface for Node.js consumers.
 */

// Core pipeline functions
export { rawfyFetch, rawfyMetadata } from './pipeline.js'

// Output serializers
export { serializeWsm } from './output/wsm.js'
export { serializeJson } from './output/json.js'
export { serializeText } from './output/text.js'

// Fetch layer
export { fetchPage } from './fetcher/index.js'

// Extraction layer
export { extractReadability } from './extractor/readability.js'
export { extractMetadata } from './extractor/metadata.js'
export { extractInteractiveElements } from './extractor/interactive.js'
export { htmlToMarkdown } from './extractor/html-to-md.js'

// Media handlers
export { extractImages, formatImage } from './media/image.js'
export { extractVideos, formatVideo } from './media/video.js'
export { extractAudio, formatAudio } from './media/audio.js'
export { extractPdfs, formatPdf } from './media/pdf.js'

// Re-export types that consumers need
export type {
  RawfyError,
  RawfyErrorCode,
  RawfyOptions,
  PageData,
  PageMetadata,
  OutputFormat,
  FetchResult,
  MediaResult,
  ImageResult,
  VideoResult,
  AudioResult,
  PdfResult,
  InteractiveElement,
} from './types.js'

// Re-export utilities
export { createError, isRawfyError, wrapError } from './utils/errors.js'
export { estimateTokens, truncate } from './utils/truncate.js'
export { classifyPageType } from './utils/classify.js'

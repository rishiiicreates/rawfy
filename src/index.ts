/**
 * Rawfy — Public API
 *
 * This is the library entry point for programmatic use:
 *   import { fetch } from 'rawfy'
 *
 * Re-exports the public interface for Node.js consumers.
 *
 * TODO: Phase 5 implementation — will re-export the main pipeline function
 */

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

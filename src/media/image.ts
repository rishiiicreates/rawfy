/**
 * Rawfy — Image handler
 *
 * Multi-tier image description pipeline:
 * 1. alt attribute (instant, free)
 * 2. title + figcaption (instant, free)
 * 3. OCR via tesseract.js (local, opt-in)
 * 4. Claude vision API (accurate, opt-in --vision flag)
 *
 * TODO: Phase 3 implementation
 */

import type { ImageResult } from '../types.js'

/**
 * Extract image information and generate descriptions.
 */
export async function extractImage(
  _src: string,
  _alt?: string,
  _context?: { figcaption?: string; title?: string },
  _options?: { vision?: boolean },
): Promise<ImageResult> {
  // TODO: implement in Phase 3
  return {
    type: 'image',
    src: _src,
    alt: _alt,
  }
}

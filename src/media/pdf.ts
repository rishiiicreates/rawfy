/**
 * Rawfy — PDF text extraction handler
 *
 * Detects PDF links in pages and extracts text content
 * using pdfjs-dist (Mozilla PDF.js) in a worker thread.
 *
 * TODO: Phase 3 implementation
 */

import type { PdfResult } from '../types.js'

/**
 * Fetch and extract text from a PDF URL.
 */
export async function extractPdf(_pdfUrl: string): Promise<PdfResult> {
  // TODO: implement in Phase 3
  return {
    type: 'pdf',
    src: _pdfUrl,
  }
}

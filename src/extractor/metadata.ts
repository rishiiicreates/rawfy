/**
 * Rawfy — Metadata extractor
 *
 * Extracts page metadata: title, description, Open Graph, JSON-LD,
 * language, page type, word count, reading time.
 *
 * TODO: Phase 2 implementation
 */

import type { PageMetadata } from '../types.js'

/**
 * Extract all metadata from a page's HTML.
 *
 * - <title>, <meta name="description">
 * - All <meta property="og:*"> tags
 * - All <meta name="twitter:*"> tags
 * - <script type="application/ld+json"> blocks
 * - Language from <html lang> or content-language header
 * - Page type classification (see RESEARCH.md heuristics)
 * - Word count and reading time
 */
export function extractMetadata(
  _html: string,
  _url: string,
  _headers?: Record<string, string>,
): PageMetadata {
  // TODO: implement in Phase 2
  return {
    url: _url,
    type: 'other',
    fetchedAt: new Date().toISOString(),
    wordCount: 0,
    readingTimeMinutes: 0,
    interactiveElementCount: 0,
  }
}

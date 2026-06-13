/**
 * Rawfy — Readability.js wrapper
 *
 * Wraps @mozilla/readability to extract the main article content
 * from a page, stripping boilerplate (nav, footer, ads, sidebars).
 *
 * TODO: Phase 2 implementation
 */

import type { ReadabilityResult } from '../types.js'

/**
 * Extract the main content from HTML using Mozilla Readability.
 *
 * - Creates a jsdom document from raw HTML (for static fetches)
 * - Runs Readability on the document
 * - Falls back to full body extraction if Readability fails (non-article pages)
 * - Returns title, cleaned HTML content, excerpt, byline, siteName
 */
export function extractReadable(_html: string, _url: string): ReadabilityResult | null {
  // TODO: implement in Phase 2
  return null
}

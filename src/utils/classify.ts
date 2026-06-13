/**
 * Rawfy — Page type classification
 *
 * Classifies a page as article, product, docs, search, homepage, video, or other
 * using the heuristics documented in RESEARCH.md.
 *
 * TODO: Phase 2 implementation
 */

import type { PageType } from '../types.js'

/**
 * Classify the type of a web page using URL patterns, meta tags,
 * and content signals.
 *
 * See RESEARCH.md § "page type classification heuristics" for the full
 * detection signal table.
 */
export function classifyPage(_url: string, _html: string): PageType {
  // TODO: implement in Phase 2
  return 'other'
}

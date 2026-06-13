/**
 * Rawfy — Interactive element extractor
 *
 * Finds and describes all interactive elements on a page:
 * buttons, forms, inputs, selects, and navigational links.
 *
 * TODO: Phase 2 implementation
 */

import type { InteractiveElement } from '../types.js'

/**
 * Extract all interactive elements from a page's HTML.
 *
 * - <button> elements → label, type, aria-label
 * - <form> elements → name, action, fields
 * - <input> elements → type, name, placeholder, label
 * - <select> elements → name, options
 * - <a> with href → classify as navigation vs content link
 */
export function extractInteractiveElements(_html: string, _baseUrl: string): InteractiveElement[] {
  // TODO: implement in Phase 2
  return []
}

/**
 * Rawfy — Plain text output serializer
 *
 * Produces minimal plain text output for token-constrained contexts.
 * Strips all markdown syntax, keeps headings as UPPERCASE,
 * links as "text (url)".
 *
 * TODO: Phase 4 implementation
 */

import type { PageData } from '../types.js'

/**
 * Serialize PageData into plain text format.
 */
export function serializeText(_page: PageData): string {
  // TODO: implement in Phase 4
  return ''
}

/**
 * Rawfy — JSON output serializer
 *
 * Produces structured JSON output matching the schema
 * defined in UI_UX.md § "JSON output schema".
 *
 * TODO: Phase 4 implementation
 */

import type { PageData } from '../types.js'

/**
 * Serialize PageData into JSON format.
 */
export function serializeJson(page: PageData): string {
  // TODO: implement in Phase 4 — this is a minimal passthrough for now
  return JSON.stringify(page, null, 2)
}

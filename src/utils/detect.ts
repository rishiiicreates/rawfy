/**
 * Rawfy — Static vs JS detection heuristic
 *
 * Determines whether a page needs Playwright for full rendering
 * or if a static HTTP fetch is sufficient.
 *
 * TODO: Phase 1 implementation
 */

import type { DetectionResult } from '../types.js'

/**
 * Analyze raw HTML to determine if the page requires JS rendering.
 *
 * Checks for framework signatures (Next.js, React, Vue), empty body,
 * and other signals that indicate client-side rendering.
 */
export function detectNeedsPlaywright(_html: string): DetectionResult {
  // TODO: implement in Phase 1
  return { needsPlaywright: false, reason: 'stub — always returns static' }
}

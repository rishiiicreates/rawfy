/**
 * Rawfy — Fetch router
 *
 * Unified entry point for fetching a URL. Routes to static or Playwright
 * fetch based on the JS-rendering detection heuristic.
 *
 * TODO: Phase 1 implementation
 */

import type { FetchOptions, FetchResult } from '../types.js'

/**
 * Fetch a URL using the appropriate strategy.
 *
 * 1. Attempts static fetch first
 * 2. Runs JS-rendering detection on the result
 * 3. If Playwright is needed (and not disabled), re-fetches with Playwright
 * 4. Returns the final FetchResult
 */
export async function fetchPage(_url: string, _options?: FetchOptions): Promise<FetchResult> {
  // TODO: implement in Phase 1
  throw new Error('fetchPage not implemented')
}

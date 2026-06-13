/**
 * Rawfy — Static HTTP fetcher
 *
 * Tier 1 fetch using Node.js built-in undici HTTP client.
 * Used for static HTML pages that don't require JS rendering.
 *
 * TODO: Phase 1 implementation
 */

import type { FetchOptions, FetchResult } from '../types.js'

/**
 * Fetch a URL using static HTTP (undici).
 *
 * - Follows redirects (max 5)
 * - Sets realistic User-Agent header
 * - Handles gzip/brotli decompression
 * - Enforces timeout (default: 15s)
 * - Returns raw HTML + response headers + final URL
 */
export async function fetchStatic(_url: string, _options?: FetchOptions): Promise<FetchResult> {
  // TODO: implement in Phase 1
  throw new Error('fetchStatic not implemented')
}

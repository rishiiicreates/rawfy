/**
 * Rawfy — Fetch router
 *
 * Unified entry point for fetching a URL. Decides between static HTTP
 * and Playwright based on content analysis.
 *
 * Flow:
 * 1. Always attempt static fetch first (fast, lightweight)
 * 2. Run JS-rendering detection on the result HTML
 * 3. If Playwright is needed AND not disabled:
 *    a. Try Playwright fetch
 *    b. On Playwright failure (not installed, etc.), fall back to static result
 * 4. Return the best result available
 *
 * This "try static first, escalate if needed" approach ensures:
 * - 60% of pages (static HTML) are fetched in <2s
 * - SPAs get the full Playwright treatment when available
 * - The tool never hard-fails just because Playwright isn't installed
 */

import type { FetchOptions, FetchResult } from '../types.js'
import { createError, isRawfyError, wrapError } from '../utils/errors.js'
import { detectNeedsPlaywright } from '../utils/detect.js'
import { fetchStatic } from './static.js'
import { fetchPlaywright } from './playwright.js'

/**
 * Progress callback for reporting fetch status.
 * Used by the CLI to show progress on stderr.
 */
export type FetchProgressCallback = (message: string) => void

/** Extended options for the fetch router */
export interface FetchPageOptions extends FetchOptions {
  /** Optional progress callback for CLI feedback */
  onProgress?: FetchProgressCallback
}

/**
 * Fetch a URL using the appropriate strategy.
 *
 * 1. Validates the URL
 * 2. Attempts static fetch
 * 3. Runs JS-rendering detection on result
 * 4. Escalates to Playwright if needed (and not disabled)
 * 5. Returns the best FetchResult available
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (timeout, noPlaywright, etc.)
 * @returns FetchResult with HTML, headers, and fetch metadata
 *
 * @throws {RawfyError} INVALID_URL — malformed URL
 * @throws {RawfyError} FETCH_TIMEOUT — both fetch attempts timed out
 * @throws {RawfyError} FETCH_FAILED — unrecoverable fetch failure
 */
export async function fetchPage(url: string, options?: FetchPageOptions): Promise<FetchResult> {
  const progress = options?.onProgress ?? noop

  // Validate URL upfront
  try {
    new URL(url)
  } catch {
    throw createError('INVALID_URL', `Invalid URL: ${url}`, url)
  }

  // Step 1: Check if forcePlaywright is enabled
  if (options?.forcePlaywright) {
    progress(`forcing Playwright fetch for ${url}...`)
    try {
      return await fetchPlaywright(url, options)
    } catch (err: unknown) {
      if (isRawfyError(err) && err.code === 'PLAYWRIGHT_NOT_INSTALLED') {
        progress('⚠ Playwright not installed. Falling back to static fetch.')
      } else {
        progress('⚠ Playwright fetch failed. Falling back to static fetch.')
      }
    }
  }

  // Step 2: Static fetch
  progress(`fetching ${url}...`)
  let staticResult: FetchResult

  try {
    staticResult = await fetchStatic(url, options)
  } catch (err: unknown) {
    // If static fetch fails entirely, try Playwright as last resort
    // (unless user explicitly disabled it)
    if (options?.noPlaywright) {
      if (isRawfyError(err)) throw err
      throw wrapError('FETCH_FAILED', err, url)
    }

    progress('static fetch failed, trying Playwright...')
    try {
      return await fetchPlaywright(url, options)
    } catch {
      // Both failed — throw the original static error (more useful to debug)
      if (isRawfyError(err)) throw err
      throw wrapError('FETCH_FAILED', err, url)
    }
  }

  // Step 2: If Playwright is disabled, return static result immediately
  if (options?.noPlaywright) {
    progress(`done (static, ${staticResult.durationMs}ms)`)
    return staticResult
  }

  // Step 3: Run JS-rendering detection
  const detection = detectNeedsPlaywright(staticResult.html)

  if (!detection.needsPlaywright) {
    progress(`done (static, ${staticResult.durationMs}ms)`)
    return staticResult
  }

  // Step 4: Playwright escalation
  progress(`page appears JS-rendered (${detection.reason}). Launching browser...`)

  try {
    const pwResult = await fetchPlaywright(url, options)
    progress(`done (playwright, ${pwResult.durationMs}ms)`)
    return pwResult
  } catch (err: unknown) {
    // Playwright failed — fall back to static result with a warning
    // This is intentional: a partial result is better than no result
    if (isRawfyError(err) && err.code === 'PLAYWRIGHT_NOT_INSTALLED') {
      progress('⚠ Playwright not installed. Using static fetch result. Run: rawfy install')
      return staticResult
    }

    if (isRawfyError(err) && err.code === 'FETCH_TIMEOUT') {
      progress('⚠ Playwright timed out. Using static fetch result.')
      return staticResult
    }

    // For other Playwright failures, still fall back to static
    progress('⚠ Playwright failed. Using static fetch result.')
    return staticResult
  }
}

/** No-op progress callback */
function noop(_message: string): void {
  // intentionally empty
}

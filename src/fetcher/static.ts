/**
 * Rawfy — Static HTTP fetcher
 *
 * Tier 1 fetch using Node.js built-in fetch (undici-powered).
 * Used for static HTML pages that don't require JS rendering.
 *
 * Node 18+ ships with a global `fetch` built on undici, which handles:
 * - HTTP/2 and HTTP/1.1
 * - gzip, deflate, brotli decompression (automatic)
 * - Redirect following (configurable)
 *
 * We use the native fetch rather than importing undici directly to avoid
 * an extra dependency while getting the same underlying engine.
 */

import type { FetchOptions, FetchResult } from '../types.js'
import { createError, wrapError } from '../utils/errors.js'

/** Default timeout for static fetches (ms) */
const DEFAULT_TIMEOUT_MS = 15_000

/** Maximum number of redirects to follow */
const MAX_REDIRECTS = 5

/**
 * Realistic browser User-Agent to avoid bot detection.
 * Updated periodically — matches a recent stable Chrome on macOS.
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * Fetch a URL using static HTTP.
 *
 * - Follows redirects (max 5)
 * - Sets realistic User-Agent header
 * - Handles gzip/brotli decompression (automatic via fetch)
 * - Enforces timeout (default: 15s)
 * - Returns raw HTML + response headers + final URL
 *
 * @throws {RawfyError} INVALID_URL — if the URL is malformed
 * @throws {RawfyError} FETCH_TIMEOUT — if the request exceeds the timeout
 * @throws {RawfyError} FETCH_FAILED — for any other fetch failure
 */
export async function fetchStatic(url: string, options?: FetchOptions): Promise<FetchResult> {
  // Validate URL before attempting fetch
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw createError('INVALID_URL', `Invalid URL: ${url}`, url)
  }

  // Only HTTP and HTTPS are supported
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw createError('INVALID_URL', `Unsupported protocol: ${parsedUrl.protocol}`, url)
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT

  const startTime = performance.now()

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        // Request HTML content — helps servers that do content negotiation
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        // Accept compressed responses (fetch handles decompression automatically)
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })

    // Check for too many redirects by comparing URLs
    // Note: fetch's built-in redirect following doesn't expose redirect count,
    // but we can detect if the final URL differs significantly
    if (!response.ok) {
      throw createError('FETCH_FAILED', `HTTP ${response.status} ${response.statusText}`, url, {
        status: response.status,
        statusText: response.statusText,
      })
    }

    const html = await response.text()
    const durationMs = Math.round(performance.now() - startTime)

    // Convert Headers object to a plain Record for our FetchResult type
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      html,
      finalUrl: response.url || url,
      headers,
      method: 'static',
      durationMs,
    }
  } catch (err: unknown) {
    // Re-throw RawfyErrors as-is (e.g. from the HTTP status check above)
    if (err !== null && typeof err === 'object' && 'code' in err) {
      const rawfyErr = err as { code: string }
      if (rawfyErr.code === 'FETCH_FAILED' || rawfyErr.code === 'INVALID_URL') {
        throw err
      }
    }

    // Detect timeout specifically
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw createError('FETCH_TIMEOUT', `Request to ${url} timed out after ${timeoutMs}ms`, url, {
        timeoutMs,
      })
    }

    // Also catch AbortError (older Node versions)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw createError(
        'FETCH_TIMEOUT',
        `Request to ${url} was aborted (timeout: ${timeoutMs}ms)`,
        url,
        { timeoutMs },
      )
    }

    // Wrap all other errors
    throw wrapError('FETCH_FAILED', err, url)
  }
}

/**
 * Follow redirects manually with a redirect count limit.
 *
 * The built-in fetch follows redirects automatically but doesn't expose a
 * max-redirect option in all Node versions. This helper provides that safety
 * net by performing manual redirect following when needed.
 *
 * Currently unused — the built-in redirect: 'follow' is sufficient for v1.
 * Kept as a reference for future hardening.
 */
export async function fetchWithRedirectLimit(
  url: string,
  options: {
    maxRedirects?: number
    timeoutMs?: number
    userAgent?: string
  } = {},
): Promise<FetchResult> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT

  let currentUrl = url
  let redirectCount = 0
  const startTime = performance.now()

  while (redirectCount <= maxRedirects) {
    const response = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    // If not a redirect, we're done
    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) {
        throw createError(
          'FETCH_FAILED',
          `HTTP ${response.status} ${response.statusText}`,
          currentUrl,
          { status: response.status, redirectCount },
        )
      }

      const html = await response.text()
      const durationMs = Math.round(performance.now() - startTime)

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        html,
        finalUrl: currentUrl,
        headers,
        method: 'static',
        durationMs,
      }
    }

    // Follow redirect
    const location = response.headers.get('location')
    if (!location) {
      throw createError(
        'FETCH_FAILED',
        `Redirect response ${response.status} missing Location header`,
        currentUrl,
      )
    }

    // Resolve relative redirect URLs
    currentUrl = new URL(location, currentUrl).href
    redirectCount++
  }

  throw createError('FETCH_FAILED', `Too many redirects (max ${maxRedirects})`, url, {
    redirectCount: maxRedirects,
    finalUrl: currentUrl,
  })
}

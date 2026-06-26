/**
 * Rawfy — Playwright headless fetcher
 *
 * Tier 2 fetch using Playwright Chromium for JS-rendered pages.
 * Only invoked when the detection heuristic indicates the page needs JS.
 *
 * Performance optimizations:
 * - Blocks images, fonts, and stylesheets to reduce load time
 * - Uses networkidle wait strategy with a hard timeout
 * - Single browser context per fetch (no persistent state)
 */

import type { FetchOptions, FetchResult, VideoCaptionTrack } from '../types.js'
import { createError, wrapError } from '../utils/errors.js'

/** Default Playwright page timeout (ms) */
const DEFAULT_PW_TIMEOUT_MS = 10_000

/** Resource types to block for faster page loads */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'stylesheet', 'media'])

/**
 * Default browser User-Agent.
 * Playwright already sets a realistic UA, but we override to match
 * our static fetcher for consistency.
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/**
 * Fetch a URL using Playwright headless Chromium.
 *
 * - Launches Chromium in headless mode
 * - Blocks images, fonts, stylesheets for faster load
 * - Waits for networkidle or timeout
 * - Extracts full rendered HTML
 * - Extracts native video captions via textTracks JS evaluation
 * - Closes browser after fetch
 *
 * @throws {RawfyError} PLAYWRIGHT_NOT_INSTALLED — Chromium not found
 * @throws {RawfyError} PLAYWRIGHT_FAILED — navigation or rendering error
 * @throws {RawfyError} FETCH_TIMEOUT — page load exceeded timeout
 */
export async function fetchPlaywright(url: string, options?: FetchOptions): Promise<FetchResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PW_TIMEOUT_MS
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT

  // Dynamic import — Playwright is a heavy dependency and may not be installed.
  // Using dynamic import means the module loads fast when Playwright isn't needed.
  let chromium: typeof import('playwright').chromium
  try {
    const pwExtra = await import('playwright-extra')
    const stealth = await import('puppeteer-extra-plugin-stealth')
    const pwExtraChromium = pwExtra.chromium
    pwExtraChromium.use(stealth.default())
    chromium = pwExtraChromium as unknown as typeof import('playwright').chromium
  } catch {
    throw createError(
      'PLAYWRIGHT_NOT_INSTALLED',
      'Playwright and stealth plugins are not installed. Run: npm install playwright-extra puppeteer-extra-plugin-stealth',
      url,
    )
  }

  const startTime = performance.now()
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    // Launch browser — headless, no sandbox (for CI/Docker compatibility)
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })

    // Check for proxy from environment
    const proxyUrl = process.env.RAWFY_PROXY || undefined

    const context = await browser.newContext({
      userAgent,
      ignoreHTTPSErrors: true,
      proxy: proxyUrl ? { server: proxyUrl } : undefined,
    })

    const page = await context.newPage()

    // Block heavy resources to speed up page load
    await page.route('**/*', (route) => {
      const resourceType = route.request().resourceType()
      if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
        return route.abort()
      }
      return route.continue()
    })

    // Navigate with networkidle wait — this waits until there are no more
    // than 0 network connections for at least 500ms
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: timeoutMs,
    })

    if (!response) {
      throw createError('PLAYWRIGHT_FAILED', 'Navigation returned no response', url)
    }

    // Extract the fully rendered HTML
    const html = await page.content()

    // Extract the final URL (after any client-side redirects)
    const finalUrl = page.url()

    // Extract response headers from the main navigation response
    const responseHeaders = response.headers()
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(responseHeaders)) {
      if (value !== undefined) {
        headers[key] = value
      }
    }

    // Extract native video captions via the TextTrack API
    const videoCaptions = await extractVideoCaptions(page)

    // 1. Extract the YouTube config from the browser context
    const playerConfig = await page.evaluate(() => {
      return (window as any).ytInitialPlayerConfig || {};
    });

    const durationMs = Math.round(performance.now() - startTime)

    return {
      html,
      finalUrl,
      headers,
      method: 'playwright',
      durationMs,
      playerConfig, // Pass this to the media extractor
      ...(videoCaptions.length > 0 && { videoCaptions }),
    }
  } catch (err: unknown) {
    // Re-throw existing RawfyErrors
    if (err !== null && typeof err === 'object' && 'code' in err) {
      const rawfyErr = err as { code: string }
      if (rawfyErr.code === 'PLAYWRIGHT_FAILED' || rawfyErr.code === 'PLAYWRIGHT_NOT_INSTALLED') {
        throw err
      }
    }

    // Detect Playwright timeout
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw createError(
        'FETCH_TIMEOUT',
        `Playwright timed out loading ${url} after ${timeoutMs}ms`,
        url,
        { timeoutMs },
      )
    }

    // Detect Chromium not installed (Playwright throws a specific error)
    if (
      err instanceof Error &&
      (err.message.includes("Executable doesn't exist") ||
        err.message.includes('browserType.launch'))
    ) {
      throw createError(
        'PLAYWRIGHT_NOT_INSTALLED',
        'Playwright Chromium browser not found. Run: rawfy install',
        url,
        { originalMessage: err.message },
      )
    }

    throw wrapError('PLAYWRIGHT_FAILED', err, url)
  } finally {
    // Always close the browser to prevent zombie processes
    if (browser) {
      await browser.close().catch(() => {
        // Swallow close errors — we're in cleanup
      })
    }
  }
}

/**
 * Extract video captions from the page using the TextTrack API.
 *
 * Uses a string-based evaluate expression because the callback executes in the
 * BROWSER context where DOM globals exist. Our Node.js tsconfig correctly excludes
 * the 'dom' lib, so we avoid type conflicts by passing raw JS as a string.
 *
 * Returns an empty array if no video elements or captions are found.
 */
async function extractVideoCaptions(page: {
  evaluate: (expression: string) => Promise<unknown>
}): Promise<VideoCaptionTrack[]> {
  try {
    const raw = await page.evaluate(`
      (() => {
        const videos = document.querySelectorAll('video');
        const results = [];

        for (const video of videos) {
          const tracks = video.textTracks;
          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (
              track &&
              (track.kind === 'captions' || track.kind === 'subtitles') &&
              track.cues
            ) {
              const cueTexts = [];
              for (let j = 0; j < track.cues.length; j++) {
                const cue = track.cues[j];
                if (cue && 'text' in cue) {
                  cueTexts.push(cue.text);
                }
              }

              if (cueTexts.length > 0) {
                results.push({
                  lang: track.language || 'unknown',
                  text: cueTexts.join(' '),
                  label: track.label || undefined,
                });
              }
            }
          }
        }

        return results;
      })()
    `)

    // Validate shape of returned data
    if (!Array.isArray(raw)) return []

    return (raw as Array<Record<string, unknown>>).filter(
      (item): item is { lang: string; text: string; label?: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof item['lang'] === 'string' &&
        typeof item['text'] === 'string',
    )
  } catch {
    // Caption extraction is best-effort — don't fail the whole fetch
    return []
  }
}

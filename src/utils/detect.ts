/**
 * Rawfy — Static vs JS rendering detection heuristic
 *
 * Determines whether a page needs Playwright for full rendering
 * or if the static HTTP fetch already captured meaningful content.
 *
 * Strategy:
 * 1. Check if body text is suspiciously short (< 500 chars) — likely a JS shell
 * 2. Check for framework signatures that indicate client-side rendering
 * 3. If both signals fire, recommend Playwright
 *
 * This is intentionally conservative — false negatives (missing a SPA) are
 * better than false positives (wasting time launching Playwright for static pages).
 */

import type { DetectionResult } from '../types.js'

// ---------------------------------------------------------------------------
// Framework detection patterns
// ---------------------------------------------------------------------------

interface FrameworkSignature {
  /** Human-readable framework name */
  name: string
  /** Regex pattern to match in the HTML */
  pattern: RegExp
}

/**
 * Known JS framework signatures that indicate client-side rendering.
 * These are checked against the raw HTML from a static fetch.
 */
const FRAMEWORK_SIGNATURES: FrameworkSignature[] = [
  // Next.js — the __NEXT_DATA__ script tag is always present
  { name: 'Next.js', pattern: /__NEXT_DATA__/i },

  // React — data-reactroot is added by ReactDOM.render/hydrateRoot
  { name: 'React', pattern: /data-reactroot/i },

  // React 18+ — the new root API uses data-reactroot or _reactRootContainer
  { name: 'React', pattern: /_reactRootContainer/i },

  // Vue.js — data-v- attributes are added by Vue's scoped CSS
  { name: 'Vue.js', pattern: /data-v-[a-f0-9]/i },

  // Vue + Nuxt — __NUXT__ global variable
  { name: 'Nuxt.js', pattern: /__NUXT__/i },

  // Angular — ng-version attribute on root element
  { name: 'Angular', pattern: /ng-version="/i },

  // Svelte — svelte-specific class patterns
  { name: 'SvelteKit', pattern: /__sveltekit/i },

  // Remix — __remixContext or __remix_data
  { name: 'Remix', pattern: /__remixContext|__remix/i },

  // Gatsby — ___gatsby is the root div ID
  { name: 'Gatsby', pattern: /___gatsby/i },

  // Ember.js — data-ember-action attributes
  { name: 'Ember.js', pattern: /data-ember/i },

  // Astro — astro-island custom elements (for interactive islands)
  { name: 'Astro', pattern: /astro-island/i },
]

// ---------------------------------------------------------------------------
// Content analysis
// ---------------------------------------------------------------------------

/** Minimum body text length to consider a page "rendered" */
const MIN_BODY_TEXT_LENGTH = 500

/**
 * Strip HTML tags and extract approximate text content.
 * This is intentionally simple — we just need a rough character count,
 * not a perfect parse.
 */
function extractTextLength(html: string): number {
  // Remove script and style blocks entirely
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.length
}

/**
 * Check for common "app shell" patterns — pages that are just a loader
 * div with no real content, waiting for JS to hydrate.
 */
function isAppShell(html: string): boolean {
  // Common SPA root patterns: <div id="root"></div> or <div id="app"></div>
  // with very little else in the body
  const shellPatterns = [
    /<div\s+id=["'](?:root|app|__next|__nuxt|___gatsby)["']\s*>\s*<\/div>/i,
    /<div\s+id=["'](?:root|app)["']\s*>\s*(?:<noscript>.*?<\/noscript>\s*)?<\/div>/is,
  ]

  return shellPatterns.some((pattern) => pattern.test(html))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze raw HTML to determine if the page requires JS rendering.
 *
 * Detection strategy (intentionally conservative):
 * - A framework signature alone does NOT trigger Playwright (many frameworks SSR)
 * - A short body alone does NOT trigger Playwright (some pages are genuinely short)
 * - Playwright is recommended only when BOTH signals fire, OR when an explicit
 *   app shell pattern is detected
 *
 * @param html - Raw HTML string from a static fetch
 * @returns Detection result with recommendation and human-readable reason
 */
export function detectNeedsPlaywright(html: string): DetectionResult {
  // 1. Check for app shell (empty root div) — strongest signal
  if (isAppShell(html)) {
    return {
      needsPlaywright: true,
      reason: 'Page has an empty app shell (SPA root div with no content)',
    }
  }

  // 2. Detect frameworks
  const detectedFrameworks: string[] = []
  for (const sig of FRAMEWORK_SIGNATURES) {
    if (sig.pattern.test(html)) {
      // Deduplicate framework names
      if (!detectedFrameworks.includes(sig.name)) {
        detectedFrameworks.push(sig.name)
      }
    }
  }

  // 3. Check body text length
  const textLength = extractTextLength(html)
  const isShortBody = textLength < MIN_BODY_TEXT_LENGTH

  // 4. Decision logic
  if (detectedFrameworks.length > 0 && isShortBody) {
    return {
      needsPlaywright: true,
      reason: `Detected ${detectedFrameworks.join(', ')} with sparse content (${textLength} chars). Page likely requires JS rendering.`,
    }
  }

  if (detectedFrameworks.length > 0) {
    // Framework detected but page has substantial content — likely SSR
    return {
      needsPlaywright: false,
      reason: `Detected ${detectedFrameworks.join(', ')} but page has sufficient content (${textLength} chars). Likely server-rendered.`,
    }
  }

  if (isShortBody) {
    // Short body but no framework — might be a genuinely short page
    return {
      needsPlaywright: false,
      reason: `Page has sparse content (${textLength} chars) but no JS framework detected. Treating as static.`,
    }
  }

  return {
    needsPlaywright: false,
    reason: `Static page with sufficient content (${textLength} chars). No JS framework detected.`,
  }
}

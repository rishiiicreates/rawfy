/**
 * Rawfy — Page type classification
 *
 * Determines what kind of page we're looking at using signals from:
 * - URL patterns (path, query params)
 * - Open Graph og:type
 * - JSON-LD @type
 * - HTML content patterns
 *
 * Classification order (first match wins):
 * 1. JSON-LD @type (most explicit signal)
 * 2. OG:type (explicit metadata)
 * 3. URL-based heuristics
 * 4. Content-based heuristics
 * 5. Default: 'other'
 */

import type { PageType, OpenGraphData } from '../types.js'

/**
 * Classify a page into one of the known page types.
 *
 * @param html - Raw HTML string
 * @param url - Page URL
 * @param og - Extracted Open Graph data
 * @param jsonLd - Extracted JSON-LD objects
 * @returns PageType classification
 */
export function classifyPageType(
  html: string,
  url: string,
  og?: OpenGraphData,
  jsonLd?: unknown[],
): PageType {
  // 1. JSON-LD @type check
  const jsonLdType = getJsonLdType(jsonLd)
  if (jsonLdType) return jsonLdType

  // 2. OG:type check
  if (og?.type) {
    const ogType = mapOgType(og.type)
    if (ogType) return ogType
  }

  // 3. URL-based heuristics
  const urlType = classifyByUrl(url)
  if (urlType) return urlType

  // 4. Content-based heuristics
  const contentType = classifyByContent(html)
  if (contentType) return contentType

  return 'other'
}

// ---------------------------------------------------------------------------
// Classifiers
// ---------------------------------------------------------------------------

/**
 * Extract a PageType from JSON-LD @type fields.
 */
function getJsonLdType(jsonLd?: unknown[]): PageType | null {
  if (!jsonLd || jsonLd.length === 0) return null

  for (const item of jsonLd) {
    if (typeof item !== 'object' || item === null) continue
    const typed = item as Record<string, unknown>
    const ldType = typed['@type']
    if (typeof ldType !== 'string') continue

    const lower = ldType.toLowerCase()

    if (
      lower.includes('article') ||
      lower.includes('newsarticle') ||
      lower.includes('blogposting') ||
      lower.includes('scholararticle')
    ) {
      return 'article'
    }

    if (lower.includes('product') || lower.includes('offer')) {
      return 'product'
    }

    if (lower.includes('videoobject')) {
      return 'video'
    }

    if (lower.includes('searchresultspage')) {
      return 'search'
    }

    if (lower.includes('website') || lower.includes('webpage')) {
      // Generic — let URL/content heuristics take over
      continue
    }
  }

  return null
}

/**
 * Map Open Graph og:type to our PageType.
 */
function mapOgType(ogType: string): PageType | null {
  const lower = ogType.toLowerCase()

  if (lower === 'article') return 'article'
  if (lower === 'product' || lower === 'product.item') return 'product'
  if (lower.startsWith('video')) return 'video'

  return null
}

/**
 * Classify based on URL path and query parameters.
 */
function classifyByUrl(url: string): PageType | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const path = parsed.pathname.toLowerCase()

  // Homepage detection
  if (path === '/' || path === '') return 'homepage'

  // Search pages
  if (
    parsed.searchParams.has('q') ||
    parsed.searchParams.has('query') ||
    parsed.searchParams.has('search') ||
    path.includes('/search')
  ) {
    return 'search'
  }

  // Documentation pages
  if (
    path.includes('/docs') ||
    path.includes('/documentation') ||
    path.includes('/guide') ||
    path.includes('/tutorial') ||
    path.includes('/reference') ||
    path.includes('/api/')
  ) {
    return 'docs'
  }

  // Article patterns
  if (
    path.includes('/blog') ||
    path.includes('/post') ||
    path.includes('/article') ||
    path.includes('/news')
  ) {
    return 'article'
  }

  // Product pages
  if (path.includes('/product') || path.includes('/item') || path.includes('/shop/')) {
    return 'product'
  }

  return null
}

/**
 * Classify based on HTML content patterns.
 * This is the lowest-priority classifier.
 */
function classifyByContent(html: string): PageType | null {
  const lower = html.toLowerCase()

  // Video page signals
  if (
    lower.includes('<video') ||
    lower.includes('youtube.com/embed') ||
    lower.includes('player.vimeo.com')
  ) {
    return 'video'
  }

  // Article signals (common article wrappers)
  if (
    lower.includes('<article') ||
    lower.includes('class="post-content"') ||
    lower.includes('class="entry-content"') ||
    lower.includes('class="article-body"')
  ) {
    return 'article'
  }

  // Product signals
  if (
    lower.includes('add-to-cart') ||
    lower.includes('add_to_cart') ||
    lower.includes('class="price"')
  ) {
    return 'product'
  }

  return null
}

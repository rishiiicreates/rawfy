/**
 * Rawfy — Metadata extractor
 *
 * Extracts structured metadata from HTML using jsdom:
 * - <title> and <meta name="description">
 * - Open Graph (<meta property="og:*">)
 * - Twitter Cards (<meta name="twitter:*">)
 * - JSON-LD (<script type="application/ld+json">)
 * - Language detection (<html lang> or content-language header)
 * - Page type classification
 * - Word count and reading time
 */

import { JSDOM } from 'jsdom'
import type { PageMetadata, OpenGraphData } from '../types.js'
import { classifyPageType } from '../utils/classify.js'

/**
 * Extract all metadata from a raw HTML string.
 *
 * @param html - Raw HTML string
 * @param url - Final page URL (after redirects)
 * @param headers - HTTP response headers (for content-language fallback)
 * @param bodyText - Pre-extracted body text (for word count/reading time)
 * @param interactiveCount - Number of interactive elements found
 * @returns PageMetadata object
 */
export function extractMetadata(
  html: string,
  url: string,
  headers: Record<string, string> = {},
  bodyText: string = '',
  interactiveCount: number = 0,
): PageMetadata {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document

  // Title: <title> tag, then og:title fallback
  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    getMetaContent(doc, 'og:title', 'property') ||
    undefined

  // Description: <meta name="description">, then og:description
  const description =
    getMetaContent(doc, 'description', 'name') ||
    getMetaContent(doc, 'og:description', 'property') ||
    undefined

  // Canonical URL
  const canonicalLink = doc.querySelector('link[rel="canonical"]')
  const canonicalUrl = canonicalLink?.getAttribute('href') || undefined

  // Language: <html lang>, then content-language header
  const lang =
    doc.documentElement?.getAttribute('lang')?.trim() ||
    headers['content-language']?.split(',')[0]?.trim() ||
    undefined

  // Open Graph data
  const og = extractOpenGraph(doc)

  // JSON-LD blocks
  const jsonLd = extractJsonLd(doc)

  // Word count and reading time (average 200 words/minute)
  const words = bodyText.split(/\s+/).filter((w) => w.length > 0)
  const wordCount = words.length
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

  // Page type classification
  const type = classifyPageType(html, url, og, jsonLd)

  return {
    url,
    canonicalUrl,
    type,
    fetchedAt: new Date().toISOString(),
    lang,
    title,
    description,
    wordCount,
    readingTimeMinutes,
    interactiveElementCount: interactiveCount,
    og: Object.keys(og).length > 0 ? og : undefined,
    jsonLd: jsonLd.length > 0 ? jsonLd : undefined,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get content from a <meta> tag by attribute selector.
 *
 * @param doc - DOM document
 * @param value - The value to match (e.g. 'description', 'og:title')
 * @param attr - Which attribute to match on ('name' or 'property')
 */
function getMetaContent(doc: Document, value: string, attr: 'name' | 'property'): string | null {
  const el = doc.querySelector(`meta[${attr}="${value}"]`)
  return el?.getAttribute('content')?.trim() || null
}

/**
 * Extract Open Graph metadata from all <meta property="og:*"> tags.
 */
function extractOpenGraph(doc: Document): OpenGraphData {
  const og: OpenGraphData = {}

  const ogTitle = getMetaContent(doc, 'og:title', 'property')
  if (ogTitle) og.title = ogTitle

  const ogType = getMetaContent(doc, 'og:type', 'property')
  if (ogType) og.type = ogType

  const ogDescription = getMetaContent(doc, 'og:description', 'property')
  if (ogDescription) og.description = ogDescription

  const ogImage = getMetaContent(doc, 'og:image', 'property')
  if (ogImage) og.image = ogImage

  const ogUrl = getMetaContent(doc, 'og:url', 'property')
  if (ogUrl) og.url = ogUrl

  const ogSiteName = getMetaContent(doc, 'og:site_name', 'property')
  if (ogSiteName) og.siteName = ogSiteName

  return og
}

/**
 * Extract and parse all <script type="application/ld+json"> blocks.
 * Returns an array of parsed JSON objects. Silently skips invalid JSON.
 */
function extractJsonLd(doc: Document): unknown[] {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const results: unknown[] = []

  for (const script of scripts) {
    const text = script.textContent?.trim()
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text)
        results.push(parsed)
      } catch {
        // Skip invalid JSON-LD blocks
      }
    }
  }

  return results
}

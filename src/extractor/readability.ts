/**
 * Rawfy — Readability wrapper
 *
 * Wraps @mozilla/readability to extract article content from HTML.
 * Uses jsdom to parse raw HTML into a DOM document.
 *
 * Readability is designed for article-type pages. For non-article pages
 * (homepages, search results, etc.), it will return null. In that case,
 * we fall back to extracting the full <body> content.
 */

import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import type { ReadabilityResult } from '../types.js'

/**
 * Extract article content from raw HTML using Readability.
 *
 * @param html - Raw HTML string
 * @param url - Page URL (used by Readability for resolving relative URLs)
 * @returns ReadabilityResult with title, content, excerpt, byline, siteName.
 *          Returns a fallback result if Readability can't parse the page.
 */
export function extractReadability(html: string, url: string): ReadabilityResult {
  // Parse HTML into a DOM document using jsdom
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document

  // Attempt Readability extraction
  const reader = new Readability(doc)
  const article = reader.parse()

  if (article) {
    return {
      title: article.title || '',
      content: article.content || '',
      excerpt: article.excerpt || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
    }
  }

  // Fallback: extract full body content when Readability can't parse
  // This handles non-article pages (homepages, dashboards, search results)
  return extractBodyFallback(html, url)
}

/**
 * Fallback extraction: grab the full <body> innerHTML.
 *
 * Used when Readability returns null (page isn't article-structured).
 * Creates a fresh JSDOM to avoid reusing the mutated DOM from Readability.
 */
function extractBodyFallback(html: string, url: string): ReadabilityResult {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document

  // Extract title from <title> tag or first <h1>
  const title =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    ''

  // Get body content, stripping script and style tags
  const body = doc.body
  if (!body) {
    return { title, content: '' }
  }

  // Remove script, style, and noscript elements before extracting content
  const elementsToRemove = body.querySelectorAll('script, style, noscript')
  for (const el of elementsToRemove) {
    el.remove()
  }

  const content = body.innerHTML.trim()

  return {
    title,
    content,
  }
}

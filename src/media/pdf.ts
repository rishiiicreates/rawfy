/**
 * Rawfy — PDF media handler
 *
 * Detects PDF links in a page and extracts text content using pdfjs-dist.
 *
 * Strategy:
 * 1. Scan all <a href="..."> links for PDF URLs
 * 2. For each PDF, fetch and extract text with pdfjs-dist
 * 3. Return structured PdfResult with title, page count, text
 */

import { JSDOM } from 'jsdom'
import type { PdfResult } from '../types.js'

/** Options for PDF extraction */
export interface PdfExtractOptions {
  /** Maximum number of PDFs to process (default: 3) */
  maxPdfs?: number
  /** Maximum pages to extract per PDF (default: 20) */
  maxPages?: number
  /** Fetch timeout per PDF in ms (default: 15000) */
  timeoutMs?: number
}

const DEFAULT_MAX_PDFS = 3
const DEFAULT_MAX_PAGES = 20
const DEFAULT_TIMEOUT_MS = 15000

/**
 * Detect PDF links in HTML and extract their text content.
 *
 * @param html - Raw HTML string
 * @param url - Page URL for resolving relative paths
 * @param options - PDF extraction options
 * @returns Array of PdfResult objects
 */
export async function extractPdfs(
  html: string,
  url: string,
  options: PdfExtractOptions = {},
): Promise<PdfResult[]> {
  const maxPdfs = options.maxPdfs ?? DEFAULT_MAX_PDFS
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const dom = new JSDOM(html, { url })
  const doc = dom.window.document

  // Find all links pointing to PDFs
  const pdfLinks = findPdfLinks(doc, url)

  // Deduplicate by URL
  const uniqueUrls = [...new Set(pdfLinks)]
  const toProcess = uniqueUrls.slice(0, maxPdfs)

  const results: PdfResult[] = []

  for (const pdfUrl of toProcess) {
    try {
      const result = await extractPdfContent(pdfUrl, maxPages, timeoutMs)
      results.push(result)
    } catch {
      // Record the PDF but note extraction failed
      results.push({
        type: 'pdf',
        src: pdfUrl,
        title: extractTitleFromUrl(pdfUrl),
      })
    }
  }

  return results
}

/**
 * Format a PdfResult into the WSM placeholder format.
 */
export function formatPdf(pdf: PdfResult): string {
  const parts: string[] = ['PDF']
  if (pdf.title) parts.push(`"${pdf.title}"`)
  if (pdf.pageCount) parts.push(`${pdf.pageCount} pages`)
  if (pdf.text) {
    const truncated = pdf.text.length > 500 ? pdf.text.slice(0, 497) + '...' : pdf.text
    parts.push(`text: ${truncated}`)
  } else {
    parts.push('text: extraction failed')
  }
  return `[${parts.join(' | ')}]`
}

// ---------------------------------------------------------------------------
// PDF Link Detection
// ---------------------------------------------------------------------------

/**
 * Find all PDF URLs in anchor elements.
 */
function findPdfLinks(doc: Document, baseUrl: string): string[] {
  const links = doc.querySelectorAll('a[href]')
  const pdfUrls: string[] = []

  for (const link of links) {
    const href = link.getAttribute('href') || ''
    if (!href) continue

    // Check if URL ends with .pdf or has pdf in the path
    const isPdf =
      href.toLowerCase().endsWith('.pdf') ||
      href.toLowerCase().includes('.pdf?') ||
      href.toLowerCase().includes('/pdf/') ||
      link.getAttribute('type')?.includes('pdf') === true

    if (isPdf) {
      try {
        const resolved = new URL(href, baseUrl).href
        pdfUrls.push(resolved)
      } catch {
        // Skip unresolvable URLs
      }
    }
  }

  return pdfUrls
}

// ---------------------------------------------------------------------------
// PDF Text Extraction
// ---------------------------------------------------------------------------

/**
 * Fetch a PDF and extract text content using pdfjs-dist.
 */
async function extractPdfContent(
  pdfUrl: string,
  maxPages: number,
  timeoutMs: number,
): Promise<PdfResult> {
  // Fetch PDF binary
  const response = await fetch(pdfUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })

  if (!response.ok) {
    return {
      type: 'pdf',
      src: pdfUrl,
      title: extractTitleFromUrl(pdfUrl),
    }
  }

  const arrayBuffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)

  // Dynamic import of pdfjs-dist to avoid loading unless needed
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
  })

  const pdfDoc = await loadingTask.promise
  const numPages = pdfDoc.numPages
  const pagesToExtract = Math.min(numPages, maxPages)

  // Extract text from each page
  const textParts: string[] = []
  for (let i = 1; i <= pagesToExtract; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()

    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()

    if (pageText) textParts.push(pageText)
  }

  const fullText = textParts.join('\n\n')

  // Try to extract title from PDF metadata
  const metadata = await pdfDoc.getMetadata().catch(() => null)
  const pdfTitle = (metadata?.info as Record<string, unknown> | undefined)?.['Title'] as
    | string
    | undefined

  return {
    type: 'pdf',
    src: pdfUrl,
    title: pdfTitle || extractTitleFromUrl(pdfUrl),
    pageCount: numPages,
    text: fullText || undefined,
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable title from a PDF URL.
 */
function extractTitleFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    const filename = path.split('/').pop()
    if (!filename) return undefined

    // Remove .pdf extension and clean up
    return (
      filename
        .replace(/\.pdf$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || undefined
    )
  } catch {
    return undefined
  }
}

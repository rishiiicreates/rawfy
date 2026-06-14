import { describe, it, expect } from 'vitest'
import { extractPdfs, formatPdf } from '../../src/media/pdf.js'

describe('extractPdfs', () => {
  const BASE = 'https://example.com'

  describe('PDF link detection', () => {
    it('detects links ending in .pdf', async () => {
      const html = `
        <html><body>
          <a href="/docs/manual.pdf">Download Manual</a>
        </body></html>
      `
      // extractPdfs will try to fetch — mock fetch to return error
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() =>
        Promise.reject(new Error('network disabled'))) as typeof fetch

      try {
        const results = await extractPdfs(html, BASE)
        expect(results).toHaveLength(1)
        expect(results[0]!.src).toBe('https://example.com/docs/manual.pdf')
        expect(results[0]!.title).toBe('manual') // from URL
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('detects links with .pdf? query params', async () => {
      const html = `
        <html><body>
          <a href="/files/report.pdf?v=2">Report</a>
        </body></html>
      `
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() =>
        Promise.reject(new Error('network disabled'))) as typeof fetch

      try {
        const results = await extractPdfs(html, BASE)
        expect(results).toHaveLength(1)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('deduplicates PDF URLs', async () => {
      const html = `
        <html><body>
          <a href="/doc.pdf">Link 1</a>
          <a href="/doc.pdf">Link 2</a>
        </body></html>
      `
      const originalFetch = globalThis.fetch
      globalThis.fetch = (() =>
        Promise.reject(new Error('network disabled'))) as typeof fetch

      try {
        const results = await extractPdfs(html, BASE)
        expect(results).toHaveLength(1)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('limits number of PDFs processed', async () => {
      const links = Array.from({ length: 10 }, (_, i) =>
        `<a href="/doc${i}.pdf">PDF ${i}</a>`
      ).join('\n')
      const html = `<html><body>${links}</body></html>`

      const originalFetch = globalThis.fetch
      globalThis.fetch = (() =>
        Promise.reject(new Error('network disabled'))) as typeof fetch

      try {
        const results = await extractPdfs(html, BASE, { maxPdfs: 2 })
        expect(results).toHaveLength(2)
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('returns empty array for pages with no PDF links', async () => {
      const html = '<html><body><a href="/page.html">Page</a></body></html>'
      const results = await extractPdfs(html, BASE)
      expect(results).toEqual([])
    })
  })
})

describe('formatPdf', () => {
  it('formats PDF with title, pages, and text', () => {
    const result = formatPdf({
      type: 'pdf',
      src: 'https://example.com/doc.pdf',
      title: 'Annual Report',
      pageCount: 42,
      text: 'Revenue increased by 15%...',
    })
    expect(result).toContain('PDF')
    expect(result).toContain('"Annual Report"')
    expect(result).toContain('42 pages')
    expect(result).toContain('text: Revenue')
  })

  it('formats PDF with failed extraction', () => {
    const result = formatPdf({
      type: 'pdf',
      src: 'https://example.com/doc.pdf',
    })
    expect(result).toContain('text: extraction failed')
  })

  it('truncates long PDF text', () => {
    const result = formatPdf({
      type: 'pdf',
      src: 'https://example.com/doc.pdf',
      text: 'word '.repeat(200),
    })
    expect(result).toContain('...')
  })
})

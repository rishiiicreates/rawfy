import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractMetadata } from '../../src/extractor/metadata.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractMetadata', () => {
  describe('basic metadata', () => {
    it('extracts title from <title> tag', () => {
      const html = '<html><head><title>Test Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com')
      expect(result.title).toBe('Test Page')
    })

    it('extracts description from meta tag', () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <meta name="description" content="A test page description">
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.description).toBe('A test page description')
    })

    it('falls back to og:title when no <title>', () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="OG Title">
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.title).toBe('OG Title')
    })

    it('extracts canonical URL', () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <link rel="canonical" href="https://example.com/canonical">
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com/original')
      expect(result.canonicalUrl).toBe('https://example.com/canonical')
    })
  })

  describe('language detection', () => {
    it('detects language from <html lang>', () => {
      const html = '<html lang="fr"><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com')
      expect(result.lang).toBe('fr')
    })

    it('falls back to content-language header', () => {
      const html = '<html><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com', {
        'content-language': 'de',
      })
      expect(result.lang).toBe('de')
    })
  })

  describe('Open Graph', () => {
    it('extracts full OG data', () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <meta property="og:title" content="OG Title">
            <meta property="og:type" content="article">
            <meta property="og:description" content="OG Description">
            <meta property="og:image" content="https://example.com/image.jpg">
            <meta property="og:url" content="https://example.com/page">
            <meta property="og:site_name" content="Example Site">
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.og).toEqual({
        title: 'OG Title',
        type: 'article',
        description: 'OG Description',
        image: 'https://example.com/image.jpg',
        url: 'https://example.com/page',
        siteName: 'Example Site',
      })
    })

    it('omits og field when no OG tags present', () => {
      const html = '<html><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com')
      expect(result.og).toBeUndefined()
    })
  })

  describe('JSON-LD', () => {
    it('extracts and parses JSON-LD blocks', () => {
      const html = `
        <html>
          <head>
            <title>Article</title>
            <script type="application/ld+json">
              {"@type": "Article", "headline": "Test Article"}
            </script>
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.jsonLd).toBeDefined()
      expect(result.jsonLd).toHaveLength(1)
      expect(result.jsonLd![0]).toEqual({
        '@type': 'Article',
        headline: 'Test Article',
      })
    })

    it('handles multiple JSON-LD blocks', () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <script type="application/ld+json">{"@type": "WebSite"}</script>
            <script type="application/ld+json">{"@type": "BreadcrumbList"}</script>
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.jsonLd).toHaveLength(2)
    })

    it('skips invalid JSON-LD gracefully', () => {
      const html = `
        <html>
          <head>
            <title>Page</title>
            <script type="application/ld+json">not valid json{</script>
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com')
      expect(result.jsonLd).toBeUndefined()
    })
  })

  describe('word count and reading time', () => {
    it('calculates word count from body text', () => {
      const bodyText = 'word '.repeat(400) // 400 words
      const html = '<html><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com', {}, bodyText)
      expect(result.wordCount).toBe(400)
      expect(result.readingTimeMinutes).toBe(2) // ceil(400/200)
    })

    it('returns minimum 1 minute reading time', () => {
      const html = '<html><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com', {}, 'short')
      expect(result.readingTimeMinutes).toBe(1)
    })
  })

  describe('page type classification', () => {
    it('classifies article from JSON-LD', () => {
      const html = `
        <html>
          <head>
            <title>Article</title>
            <script type="application/ld+json">{"@type": "Article"}</script>
          </head>
          <body></body>
        </html>
      `
      const result = extractMetadata(html, 'https://example.com/blog/post')
      expect(result.type).toBe('article')
    })

    it('classifies homepage by URL', () => {
      const html = '<html><head><title>Home</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com/')
      expect(result.type).toBe('homepage')
    })

    it('classifies docs pages by URL', () => {
      const html = '<html><head><title>Docs</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com/docs/getting-started')
      expect(result.type).toBe('docs')
    })
  })

  describe('metadata shape', () => {
    it('always includes required fields', () => {
      const html = '<html><head><title>Page</title></head><body></body></html>'
      const result = extractMetadata(html, 'https://example.com')

      expect(result.url).toBe('https://example.com')
      expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(typeof result.wordCount).toBe('number')
      expect(typeof result.readingTimeMinutes).toBe('number')
      expect(typeof result.interactiveElementCount).toBe('number')
    })
  })
})

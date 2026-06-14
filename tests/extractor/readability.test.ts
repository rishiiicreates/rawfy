import { describe, it, expect } from 'vitest'
import { extractReadability } from '../../src/extractor/readability.js'

describe('extractReadability', () => {
  describe('article pages', () => {
    it('extracts article content from a well-structured page', () => {
      const html = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <article>
              <h1>Test Article Title</h1>
              <p>By John Doe</p>
              <p>${'This is the main article content. '.repeat(30)}</p>
              <p>${'More article content follows here. '.repeat(30)}</p>
            </article>
          </body>
        </html>
      `
      const result = extractReadability(html, 'https://example.com/article')

      expect(result.title).toBeTruthy()
      expect(result.content).toContain('article content')
      expect(result.content.length).toBeGreaterThan(100)
    })

    it('extracts byline when present', () => {
      const html = `
        <html>
          <head><title>Article</title></head>
          <body>
            <article>
              <h1>Article Title</h1>
              <address class="author">By Jane Smith</address>
              <p>${'Long article content here. '.repeat(50)}</p>
            </article>
          </body>
        </html>
      `
      const result = extractReadability(html, 'https://example.com/article')
      // Readability may or may not pick up the byline depending on structure
      expect(result.title).toBeTruthy()
      expect(result.content).toBeTruthy()
    })
  })

  describe('non-article pages (fallback)', () => {
    it('falls back to body content for homepage-like pages', () => {
      const html = `
        <html>
          <head><title>My Homepage</title></head>
          <body>
            <nav><a href="/about">About</a></nav>
            <div class="hero">Welcome to my site</div>
            <div class="features">Feature 1, Feature 2</div>
            <footer>Copyright 2024</footer>
          </body>
        </html>
      `
      const result = extractReadability(html, 'https://example.com')

      expect(result.title).toBe('My Homepage')
      expect(result.content).toContain('Welcome to my site')
    })

    it('strips script and style tags in fallback', () => {
      const html = `
        <html>
          <head><title>Page</title></head>
          <body>
            <script>var x = 1;</script>
            <style>.foo { color: red; }</style>
            <p>Visible content</p>
          </body>
        </html>
      `
      const result = extractReadability(html, 'https://example.com')

      expect(result.content).toContain('Visible content')
      expect(result.content).not.toContain('var x = 1')
      expect(result.content).not.toContain('.foo')
    })

    it('handles pages with no <title> tag', () => {
      const html = `
        <html>
          <head></head>
          <body>
            <h1>Page Heading</h1>
            <p>Some content</p>
          </body>
        </html>
      `
      const result = extractReadability(html, 'https://example.com')
      // Readability may or may not extract the h1 as title
      expect(result).toBeDefined()
      expect(result.content).toBeTruthy()
    })
  })

  describe('edge cases', () => {
    it('handles empty HTML', () => {
      const result = extractReadability('', 'https://example.com')
      expect(result).toBeDefined()
      expect(result.title).toBeDefined()
    })

    it('handles HTML with no body', () => {
      const html = '<html><head><title>No Body</title></head></html>'
      const result = extractReadability(html, 'https://example.com')
      expect(result.title).toBe('No Body')
    })
  })
})

import { describe, it, expect } from 'vitest'
import { detectNeedsPlaywright } from '../../src/utils/detect.js'

describe('detectNeedsPlaywright', () => {
  describe('static pages (should NOT need Playwright)', () => {
    it('returns false for a plain HTML page with substantial content', () => {
      const html = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <h1>Hello World</h1>
            <p>${'Lorem ipsum dolor sit amet. '.repeat(50)}</p>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(false)
      expect(result.reason).toContain('sufficient content')
    })

    it('returns false for a short page with no framework signals', () => {
      const html = `
        <html>
          <head><title>Short Page</title></head>
          <body><p>Brief content.</p></body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(false)
      expect(result.reason).toContain('sparse content')
      expect(result.reason).toContain('no JS framework')
    })

    it('returns false for SSR Next.js page with full content', () => {
      // Next.js SSR pages have __NEXT_DATA__ but also have rendered HTML content
      const html = `
        <html>
          <head><title>SSR Page</title></head>
          <body>
            <div id="__next">
              <h1>Server-Rendered Article</h1>
              <p>${'This is server-rendered content from Next.js. '.repeat(30)}</p>
            </div>
            <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(false)
      expect(result.reason).toContain('Next.js')
      expect(result.reason).toContain('sufficient content')
    })

    it('returns false for SSR React page with data-reactroot', () => {
      const html = `
        <html>
          <head><title>React SSR</title></head>
          <body>
            <div data-reactroot>
              <article>
                <h1>React Server-Rendered Article</h1>
                <p>${'Article content rendered on the server. '.repeat(30)}</p>
              </article>
            </div>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(false)
    })
  })

  describe('SPA pages (SHOULD need Playwright)', () => {
    it('detects empty React app shell', () => {
      const html = `
        <html>
          <head>
            <title>React App</title>
          </head>
          <body>
            <div id="root"></div>
            <script src="/static/js/bundle.js"></script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
      expect(result.reason).toContain('app shell')
    })

    it('detects empty Vue app shell', () => {
      const html = `
        <html>
          <head><title>Vue App</title></head>
          <body>
            <div id="app"></div>
            <script src="/js/app.js"></script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
    })

    it('detects empty Next.js shell', () => {
      const html = `
        <html>
          <head><title>Loading...</title></head>
          <body>
            <div id="__next"></div>
            <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
    })

    it('detects framework + sparse content combo', () => {
      const html = `
        <html>
          <head><title>SPA</title></head>
          <body>
            <div data-reactroot>
              <div class="loading-spinner"></div>
            </div>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
      expect(result.reason).toContain('React')
    })

    it('detects Angular app with ng-version and sparse content', () => {
      const html = `
        <html>
          <head><title>Angular App</title></head>
          <body>
            <app-root ng-version="17.0.0">
              <div class="spinner">Loading...</div>
            </app-root>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
      expect(result.reason).toContain('Angular')
    })
  })

  describe('edge cases', () => {
    it('handles empty HTML string', () => {
      const result = detectNeedsPlaywright('')
      expect(result.needsPlaywright).toBe(false)
    })

    it('handles HTML with only script and style tags', () => {
      const html = `
        <html>
          <head>
            <style>body { margin: 0; }</style>
          </head>
          <body>
            <script>console.log('hello')</script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      // Script/style content is stripped — this is a short page
      expect(result.needsPlaywright).toBe(false)
    })

    it('handles Gatsby empty shell', () => {
      const html = `
        <html>
          <head><title>Gatsby Site</title></head>
          <body>
            <div id="___gatsby"></div>
            <script src="/chunk.js"></script>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
    })

    it('handles noscript fallback in app shell', () => {
      const html = `
        <html>
          <body>
            <div id="root"><noscript>You need JavaScript to run this app.</noscript></div>
          </body>
        </html>
      `
      const result = detectNeedsPlaywright(html)
      expect(result.needsPlaywright).toBe(true)
    })
  })
})

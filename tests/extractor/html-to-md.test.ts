import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '../../src/extractor/html-to-md.js'

const BASE_URL = 'https://example.com'

describe('htmlToMarkdown', () => {
  describe('headings', () => {
    it('converts headings to ATX style', () => {
      const md = htmlToMarkdown('<h1>Title</h1><h2>Subtitle</h2>', BASE_URL)
      expect(md).toContain('# Title')
      expect(md).toContain('## Subtitle')
    })
  })

  describe('paragraphs and text', () => {
    it('converts paragraphs to plain text with spacing', () => {
      const md = htmlToMarkdown('<p>First paragraph.</p><p>Second paragraph.</p>', BASE_URL)
      expect(md).toContain('First paragraph.')
      expect(md).toContain('Second paragraph.')
    })

    it('converts bold and italic', () => {
      const md = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>', BASE_URL)
      expect(md).toContain('**bold**')
      expect(md).toContain('*italic*')
    })
  })

  describe('links', () => {
    it('converts links with text', () => {
      const md = htmlToMarkdown('<a href="https://example.com/page">Click here</a>', BASE_URL)
      expect(md).toContain('[Click here](https://example.com/page)')
    })

    it('resolves relative URLs', () => {
      const md = htmlToMarkdown('<a href="/about">About</a>', BASE_URL)
      expect(md).toContain('[About](https://example.com/about)')
    })

    it('preserves javascript: links as plain text', () => {
      const md = htmlToMarkdown('<a href="javascript:void(0)">Click</a>', BASE_URL)
      expect(md).not.toContain('javascript:')
      expect(md).toContain('Click')
    })

    it('includes title attribute when present', () => {
      const md = htmlToMarkdown(
        '<a href="/page" title="Page Title">Link</a>',
        BASE_URL,
      )
      expect(md).toContain('"Page Title"')
    })
  })

  describe('images', () => {
    it('converts img to machine-readable placeholder', () => {
      const md = htmlToMarkdown(
        '<img src="https://example.com/photo.jpg" alt="A sunset">',
        BASE_URL,
      )
      expect(md).toContain('[IMAGE: A sunset | src: https://example.com/photo.jpg]')
    })

    it('handles missing alt text', () => {
      const md = htmlToMarkdown('<img src="/photo.jpg">', BASE_URL)
      expect(md).toContain('[IMAGE: no alt text')
    })

    it('handles data-src (lazy loading)', () => {
      const md = htmlToMarkdown(
        '<img data-src="https://cdn.example.com/lazy.jpg" alt="Lazy image">',
        BASE_URL,
      )
      expect(md).toContain('[IMAGE: Lazy image | src: https://cdn.example.com/lazy.jpg]')
    })
  })

  describe('video', () => {
    it('converts video to placeholder', () => {
      const md = htmlToMarkdown(
        '<video src="https://example.com/video.mp4" poster="https://example.com/thumb.jpg"></video>',
        BASE_URL,
      )
      expect(md).toContain('[VIDEO')
      expect(md).toContain('src: https://example.com/video.mp4')
      expect(md).toContain('poster: https://example.com/thumb.jpg')
    })

    it('handles <source> child element', () => {
      const md = htmlToMarkdown(
        '<video><source src="https://example.com/v.webm" type="video/webm"></video>',
        BASE_URL,
      )
      expect(md).toContain('src: https://example.com/v.webm')
    })
  })

  describe('audio', () => {
    it('converts audio to placeholder', () => {
      const md = htmlToMarkdown(
        '<audio src="https://example.com/podcast.mp3"></audio>',
        BASE_URL,
      )
      expect(md).toContain('[AUDIO | src: https://example.com/podcast.mp3]')
    })
  })

  describe('code blocks', () => {
    it('converts <pre><code> to fenced code block', () => {
      const md = htmlToMarkdown(
        '<pre><code class="language-javascript">const x = 1;</code></pre>',
        BASE_URL,
      )
      expect(md).toContain('```javascript')
      expect(md).toContain('const x = 1;')
      expect(md).toContain('```')
    })

    it('handles code blocks without language', () => {
      const md = htmlToMarkdown(
        '<pre><code>plain code</code></pre>',
        BASE_URL,
      )
      expect(md).toContain('```')
      expect(md).toContain('plain code')
    })

    it('converts inline <code> to backticks', () => {
      const md = htmlToMarkdown(
        '<p>Use <code>npm install</code> to install.</p>',
        BASE_URL,
      )
      expect(md).toContain('`npm install`')
    })
  })

  describe('tables', () => {
    it('converts HTML table to markdown table', () => {
      const md = htmlToMarkdown(
        `<table>
          <tr><th>Name</th><th>Age</th></tr>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </table>`,
        BASE_URL,
      )
      expect(md).toContain('| Name | Age |')
      expect(md).toContain('| --- | --- |')
      expect(md).toContain('| Alice | 30 |')
      expect(md).toContain('| Bob | 25 |')
    })
  })

  describe('figure', () => {
    it('preserves figure with figcaption', () => {
      const md = htmlToMarkdown(
        `<figure>
          <img src="https://example.com/chart.png" alt="Chart">
          <figcaption>Figure 1: Sales data</figcaption>
        </figure>`,
        BASE_URL,
      )
      expect(md).toContain('[IMAGE: Chart')
      expect(md).toContain('*Figure 1: Sales data*')
    })
  })

  describe('details/summary', () => {
    it('converts details/summary to bold heading with content', () => {
      const md = htmlToMarkdown(
        `<details>
          <summary>Click to expand</summary>
          <p>Hidden content here.</p>
        </details>`,
        BASE_URL,
      )
      expect(md).toContain('**Click to expand**')
      expect(md).toContain('Hidden content here')
    })
  })

  describe('lists', () => {
    it('converts unordered lists', () => {
      const md = htmlToMarkdown(
        '<ul><li>Item 1</li><li>Item 2</li></ul>',
        BASE_URL,
      )
      expect(md).toContain('-   Item 1')
      expect(md).toContain('-   Item 2')
    })

    it('converts ordered lists', () => {
      const md = htmlToMarkdown(
        '<ol><li>First</li><li>Second</li></ol>',
        BASE_URL,
      )
      expect(md).toContain('1.  First')
      expect(md).toContain('2.  Second')
    })
  })

  describe('post-processing', () => {
    it('collapses excessive whitespace', () => {
      const md = htmlToMarkdown(
        '<p>Line 1</p><br><br><br><br><p>Line 2</p>',
        BASE_URL,
      )
      // Should not have more than 2 consecutive newlines
      expect(md).not.toMatch(/\n{3,}/)
    })

    it('trims leading and trailing whitespace', () => {
      const md = htmlToMarkdown('<p>Content</p>', BASE_URL)
      expect(md).not.toMatch(/^\s/)
      expect(md).not.toMatch(/\s$/)
    })
  })
})

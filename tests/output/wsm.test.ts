import { describe, it, expect } from 'vitest'
import { serializeWsm } from '../../src/output/wsm.js'
import type { PageData } from '../../src/types.js'

function makePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    metadata: {
      url: 'https://example.com',
      canonicalUrl: 'https://example.com/',
      title: 'Example Page',
      description: 'An example page for testing',
      type: 'article',
      lang: 'en',
      wordCount: 250,
      readingTimeMinutes: 1,
      interactiveElementCount: 3,
      fetchedAt: '2024-01-01T00:00:00Z',
      og: {
        title: 'Example OG Title',
        type: 'article',
        image: 'https://example.com/og.jpg',
        siteName: 'Example Site',
      },
    },
    content: {
      markdown: '# Hello World\n\nThis is a test page.',
      text: 'Hello World. This is a test page.',
    },
    media: [],
    interactiveElements: [],
    fetchStats: {
      method: 'static',
      durationMs: 150,
      estimatedTokens: 500,
      truncated: false,
    },
    ...overrides,
  }
}

describe('serializeWsm', () => {
  it('produces YAML frontmatter', () => {
    const output = serializeWsm(makePageData())
    expect(output).toContain('---')
    expect(output).toContain('url: https://example.com')
    expect(output).toContain('title: "Example Page"')
    expect(output).toContain('type: article')
    expect(output).toContain('lang: en')
    expect(output).toContain('word_count: 250')
  })

  it('includes markdown content', () => {
    const output = serializeWsm(makePageData())
    expect(output).toContain('# Hello World')
    expect(output).toContain('This is a test page.')
  })

  it('includes OG metadata', () => {
    const output = serializeWsm(makePageData())
    expect(output).toContain('og:')
    expect(output).toContain('title: "Example OG Title"')
    expect(output).toContain('site_name: "Example Site"')
  })

  it('includes media section when media present', () => {
    const output = serializeWsm(
      makePageData({
        media: [
          {
            type: 'image',
            src: 'https://example.com/photo.jpg',
            alt: 'A sunset',
            description: 'A sunset',
            descriptionSource: 'alt_text',
          },
          {
            type: 'video',
            src: 'https://youtube.com/watch?v=abc',
            title: 'My Video',
          },
        ],
      }),
    )
    expect(output).toContain('## Media')
    expect(output).toContain('[IMAGE: A sunset')
    expect(output).toContain('[VIDEO: "My Video"')
  })

  it('includes interactive elements section', () => {
    const output = serializeWsm(
      makePageData({
        interactiveElements: [
          { type: 'button', label: 'Submit' },
          { type: 'link', label: 'About', href: 'https://example.com/about' },
        ],
      }),
    )
    expect(output).toContain('## Interactive Elements')
    expect(output).toContain('### Buttons')
    expect(output).toContain('Submit')
    expect(output).toContain('### Links')
  })

  it('includes fetch stats footer', () => {
    const output = serializeWsm(makePageData())
    expect(output).toContain('Rawfy fetch stats')
    expect(output).toContain('Method: static')
    expect(output).toContain('Duration: 150ms')
  })

  it('limits links to 20', () => {
    const links = Array.from({ length: 30 }, (_, i) => ({
      type: 'link' as const,
      label: `Link ${i}`,
      href: `https://example.com/${i}`,
    }))
    const output = serializeWsm(makePageData({ interactiveElements: links }))
    expect(output).toContain('... and 10 more links')
  })
})

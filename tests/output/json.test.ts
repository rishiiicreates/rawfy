import { describe, it, expect } from 'vitest'
import { serializeJson } from '../../src/output/json.js'
import type { PageData } from '../../src/types.js'

function makePageData(overrides: Partial<PageData> = {}): PageData {
  return {
    metadata: {
      url: 'https://example.com',
      title: 'Test Page',
      type: 'article',
      wordCount: 100,
      readingTimeMinutes: 1,
      interactiveElementCount: 0,
      fetchedAt: '2024-01-01T00:00:00Z',
    },
    content: {
      markdown: '# Test\n\nContent here.',
      text: 'Test. Content here.',
    },
    media: [],
    interactiveElements: [],
    fetchStats: {
      method: 'static',
      durationMs: 100,
      estimatedTokens: 50,
      truncated: false,
    },
    ...overrides,
  }
}

describe('serializeJson', () => {
  it('produces valid JSON', () => {
    const output = serializeJson(makePageData())
    expect(() => JSON.parse(output)).not.toThrow()
  })

  it('has correct top-level structure', () => {
    const parsed = JSON.parse(serializeJson(makePageData()))
    expect(parsed).toHaveProperty('metadata')
    expect(parsed).toHaveProperty('content')
    expect(parsed).toHaveProperty('media')
    expect(parsed).toHaveProperty('interactive_elements')
    expect(parsed).toHaveProperty('fetch_stats')
  })

  it('uses snake_case keys', () => {
    const parsed = JSON.parse(serializeJson(makePageData()))
    expect(parsed.metadata).toHaveProperty('word_count')
    expect(parsed.metadata).toHaveProperty('reading_time_minutes')
    expect(parsed.metadata).toHaveProperty('fetched_at')
    expect(parsed.fetch_stats).toHaveProperty('duration_ms')
    expect(parsed.fetch_stats).toHaveProperty('estimated_tokens')
  })

  it('maps media items correctly', () => {
    const data = makePageData({
      media: [
        {
          type: 'image',
          src: 'https://example.com/img.jpg',
          alt: 'Photo',
          description: 'Photo',
          descriptionSource: 'alt_text',
        },
        {
          type: 'pdf',
          src: 'https://example.com/doc.pdf',
          title: 'Report',
          pageCount: 10,
        },
      ],
    })
    const parsed = JSON.parse(serializeJson(data))
    expect(parsed.media).toHaveLength(2)
    expect(parsed.media[0].type).toBe('image')
    expect(parsed.media[0].description_source).toBe('alt_text')
    expect(parsed.media[1].type).toBe('pdf')
    expect(parsed.media[1].page_count).toBe(10)
  })

  it('uses null for missing optional fields', () => {
    const parsed = JSON.parse(serializeJson(makePageData()))
    expect(parsed.metadata.canonical_url).toBeNull()
    expect(parsed.metadata.description).toBeNull()
    expect(parsed.metadata.og).toBeNull()
  })

  it('maps interactive elements', () => {
    const data = makePageData({
      interactiveElements: [
        { type: 'button', label: 'Click Me' },
        { type: 'link', label: 'About', href: '/about' },
      ],
    })
    const parsed = JSON.parse(serializeJson(data))
    expect(parsed.interactive_elements).toHaveLength(2)
    expect(parsed.interactive_elements[0].type).toBe('button')
    expect(parsed.interactive_elements[1].href).toBe('/about')
  })
})

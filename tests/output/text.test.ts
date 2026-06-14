import { describe, it, expect } from 'vitest'
import { serializeText } from '../../src/output/text.js'
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
      markdown:
        '# Main Heading\n\nSome **bold** and *italic* text.\n\n## Sub Heading\n\n[Link text](https://example.com/page)',
      text: 'Main Heading. Some bold and italic text.',
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

describe('serializeText', () => {
  it('converts headings to UPPERCASE', () => {
    const output = serializeText(makePageData())
    expect(output).toContain('MAIN HEADING')
    expect(output).toContain('SUB HEADING')
  })

  it('strips bold and italic formatting', () => {
    const output = serializeText(makePageData())
    expect(output).toContain('bold')
    expect(output).toContain('italic')
    expect(output).not.toContain('**')
    expect(output).not.toMatch(/(?<!\w)\*(?!\*)/)
  })

  it('converts links to text (url) format', () => {
    const output = serializeText(makePageData())
    expect(output).toContain('Link text (https://example.com/page)')
  })

  it('includes title as uppercase header', () => {
    const output = serializeText(makePageData())
    expect(output).toContain('TEST PAGE')
    expect(output).toContain('Source: https://example.com')
  })

  it('strips media placeholders', () => {
    const data = makePageData({
      content: {
        markdown:
          'Some text\n[IMAGE: A photo | src: /img.jpg]\n[VIDEO: "Title"]\nMore text',
        text: 'Some text. More text.',
      },
    })
    const output = serializeText(data)
    expect(output).not.toContain('[IMAGE:')
    expect(output).not.toContain('[VIDEO')
    expect(output).toContain('Some text')
    expect(output).toContain('More text')
  })

  it('converts list items to bullet points', () => {
    const data = makePageData({
      content: {
        markdown: '- Item 1\n- Item 2\n1. First\n2. Second',
        text: 'Item 1. Item 2.',
      },
    })
    const output = serializeText(data)
    expect(output).toContain('• Item 1')
    expect(output).toContain('• Item 2')
  })
})

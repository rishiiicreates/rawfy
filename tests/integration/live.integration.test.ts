import { describe, it, expect } from 'vitest'
import { rawfyFetch, rawfyMetadata } from '../../src/pipeline'

// These tests hit live websites and might be flaky if the sites change or are down.
// They are excluded from regular unit test runs and only run via `npm run test:integration`.

describe('Live Integration Tests', () => {
  it('fetches a Wikipedia article', async () => {
    // Wikipedia is very stable and static
    const url = 'https://en.wikipedia.org/wiki/Web_scraping'
    const result = await rawfyFetch(url, { format: 'json', noPlaywright: true, maxTokens: 500000 })
    const data = JSON.parse(result)

    expect(data.metadata.title).toContain('Web scraping')
    expect(data.metadata.type).toBe('article')
    expect(data.content.markdown).toContain('Data extraction')
    expect(data.media).toBeInstanceOf(Array)
  })

  it('fetches YouTube metadata (no playwright)', async () => {
    // YouTube video page
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const meta = await rawfyMetadata(url, { noPlaywright: true })

    expect(meta.title).toContain('Rick Astley')
    expect(meta.type).toBe('video')
  })

  it('fetches a JS-rendered SPA (React)', async () => {
    // React docs is a good target for SPA test if Playwright is installed
    const url = 'https://react.dev/'
    const result = await rawfyFetch(url, { format: 'json' }) // Playwright allowed
    const data = JSON.parse(result)

    expect(data.metadata.title).toContain('React')
    expect(data.content.markdown).toContain('library for web and native user interfaces')
  })

  it('fetches a documentation page', async () => {
    // Playwright docs
    const url = 'https://playwright.dev/docs/intro'
    const result = await rawfyFetch(url, { format: 'json', noPlaywright: true })
    const data = JSON.parse(result)

    expect(data.metadata.title).toContain('Playwright')
    expect(data.metadata.type).toBe('docs')
    expect(data.content.markdown).toContain('Installing Playwright')
  })
})

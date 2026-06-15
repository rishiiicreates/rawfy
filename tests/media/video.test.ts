import { describe, it, expect, vi, afterEach } from 'vitest'
import { extractVideos, formatVideo } from '../../src/media/video.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractVideos', () => {
  const BASE = 'https://example.com'

  describe('YouTube embeds', () => {
    it('extracts YouTube video from iframe', async () => {
      // Mock fetch to avoid real network calls
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network disabled')),
      )

      const html = `
        <html><body>
          <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
        </body></html>
      `
      const results = await extractVideos(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toContain('youtube.com')
      expect(results[0]!.src).toContain('dQw4w9WgXcQ')
      expect(results[0]!.thumbnailUrl).toContain('dQw4w9WgXcQ')
    })

    it('extracts YouTube video from nocookie embed', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network disabled')),
      )

      const html = `
        <html><body>
          <iframe src="https://www.youtube-nocookie.com/embed/abcdef12345"></iframe>
        </body></html>
      `
      const results = await extractVideos(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toContain('abcdef12345')
    })

    it('detects YouTube video from page URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('network disabled')),
      )

      const html = '<html><body><p>Video page</p></body></html>'
      const results = await extractVideos(
        html,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      )

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toContain('dQw4w9WgXcQ')
    })

    it('extracts YouTube transcript from player config caption tracks', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: vi.fn().mockResolvedValue('<transcript><text>Hello from captions</text></transcript>'),
        }),
      )

      const html = '<html><body><p>No iframe needed</p></body></html>'
      const results = await extractVideos(
        html,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [],
        {
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{ languageCode: 'en', baseUrl: 'https://example.com/captions.xml' }],
            },
          },
        },
      )

      expect(results).toHaveLength(1)
      expect(results[0]!.transcript).toContain('Hello from captions')
    })
  })

  describe('Vimeo embeds', () => {
    it('extracts Vimeo video from iframe', async () => {
      const html = `
        <html><body>
          <iframe src="https://player.vimeo.com/video/123456789" title="My Vimeo Video"></iframe>
        </body></html>
      `
      const results = await extractVideos(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://vimeo.com/123456789')
      expect(results[0]!.title).toBe('My Vimeo Video')
    })
  })

  describe('native <video> elements', () => {
    it('extracts native video with src', async () => {
      const html = `
        <html><body>
          <video src="/video.mp4" poster="/thumb.jpg" title="Demo Video"></video>
        </body></html>
      `
      const results = await extractVideos(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://example.com/video.mp4')
      expect(results[0]!.thumbnailUrl).toBe('/thumb.jpg')
      expect(results[0]!.title).toBe('Demo Video')
    })

    it('extracts native video with <source> child', async () => {
      const html = `
        <html><body>
          <video>
            <source src="/clip.webm" type="video/webm">
          </video>
        </body></html>
      `
      const results = await extractVideos(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://example.com/clip.webm')
    })

    it('attaches Playwright caption tracks as transcript', async () => {
      const html = `
        <html><body>
          <video src="/video.mp4"></video>
        </body></html>
      `
      const captionTracks = [
        { lang: 'en', text: 'Hello world, this is a transcript.' },
      ]

      const results = await extractVideos(html, BASE, captionTracks)

      expect(results).toHaveLength(1)
      expect(results[0]!.transcript).toContain('Hello world')
    })
  })

  describe('edge cases', () => {
    it('returns empty array for pages with no videos', async () => {
      const html = '<html><body><p>No videos here</p></body></html>'
      const results = await extractVideos(html, BASE)
      expect(results).toEqual([])
    })
  })
})

describe('formatVideo', () => {
  it('formats video with title and transcript', () => {
    const result = formatVideo({
      type: 'video',
      src: 'https://youtube.com/watch?v=abc',
      title: 'My Video',
      transcript: 'Hello, this is a test.',
    })
    expect(result).toContain('VIDEO')
    expect(result).toContain('"My Video"')
    expect(result).toContain('transcript: Hello')
  })

  it('formats video without transcript', () => {
    const result = formatVideo({
      type: 'video',
      src: 'https://example.com/v.mp4',
    })
    expect(result).toContain('transcript: unavailable')
  })

  it('truncates long transcripts', () => {
    const result = formatVideo({
      type: 'video',
      src: 'https://example.com/v.mp4',
      transcript: 'word '.repeat(200),
    })
    expect(result.length).toBeLessThan(600)
    expect(result).toContain('...')
  })

  it('formats duration', () => {
    const result = formatVideo({
      type: 'video',
      src: 'https://example.com/v.mp4',
      durationSeconds: 3661,
    })
    expect(result).toContain('1:01:01')
  })
})

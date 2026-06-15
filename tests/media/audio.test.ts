import { describe, it, expect } from 'vitest'
import { extractAudio, formatAudio } from '../../src/media/audio.js'

describe('extractAudio', () => {
  const BASE = 'https://example.com'

  describe('basic extraction', () => {
    it('extracts audio element with src', () => {
      const html = `
        <html><body>
          <audio src="/podcast.mp3" title="Episode 42"></audio>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://example.com/podcast.mp3')
      expect(results[0]!.title).toBe('Episode 42')
    })

    it('extracts audio with <source> child', () => {
      const html = `
        <html><body>
          <audio>
            <source src="/music.ogg" type="audio/ogg">
          </audio>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://example.com/music.ogg')
    })

    it('uses aria-label as title', () => {
      const html = `
        <html><body>
          <audio src="/clip.mp3" aria-label="Interview with Dr. Smith"></audio>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results[0]!.title).toBe('Interview with Dr. Smith')
    })
  })

  describe('nearby heading detection', () => {
    it('finds heading in parent container', () => {
      const html = `
        <html><body>
          <div class="episode">
            <h3>Episode 42: The Answer</h3>
            <audio src="/ep42.mp3"></audio>
          </div>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results[0]!.title).toBe('Episode 42: The Answer')
    })
  })

  describe('transcript link detection', () => {
    it('finds transcript link near audio element', () => {
      const html = `
        <html><body>
          <div>
            <audio src="/podcast.mp3" title="My Podcast"></audio>
            <a href="/transcripts/ep42.txt">View Transcript</a>
          </div>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results[0]!.transcript).toBe(
        'https://example.com/transcripts/ep42.txt',
      )
    })

    it('finds transcript link by href', () => {
      const html = `
        <html><body>
          <div>
            <audio src="/podcast.mp3"></audio>
            <a href="/transcript/ep42">Full text</a>
          </div>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results[0]!.transcript).toContain('transcript')
    })

    it('returns undefined when no transcript found', () => {
      const html = `
        <html><body>
          <audio src="/music.mp3" title="Song"></audio>
        </body></html>
      `
      const results = extractAudio(html, BASE)

      expect(results[0]!.transcript).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('returns empty array for pages with no audio', () => {
      const html = '<html><body><p>No audio</p></body></html>'
      const results = extractAudio(html, BASE)
      expect(results).toEqual([])
    })

    it('extracts multiple audio elements', () => {
      const html = `
        <html><body>
          <audio src="/track1.mp3" title="Track 1"></audio>
          <audio src="/track2.mp3" title="Track 2"></audio>
        </body></html>
      `
      const results = extractAudio(html, BASE)
      expect(results).toHaveLength(2)
    })
  })
})

describe('formatAudio', () => {
  it('formats audio with title and transcript', () => {
    const result = formatAudio({
      type: 'audio',
      src: 'https://example.com/podcast.mp3',
      title: 'Episode 42',
      transcript: 'https://example.com/transcript.txt',
    })
    expect(result).toContain('AUDIO')
    expect(result).toContain('"Episode 42"')
    expect(result).toContain('transcript:')
  })

  it('formats audio without transcript', () => {
    const result = formatAudio({
      type: 'audio',
      src: 'https://example.com/music.mp3',
    })
    expect(result).toContain('transcript: unavailable')
  })

  it('formats duration', () => {
    const result = formatAudio({
      type: 'audio',
      src: 'https://example.com/long.mp3',
      durationSeconds: 125,
    })
    expect(result).toContain('2:05')
  })
})

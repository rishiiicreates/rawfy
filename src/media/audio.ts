/**
 * Rawfy — Audio media handler
 *
 * Extracts audio element information from HTML:
 * - <audio> elements with src/source
 * - Metadata: title, duration
 * - Looks for transcript links nearby in the DOM
 *
 * Audio transcription via Whisper is noted as a future opt-in feature
 * but not implemented in the core pipeline.
 */

import { JSDOM } from 'jsdom'
import type { AudioResult } from '../types.js'

/**
 * Extract audio information from HTML.
 *
 * @param html - Raw HTML string
 * @param url - Page URL for resolving relative paths
 * @returns Array of AudioResult objects
 */
export function extractAudio(html: string, url: string): AudioResult[] {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document
  const audioElements = doc.querySelectorAll('audio')
  const results: AudioResult[] = []

  for (const audio of audioElements) {
    const audioSrc =
      audio.getAttribute('src') || audio.querySelector('source')?.getAttribute('src') || undefined

    const resolvedSrc = audioSrc ? resolveUrl(audioSrc, url) : undefined

    // Extract title from various sources
    const title =
      audio.getAttribute('title') ||
      audio.getAttribute('aria-label') ||
      findNearbyHeading(audio) ||
      undefined

    // Look for transcript link nearby
    const transcript = findTranscriptLink(audio, url) || undefined

    results.push({
      type: 'audio',
      src: resolvedSrc,
      title,
      transcript,
    })
  }

  return results
}

/**
 * Format an AudioResult into the WSM placeholder format.
 */
export function formatAudio(audio: AudioResult): string {
  const parts: string[] = ['AUDIO']
  if (audio.title) parts.push(`"${audio.title}"`)
  if (audio.durationSeconds) {
    parts.push(formatDuration(audio.durationSeconds))
  }
  if (audio.src) parts.push(`src: ${audio.src}`)
  if (audio.transcript) {
    parts.push(`transcript: ${audio.transcript}`)
  } else {
    parts.push('transcript: unavailable')
  }
  return `[${parts.join(' | ')}]`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a nearby heading element for the audio player.
 * Walks up the DOM to find a parent that contains a heading.
 */
function findNearbyHeading(audio: Element): string | null {
  // Check immediate parent and grandparent for headings
  let parent = audio.parentElement
  for (let i = 0; i < 3 && parent; i++) {
    const heading = parent.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim()
    }
    parent = parent.parentElement
  }
  return null
}

/**
 * Look for a transcript link near the audio element.
 *
 * Searches for links with text containing "transcript" within
 * the audio element's parent container.
 */
function findTranscriptLink(audio: Element, baseUrl: string): string | null {
  // Check parent container (up to 3 levels)
  let parent = audio.parentElement
  for (let i = 0; i < 3 && parent; i++) {
    const links = parent.querySelectorAll('a[href]')
    for (const link of links) {
      const text = link.textContent?.toLowerCase() || ''
      const href = link.getAttribute('href') || ''

      if (text.includes('transcript') || href.toLowerCase().includes('transcript')) {
        return resolveUrl(href, baseUrl)
      }
    }
    parent = parent.parentElement
  }
  return null
}

/**
 * Format seconds into human-readable duration.
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(rawUrl: string, baseUrl: string): string {
  try {
    return new URL(rawUrl, baseUrl).href
  } catch {
    return rawUrl
  }
}

/**
 * Rawfy — Video media handler
 *
 * Extracts video information from HTML:
 * - YouTube embeds: extract video ID, build metadata URL
 * - Vimeo embeds: extract video ID
 * - Native <video> elements: src, poster, duration
 * - Native caption tracks from Playwright-extracted data
 *
 * YouTube transcript fetching uses the public timedtext API
 * (no API key required for auto-generated captions).
 */

import { JSDOM } from 'jsdom'
import { YoutubeTranscript } from 'youtube-transcript'
import type {
  VideoResult,
  VideoCaptionTrack,
  YouTubeCaptionTrack,
  YouTubePlayerConfig,
} from '../types.js'

/**
 * Extract video information from HTML.
 *
 * @param html - Raw HTML string
 * @param url - Page URL for resolving relative paths
 * @param captionTracks - Pre-extracted caption tracks from Playwright (if available)
 * @returns Array of VideoResult objects
 */
export async function extractVideos(
  html: string,
  url: string,
  captionTracks: VideoCaptionTrack[] = [],
  playerConfig?: YouTubePlayerConfig,
): Promise<VideoResult[]> {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document
  const results: VideoResult[] = []

  // Extract YouTube embeds
  const youtubeIframes = doc.querySelectorAll(
    'iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"], iframe[data-src*="youtube.com"]',
  )
  for (const iframe of youtubeIframes) {
    const src = iframe.getAttribute('src') || iframe.getAttribute('data-src') || ''
    const videoId = extractYouTubeId(src)
    if (videoId) {
      const video = await buildYouTubeResult(videoId, playerConfig)
      results.push(video)
    }
  }

  // Check if the page URL itself is a YouTube video
  const pageVideoId = extractYouTubeId(url)
  if (pageVideoId && !results.some((r) => r.src?.includes(pageVideoId))) {
    const video = await buildYouTubeResult(pageVideoId, playerConfig)
    results.push(video)
  }

  // Extract Vimeo embeds
  const vimeoIframes = doc.querySelectorAll('iframe[src*="player.vimeo.com"]')
  for (const iframe of vimeoIframes) {
    const src = iframe.getAttribute('src') || ''
    const vimeoId = extractVimeoId(src)
    if (vimeoId) {
      results.push({
        type: 'video',
        src: `https://vimeo.com/${vimeoId}`,
        title: iframe.getAttribute('title') || undefined,
      })
    }
  }

  // Extract native <video> elements
  const videoElements = doc.querySelectorAll('video')
  for (const video of videoElements) {
    const videoSrc =
      video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || undefined

    const resolvedSrc = videoSrc ? resolveUrl(videoSrc, url) : undefined

    // Check for <track> captions in the DOM
    const tracks = video.querySelectorAll('track[kind="captions"], track[kind="subtitles"]')
    let transcript: string | undefined

    if (tracks.length > 0) {
      // We found caption tracks in the HTML, but can't read their content
      // from static HTML alone — the actual text comes from Playwright
      transcript = undefined
    }

    results.push({
      type: 'video',
      src: resolvedSrc,
      title: video.getAttribute('title') || video.getAttribute('aria-label') || undefined,
      thumbnailUrl: video.getAttribute('poster') || undefined,
    })

    // If we have Playwright-extracted caption data, attach transcript
    if (captionTracks.length > 0 && transcript === undefined) {
      const lastResult = results[results.length - 1]!
      lastResult.transcript = captionTracks.map((t) => t.text).join(' ')
    }
  }

  return results
}

/**
 * Format a VideoResult into the WSM placeholder format.
 */
export function formatVideo(video: VideoResult): string {
  const parts: string[] = ['VIDEO']
  if (video.title) parts.push(`"${video.title}"`)
  if (video.durationSeconds) {
    parts.push(formatDuration(video.durationSeconds))
  }
  if (video.src) parts.push(`src: ${video.src}`)
  if (video.transcript) {
    // Truncate very long transcripts
    const truncated =
      video.transcript.length > 500 ? video.transcript.slice(0, 497) + '...' : video.transcript
    parts.push(`transcript: ${truncated}`)
  } else {
    parts.push('transcript: unavailable')
  }
  return `[${parts.join(' | ')}]`
}

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * Build a VideoResult for a YouTube video.
 * Attempts to fetch the auto-generated transcript.
 */
async function buildYouTubeResult(
  videoId: string,
  playerConfig?: YouTubePlayerConfig,
): Promise<VideoResult> {
  const result: VideoResult = {
    type: 'video',
    src: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }

  // Try to fetch video title from oEmbed (no API key needed)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      const data = (await response.json()) as { title?: string }
      if (data.title) result.title = data.title
    }
  } catch {
    // oEmbed fetch failed — not critical
  }

  // Try to fetch auto-generated captions
  try {
    let transcript: string | null = null
    if (playerConfig) {
      transcript = await extractTranscriptFromConfig(playerConfig)
    }
    if (!transcript) {
      transcript = await fetchYouTubeTranscript(videoId)
    }
    if (transcript) result.transcript = transcript
  } catch {
    // Transcript fetch failed — not critical
  }

  return result
}

/**
 * Attempt to fetch YouTube auto-generated transcript.
 *
 * Uses the YouTube timedtext API which works for many videos
 * without an API key.
 */
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId)
    if (!transcript || transcript.length === 0) return null

    const text = transcript
      .map((t) => t.text.replace(/\n/g, ' ').trim())
      .filter((t) => t.length > 0)
      .join(' ')

    return text.length > 10 ? text : null
  } catch {
    return null
  }
}

/**
 * Extract YouTube transcript directly from the player config object.
 */
async function extractTranscriptFromConfig(
  playerConfig: YouTubePlayerConfig,
): Promise<string | null> {
  try {
    const captionTracks = playerConfig?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!captionTracks || captionTracks.length === 0) return null

    // Find the English track or just use the first one
    const track: YouTubeCaptionTrack | undefined =
      captionTracks.find((t) => t.languageCode === 'en') || captionTracks[0]
    if (!track?.baseUrl) return null

    const captionResponse = await fetch(track.baseUrl, {
      signal: AbortSignal.timeout(5000),
    })

    if (!captionResponse.ok) return null
    const captionXml = await captionResponse.text()

    // Parse caption XML and extract text
    const textSegments = captionXml.match(/<text[^>]*>(.*?)<\/text>/gs)
    if (!textSegments || textSegments.length === 0) return null

    const text = textSegments
      .map((segment) => {
        return segment
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n/g, ' ')
          .trim()
      })
      .filter((s) => s.length > 0)
      .join(' ')

    return text.length > 10 ? text : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Vimeo helpers
// ---------------------------------------------------------------------------

/**
 * Extract Vimeo video ID from embed URL.
 */
function extractVimeoId(url: string): string | null {
  const match = url.match(/player\.vimeo\.com\/video\/(\d+)/)
  return match?.[1] || null
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

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

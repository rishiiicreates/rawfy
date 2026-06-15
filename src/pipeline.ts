/**
 * Rawfy — Core pipeline orchestrator
 *
 * Ties together all pipeline stages:
 *   1. Fetch (static or Playwright)
 *   2. Extract (Readability, metadata, interactive elements)
 *   3. Convert (HTML → Markdown)
 *   4. Media (images, video, audio, PDF)
 *   5. Truncate & Serialize (WSM, JSON, or text)
 *
 * This is the single entry point for the entire Rawfy pipeline.
 */

import type {
  RawfyOptions,
  PageData,
  MediaResult,
  OutputFormat,
} from './types.js'
import { fetchPage } from './fetcher/index.js'
import { extractReadability } from './extractor/readability.js'
import { extractMetadata } from './extractor/metadata.js'
import { extractInteractiveElements } from './extractor/interactive.js'
import { htmlToMarkdown } from './extractor/html-to-md.js'
import { extractImages } from './media/image.js'
import { extractVideos } from './media/video.js'
import { extractAudio } from './media/audio.js'
import { extractPdfs } from './media/pdf.js'
import { estimateTokens, truncate } from './utils/truncate.js'
import { serializeWsm } from './output/wsm.js'
import { serializeJson } from './output/json.js'
import { serializeText } from './output/text.js'
import { JSDOM } from 'jsdom'

/** Default maximum output tokens */
const DEFAULT_MAX_TOKENS = 50_000

/**
 * Run the full Rawfy pipeline on a URL.
 *
 * @param url - The URL to fetch and process
 * @param options - Pipeline options (format, vision, maxTokens, etc.)
 * @param progress - Optional progress callback for CLI feedback
 * @returns Formatted output string (WSM markdown, JSON, or plain text)
 */
export async function rawfyFetch(
  url: string,
  options: RawfyOptions = {},
  progress?: (message: string) => void,
): Promise<string> {
  const format: OutputFormat = options.format || 'markdown'
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS
  const log = progress || (() => {})

  // -----------------------------------------------------------------------
  // Stage 1: Fetch
  // -----------------------------------------------------------------------
  log('fetching page...')
  const fetchResult = await fetchPage(url, {
    noPlaywright: options.noPlaywright,
    timeoutMs: 15_000,
    onProgress: log,
  })

  // -----------------------------------------------------------------------
  // Stage 2: Extract content
  // -----------------------------------------------------------------------
  log('extracting content...')
  const readability = extractReadability(fetchResult.html, fetchResult.finalUrl)
  const interactiveElements = extractInteractiveElements(
    fetchResult.html,
    fetchResult.finalUrl,
  )

  // Get plain text for word count (strip HTML tags from readability content)
  const dom = new JSDOM(readability.content)
  const bodyText = (dom.window.document.body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()

  const metadata = extractMetadata(
    fetchResult.html,
    fetchResult.finalUrl,
    fetchResult.headers,
    bodyText,
    interactiveElements.length,
  )

  // -----------------------------------------------------------------------
  // Stage 3: Convert to Markdown
  // -----------------------------------------------------------------------
  log('converting to markdown...')
  const markdown = htmlToMarkdown(readability.content, fetchResult.finalUrl)
  const plainText = bodyText

  // -----------------------------------------------------------------------
  // Stage 4: Media extraction
  // -----------------------------------------------------------------------
  log('extracting media...')
  const media: MediaResult[] = []

  try {
    const images = await extractImages(fetchResult.html, fetchResult.finalUrl, {
      vision: options.vision,
      anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    })
    media.push(...images)
  } catch {
    // Ignore image extraction failure
  }

  try {
    const videos = await extractVideos(
      fetchResult.html,
      fetchResult.finalUrl,
      fetchResult.videoCaptions,
    )
    media.push(...videos)
  } catch {
    // Ignore video extraction failure
  }

  try {
    const audio = extractAudio(fetchResult.html, fetchResult.finalUrl)
    media.push(...audio)
  } catch {
    // Ignore audio extraction failure
  }

  try {
    const pdfs = await extractPdfs(fetchResult.html, fetchResult.finalUrl)
    media.push(...pdfs)
  } catch {
    // Ignore pdf extraction failure
  }

  // -----------------------------------------------------------------------
  // Stage 5: Build PageData
  // -----------------------------------------------------------------------
  const estimatedTokenCount = estimateTokens(markdown)

  const pageData: PageData = {
    metadata,
    content: {
      markdown,
      text: plainText,
    },
    media,
    interactiveElements,
    fetchStats: {
      method: fetchResult.method,
      durationMs: fetchResult.durationMs,
      estimatedTokens: estimatedTokenCount,
      truncated: false,
    },
  }

  // -----------------------------------------------------------------------
  // Stage 6: Serialize to requested format
  // -----------------------------------------------------------------------
  log('serializing output...')
  let output: string

  switch (format) {
    case 'json':
      output = serializeJson(pageData)
      break
    case 'text':
      output = serializeText(pageData)
      break
    case 'markdown':
    default:
      output = serializeWsm(pageData)
      break
  }

  // -----------------------------------------------------------------------
  // Stage 7: Truncate if needed
  // -----------------------------------------------------------------------
  const { text: finalOutput, truncated } = truncate(output, maxTokens)
  if (truncated) {
    pageData.fetchStats.truncated = true
  }

  log('done')
  return finalOutput
}

/**
 * Fetch only metadata for a URL (lightweight — no media extraction).
 *
 * @param url - The URL to fetch
 * @returns PageMetadata object
 */
export async function rawfyMetadata(
  url: string,
  options: Pick<RawfyOptions, 'noPlaywright'> = {},
) {
  const fetchResult = await fetchPage(url, {
    noPlaywright: options.noPlaywright,
    timeoutMs: 15_000,
  })

  const readability = extractReadability(fetchResult.html, fetchResult.finalUrl)
  const dom = new JSDOM(readability.content)
  const bodyText = (dom.window.document.body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()

  return extractMetadata(
    fetchResult.html,
    fetchResult.finalUrl,
    fetchResult.headers,
    bodyText,
    0,
  )
}

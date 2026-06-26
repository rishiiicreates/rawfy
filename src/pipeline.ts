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
): Promise<PageData> {
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS
  const log = progress || (() => {})

  // -----------------------------------------------------------------------
  // Stage 1: Fetch
  // -----------------------------------------------------------------------
  log('fetching page...')
  let fetchResult = await fetchPage(url, {
    noPlaywright: options.noPlaywright,
    timeoutMs: options.timeoutMs || 15_000,
    forcePlaywright: options.forcePlaywright,
    onProgress: log,
  })

  // SPA Hydration Wall Heuristic
  if (!options.noPlaywright && !options.forcePlaywright && fetchResult.method === 'static') {
    const tempReadability = extractReadability(fetchResult.html, fetchResult.finalUrl)
    const { JSDOM } = await import('jsdom')
    const tempDom = new JSDOM(tempReadability.content)
    const tempText = (tempDom.window.document.body.textContent || '').replace(/\s+/g, '').trim()
    
    // If the extracted text is suspiciously short but there are scripts, it's likely a hydration wall
    const scriptCount = (fetchResult.html.match(/<script/gi) || []).length
    if (tempText.length < 150 && scriptCount > 0) {
      log('detected SPA hydration wall, falling back to playwright...')
      fetchResult = await fetchPage(url, {
        noPlaywright: false,
        timeoutMs: options.timeoutMs || 15_000,
        forcePlaywright: true,
        onProgress: log,
      })
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Links only mode
  // -----------------------------------------------------------------------
  if (options.linksOnly) {
    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM(fetchResult.html)
    const links = Array.from(dom.window.document.querySelectorAll('a')).map(a => a.href).filter(Boolean)
    
    return {
      metadata: extractMetadata(fetchResult.html, fetchResult.finalUrl, fetchResult.headers, '', 0),
      content: {
        markdown: links.join('\n'),
        text: links.join('\n'),
        html: fetchResult.html
      },
      media: [],
      interactiveElements: [],
      fetchStats: {
        method: fetchResult.method,
        durationMs: fetchResult.durationMs,
        estimatedTokens: 0,
        truncated: false
      }
    }
  }
  // Stage 2: Extract content
  // -----------------------------------------------------------------------
  log('extracting content...')
  const readability = extractReadability(fetchResult.html, fetchResult.finalUrl)
  const interactiveElements = extractInteractiveElements(
    fetchResult.html,
    fetchResult.finalUrl,
  )

  // Get plain text for word count (strip HTML tags from readability content)
  const { JSDOM } = await import('jsdom')
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
      fetchResult.playerConfig,
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
      html: fetchResult.html,
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
  // Stage 6: Truncate if needed
  // -----------------------------------------------------------------------
  const { text: finalMarkdown, truncated } = truncate(markdown, maxTokens)
  if (truncated) {
    pageData.fetchStats.truncated = true
    pageData.content.markdown = finalMarkdown
  }

  log('done')
  return pageData
}

/**
 * Fetch only metadata for a URL (lightweight — no media extraction).
 *
 * @param url - The URL to fetch
 * @returns PageMetadata object
 */
export async function rawfyMetadata(
  url: string,
  options: Pick<RawfyOptions, 'noPlaywright' | 'timeoutMs'> = {},
) {
  const fetchResult = await fetchPage(url, {
    noPlaywright: options.noPlaywright,
    timeoutMs: options.timeoutMs || 15_000,
  })

  const readability = extractReadability(fetchResult.html, fetchResult.finalUrl)
  const { JSDOM } = await import('jsdom')
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

/**
 * Run the full Rawfy pipeline on multiple URLs in parallel.
 *
 * @param urls - Array of URLs to fetch
 * @param options - Pipeline options
 * @param progress - Optional progress callback
 * @returns Array of formatted output strings
 */
export async function rawfyBatch(
  urls: string[],
  options: RawfyOptions = {},
  progress?: (message: string) => void,
): Promise<any[]> {
  return Promise.all(urls.map((url) => rawfyFetch(url, options, progress)))
}

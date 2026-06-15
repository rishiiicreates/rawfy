/**
 * Rawfy — Image media handler
 *
 * Priority-tiered image description extraction:
 *   1. Alt text (free, instant)
 *   2. Figcaption/title (free, instant)
 *   3. OCR via tesseract.js (opt-in, local)
 *   4. Vision API via Anthropic (opt-in, requires API key)
 *
 * Implements the MediaHandler interface from workflow.md.
 */

import { JSDOM } from 'jsdom'
import type { ImageResult } from '../types.js'

/** Options for image extraction */
export interface ImageExtractOptions {
  /** Enable OCR for images missing alt text */
  ocr?: boolean
  /** Enable vision API for images missing alt text */
  vision?: boolean
  /** Anthropic API key (required when vision=true) */
  anthropicApiKey?: string
}

/**
 * Extract image information from HTML.
 *
 * Finds all <img> elements and builds structured ImageResult objects
 * using the priority chain: alt → figcaption → title → OCR → vision.
 *
 * @param html - Raw HTML string
 * @param url - Page URL for resolving relative src paths
 * @param options - Optional OCR/vision configuration
 * @returns Array of ImageResult objects
 */
export async function extractImages(
  html: string,
  url: string,
  options: ImageExtractOptions = {},
): Promise<ImageResult[]> {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document
  const images = doc.querySelectorAll('img')
  const results: ImageResult[] = []

  for (const img of images) {
    const rawSrc =
      img.getAttribute('src') ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      ''

    if (!rawSrc) continue

    // Resolve relative URL
    let src: string
    try {
      src = new URL(rawSrc, url).href
    } catch {
      src = rawSrc
    }

    // Skip tiny tracking pixels and spacer images
    const width = parseInt(img.getAttribute('width') || '0', 10)
    const height = parseInt(img.getAttribute('height') || '0', 10)
    if ((width > 0 && width < 3) || (height > 0 && height < 3)) continue

    // Priority 1: alt text
    const alt = img.getAttribute('alt')?.trim()
    if (alt && alt.length > 0 && !isPlaceholderAlt(alt)) {
      results.push({
        type: 'image',
        src,
        alt,
        description: alt,
        descriptionSource: 'alt_text',
      })
      continue
    }

    // Priority 2: figcaption or title
    const figcaption = getFigcaption(img)
    const title = img.getAttribute('title')?.trim()
    const contextDescription = figcaption || title

    if (contextDescription) {
      results.push({
        type: 'image',
        src,
        alt: alt || undefined,
        description: contextDescription,
        descriptionSource: 'figcaption',
      })
      continue
    }

    // Priority 3: OCR (opt-in)
    if (options.ocr) {
      const ocrText = await runOcr(src)
      if (ocrText) {
        results.push({
          type: 'image',
          src,
          alt: alt || undefined,
          description: ocrText,
          descriptionSource: 'ocr',
        })
        continue
      }
    }

    // Priority 4: Vision API (opt-in)
    if (options.vision && options.anthropicApiKey) {
      const visionText = await runVision(src, options.anthropicApiKey)
      if (visionText) {
        results.push({
          type: 'image',
          src,
          alt: alt || undefined,
          description: visionText,
          descriptionSource: 'vision_api',
        })
        continue
      }
    }

    // Fallback: image with no description
    results.push({
      type: 'image',
      src,
      alt: alt || undefined,
    })
  }

  return results
}

/**
 * Format an ImageResult into the WSM placeholder format.
 */
export function formatImage(image: ImageResult): string {
  const desc = image.description || image.alt || 'no description'
  const parts = [`IMAGE: ${desc}`]
  if (image.src) parts.push(`src: ${image.src}`)
  if (image.descriptionSource && image.descriptionSource !== 'alt_text') {
    parts.push(`via: ${image.descriptionSource}`)
  }
  return `[${parts.join(' | ')}]`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if an alt text is a placeholder (e.g. "image", "photo", "logo").
 */
function isPlaceholderAlt(alt: string): boolean {
  const placeholders = [
    'image',
    'photo',
    'picture',
    'img',
    'icon',
    'logo',
    'thumbnail',
    'placeholder',
    'untitled',
    ' ',
    'decorative',
  ]
  return placeholders.includes(alt.toLowerCase())
}

/**
 * Find figcaption text for an image inside a <figure>.
 */
function getFigcaption(img: Element): string | null {
  const figure = img.closest('figure')
  if (!figure) return null
  const caption = figure.querySelector('figcaption')
  return caption?.textContent?.trim() || null
}

/**
 * Run OCR on an image URL using tesseract.js.
 * Returns extracted text or null on failure.
 */
async function runOcr(imageUrl: string): Promise<string | null> {
  try {
    // Dynamic import to avoid loading tesseract.js unless needed
    const Tesseract = await import('tesseract.js')
    const result = await Tesseract.recognize(imageUrl, 'eng', {
      logger: () => {}, // Suppress progress logs
    })
    const text = result.data.text.trim()
    return text.length > 5 ? text : null // Skip tiny fragments
  } catch {
    return null
  }
}

/**
 * Run vision API (Anthropic Claude) on an image URL.
 * Returns a description or null on failure.
 *
 * Uses the Anthropic Messages API with a vision-capable model.
 */
async function runVision(imageUrl: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
              {
                type: 'text',
                text: 'Describe this image in one concise sentence for a screen reader. Focus on what is shown, not how it looks.',
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>
    }
    const textBlock = data.content.find((c) => c.type === 'text')
    return textBlock?.text?.trim() || null
  } catch {
    return null
  }
}

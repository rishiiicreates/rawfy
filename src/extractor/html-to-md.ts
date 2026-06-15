/**
 * Rawfy — HTML to Markdown converter
 *
 * Converts cleaned HTML to AI-agent-friendly Markdown using Turndown
 * with custom rules for media, code, tables, and semantic elements.
 *
 * Custom rules (in priority order):
 * 1. <img> → [IMAGE: alt | src: url]
 * 2. <video> → [VIDEO: metadata]
 * 3. <audio> → [AUDIO: metadata]
 * 4. <figure> → preserve with figcaption
 * 5. <details>/<summary> → preserve
 * 6. <code> → inline backticks
 * 7. <pre><code> → fenced code blocks with language
 * 8. <table> → markdown table
 * 9. <a> → [text](url) with resolved URLs
 */

import TurndownService from 'turndown'

/**
 * Convert HTML to clean, AI-agent-friendly Markdown.
 *
 * @param html - HTML string (typically from Readability's cleaned output)
 * @param baseUrl - Base URL for resolving relative links
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  const turndown = createTurndownService(baseUrl)
  const markdown = turndown.turndown(html)

  // Post-processing: clean up excessive whitespace
  return markdown
    .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines to 2
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
}

/**
 * Create a configured Turndown instance with all custom rules.
 */
function createTurndownService(baseUrl: string): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx', // # Heading style
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  })

  // Register custom rules (order matters — first match wins)
  addFencedCodeRule(turndown)
  addInlineCodeRule(turndown)
  addImageRule(turndown, baseUrl)
  addVideoRule(turndown)
  addAudioRule(turndown)
  addFigureRule(turndown)
  addDetailsRule(turndown)
  addTableRule(turndown)
  addLinkRule(turndown, baseUrl)

  return turndown
}

// ---------------------------------------------------------------------------
// Custom Turndown Rules
// ---------------------------------------------------------------------------

/**
 * <pre><code> → fenced code block with language detection
 */
function addFencedCodeRule(turndown: TurndownService): void {
  turndown.addRule('fencedCodeBlock', {
    filter: (node): boolean => {
      return (
        node.nodeName === 'PRE' && node.firstChild !== null && node.firstChild.nodeName === 'CODE'
      )
    },
    replacement: (_content, node): string => {
      const codeNode = (node as HTMLElement).querySelector('code')
      if (!codeNode) return _content

      // Detect language from class="language-xxx" or class="xxx"
      const className = codeNode.getAttribute('class') || ''
      const langMatch = className.match(/(?:language-|lang-)(\w+)/i)
      const lang = langMatch ? langMatch[1] : ''

      const code = codeNode.textContent || ''

      return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`
    },
  })
}

/**
 * <code> (not inside <pre>) → inline backticks
 */
function addInlineCodeRule(turndown: TurndownService): void {
  turndown.addRule('inlineCode', {
    filter: (node): boolean => {
      return (
        node.nodeName === 'CODE' && node.parentNode !== null && node.parentNode.nodeName !== 'PRE'
      )
    },
    replacement: (_content, node): string => {
      const text = (node as HTMLElement).textContent || ''
      if (!text) return ''

      // Use double backticks if text contains a backtick
      if (text.includes('`')) {
        return `\`\` ${text} \`\``
      }
      return `\`${text}\``
    },
  })
}

/**
 * <img> → [IMAGE: alt | src: url]
 * Machine-readable image placeholders for AI agents.
 */
function addImageRule(turndown: TurndownService, baseUrl: string): void {
  turndown.addRule('image', {
    filter: 'img',
    replacement: (_content, node): string => {
      const el = node as HTMLElement
      const alt = el.getAttribute('alt')?.trim() || 'no alt text'
      const rawSrc =
        el.getAttribute('src') ||
        el.getAttribute('data-src') || // Lazy-loaded images
        el.getAttribute('data-lazy-src') ||
        ''

      if (!rawSrc) return `[IMAGE: ${alt}]`

      const src = resolveUrl(rawSrc, baseUrl)
      return `[IMAGE: ${alt} | src: ${src}]`
    },
  })
}

/**
 * <video> → [VIDEO: metadata]
 */
function addVideoRule(turndown: TurndownService): void {
  turndown.addRule('video', {
    filter: 'video',
    replacement: (_content, node): string => {
      const el = node as HTMLElement
      const src = el.getAttribute('src') || ''
      const poster = el.getAttribute('poster') || ''

      // Check for <source> children
      const sourceEl = el.querySelector('source')
      const sourceSrc = sourceEl?.getAttribute('src') || ''
      const finalSrc = src || sourceSrc

      const parts: string[] = ['VIDEO']
      if (finalSrc) parts.push(`src: ${finalSrc}`)
      if (poster) parts.push(`poster: ${poster}`)

      return `[${parts.join(' | ')}]`
    },
  })
}

/**
 * <audio> → [AUDIO: metadata]
 */
function addAudioRule(turndown: TurndownService): void {
  turndown.addRule('audio', {
    filter: 'audio',
    replacement: (_content, node): string => {
      const el = node as HTMLElement
      const src = el.getAttribute('src') || ''

      const sourceEl = el.querySelector('source')
      const sourceSrc = sourceEl?.getAttribute('src') || ''
      const finalSrc = src || sourceSrc

      if (finalSrc) {
        return `[AUDIO | src: ${finalSrc}]`
      }
      return '[AUDIO]'
    },
  })
}

/**
 * <figure> → preserve with figcaption
 */
function addFigureRule(turndown: TurndownService): void {
  turndown.addRule('figure', {
    filter: 'figure',
    replacement: (content, node): string => {
      const el = node as HTMLElement
      const caption = el.querySelector('figcaption')?.textContent?.trim()

      if (caption) {
        return `\n\n${content.trim()}\n*${caption}*\n\n`
      }
      return `\n\n${content.trim()}\n\n`
    },
  })
}

/**
 * <details>/<summary> → preserve as markdown
 */
function addDetailsRule(turndown: TurndownService): void {
  turndown.addRule('details', {
    filter: 'details',
    replacement: (content, node): string => {
      const el = node as HTMLElement
      const summary = el.querySelector('summary')?.textContent?.trim()
      const heading = summary ? `**${summary}**` : '**Details**'

      // Remove the summary text from content since we're using it as heading
      const body = content.replace(summary || '', '').trim()

      return `\n\n${heading}\n\n${body}\n\n`
    },
  })
}

/**
 * <table> → Markdown table
 *
 * Converts HTML tables to proper GFM-style markdown tables with
 * header row and separator.
 */
function addTableRule(turndown: TurndownService): void {
  turndown.addRule('table', {
    filter: 'table',
    replacement: (_content, node): string => {
      const rows: string[][] = []

      // Recursively find all TR elements in the table
      // Using a recursive walk because Turndown's node type
      // may not support querySelectorAll in all environments
      function walkForRows(n: {
        nodeName: string
        firstChild: unknown
        nextSibling: unknown
        textContent: string | null
      }): void {
        if (n.nodeName === 'TR') {
          const cells: string[] = []
          let child = n.firstChild as typeof n | null
          while (child) {
            if (child.nodeName === 'TH' || child.nodeName === 'TD') {
              const text = (child.textContent || '').replace(/\s+/g, ' ').trim()
              cells.push(text)
            }
            child = child.nextSibling as typeof n | null
          }
          if (cells.length > 0) {
            rows.push(cells)
          }
        } else {
          let child = n.firstChild as typeof n | null
          while (child) {
            walkForRows(child)
            child = child.nextSibling as typeof n | null
          }
        }
      }

      walkForRows(node as unknown as Parameters<typeof walkForRows>[0])

      if (rows.length === 0) return ''

      // Determine max columns
      const maxCols = Math.max(...rows.map((r) => r.length))

      // Pad rows to have consistent column count
      const paddedRows = rows.map((row) => {
        while (row.length < maxCols) row.push('')
        return row
      })

      // Build markdown table
      const lines: string[] = []

      const header = paddedRows[0]!
      lines.push(`| ${header.join(' | ')} |`)
      lines.push(`| ${header.map(() => '---').join(' | ')} |`)

      for (let i = 1; i < paddedRows.length; i++) {
        lines.push(`| ${paddedRows[i]!.join(' | ')} |`)
      }

      return `\n\n${lines.join('\n')}\n\n`
    },
  })
}

/**
 * <a> → [text](url) with resolved relative URLs
 */
function addLinkRule(turndown: TurndownService, baseUrl: string): void {
  turndown.addRule('link', {
    filter: (node): boolean => {
      return node.nodeName === 'A' && node.getAttribute('href') !== null
    },
    replacement: (content, node): string => {
      const el = node as HTMLElement
      const rawHref = el.getAttribute('href') || ''

      // Skip empty/anchor-only/javascript links
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
        return content
      }

      const href = resolveUrl(rawHref, baseUrl)
      const title = el.getAttribute('title')
      const text = content.trim() || href

      if (title) {
        return `[${text}](${href} "${title}")`
      }
      return `[${text}](${href})`
    },
  })
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

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

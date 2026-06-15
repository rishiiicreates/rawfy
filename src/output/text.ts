/**
 * Rawfy — Plain text output serializer
 *
 * Produces minimal plain text suitable for token-constrained contexts:
 *   - Headings → UPPERCASE
 *   - Links → text (url)
 *   - Media placeholders → stripped
 *   - Markdown formatting → stripped
 */

import type { PageData } from '../types.js'

/**
 * Serialize PageData into clean plain text.
 *
 * @param data - Complete page data from the pipeline
 * @returns Plain text string
 */
export function serializeText(data: PageData): string {
  const parts: string[] = []

  // Title
  if (data.metadata.title) {
    parts.push(data.metadata.title.toUpperCase())
    parts.push(`Source: ${data.metadata.url}`)
    parts.push('')
  }

  // Process the markdown into plain text
  let text = data.content.markdown

  // Convert headings to UPPERCASE
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading: string) => {
    return `\n${heading.toUpperCase()}\n`
  })

  // Convert markdown links to text (url) format
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')

  // Strip media placeholders
  text = text.replace(/\[IMAGE:.*?\]/g, '')
  text = text.replace(/\[VIDEO.*?\]/g, '')
  text = text.replace(/\[AUDIO.*?\]/g, '')
  text = text.replace(/\[PDF.*?\]/g, '')

  // Strip remaining markdown formatting
  text = text.replace(/\*\*(.*?)\*\*/g, '$1') // bold
  text = text.replace(/\*(.*?)\*/g, '$1') // italic
  text = text.replace(/`([^`]+)`/g, '$1') // inline code
  text = text.replace(/```[\s\S]*?```/g, '') // fenced code blocks
  text = text.replace(/^\|.*\|$/gm, '') // table rows
  text = text.replace(/^[-*+]\s+/gm, '• ') // list items
  text = text.replace(/^\d+\.\s+/gm, '• ') // ordered list items
  text = text.replace(/^>\s+/gm, '') // blockquotes
  text = text.replace(/^---$/gm, '') // horizontal rules

  // Collapse excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  parts.push(text)

  return parts.join('\n')
}

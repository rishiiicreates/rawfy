/**
 * Rawfy — WSM (Web Semantic Markdown) output serializer
 *
 * Produces the primary Rawfy output format:
 *   - YAML frontmatter with page metadata
 *   - Markdown body with content
 *   - Media descriptions section
 *   - Interactive elements section
 *
 * This format is designed for AI agents to consume — structured enough
 * to be machine-parseable, readable enough to be human-inspectable.
 */

import type { PageData, MediaResult, InteractiveElement } from '../types.js'

/**
 * Serialize PageData into WSM format.
 *
 * @param data - Complete page data from the pipeline
 * @returns WSM-formatted string
 */
export function serializeWsm(data: PageData): string {
  const parts: string[] = []

  // YAML frontmatter
  parts.push(buildFrontmatter(data))

  // Main content
  parts.push(data.content.markdown)

  // Media section
  if (data.media.length > 0) {
    parts.push(buildMediaSection(data.media))
  }

  // Interactive elements section
  if (data.interactiveElements.length > 0) {
    parts.push(buildInteractiveSection(data.interactiveElements))
  }

  // Fetch stats footer
  parts.push(buildStatsFooter(data))

  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

/**
 * Build YAML frontmatter block.
 */
function buildFrontmatter(data: PageData): string {
  const lines: string[] = ['---']

  lines.push(`url: ${data.metadata.url}`)
  if (data.metadata.canonicalUrl) {
    lines.push(`canonical_url: ${data.metadata.canonicalUrl}`)
  }
  lines.push(`type: ${data.metadata.type}`)
  lines.push(`fetched_at: ${data.metadata.fetchedAt}`)

  if (data.metadata.lang) lines.push(`lang: ${data.metadata.lang}`)
  if (data.metadata.title) lines.push(`title: "${escapeYaml(data.metadata.title)}"`)
  if (data.metadata.description) {
    lines.push(`description: "${escapeYaml(data.metadata.description)}"`)
  }

  lines.push(`word_count: ${data.metadata.wordCount}`)
  lines.push(`reading_time_minutes: ${data.metadata.readingTimeMinutes}`)
  lines.push(`interactive_elements: ${data.metadata.interactiveElementCount}`)
  lines.push(`media_count: ${data.media.length}`)

  if (data.metadata.og) {
    lines.push('og:')
    if (data.metadata.og.title) lines.push(`  title: "${escapeYaml(data.metadata.og.title)}"`)
    if (data.metadata.og.type) lines.push(`  type: ${data.metadata.og.type}`)
    if (data.metadata.og.image) lines.push(`  image: ${data.metadata.og.image}`)
    if (data.metadata.og.siteName) lines.push(`  site_name: "${escapeYaml(data.metadata.og.siteName)}"`)
  }

  lines.push('---')
  return lines.join('\n')
}

/**
 * Build the media descriptions section.
 */
function buildMediaSection(media: MediaResult[]): string {
  const lines: string[] = ['## Media']

  for (const item of media) {
    switch (item.type) {
      case 'image': {
        const desc = item.description || item.alt || 'no description'
        let line = `- [IMAGE: ${desc}`
        if (item.src) line += ` | src: ${item.src}`
        if (item.descriptionSource && item.descriptionSource !== 'alt_text') {
          line += ` | via: ${item.descriptionSource}`
        }
        line += ']'
        lines.push(line)
        break
      }
      case 'video': {
        let line = '- [VIDEO'
        if (item.title) line += `: "${item.title}"`
        if (item.src) line += ` | src: ${item.src}`
        if (item.transcript) {
          const truncated =
            item.transcript.length > 200
              ? item.transcript.slice(0, 197) + '...'
              : item.transcript
          line += ` | transcript: ${truncated}`
        }
        line += ']'
        lines.push(line)
        break
      }
      case 'audio': {
        let line = '- [AUDIO'
        if (item.title) line += `: "${item.title}"`
        if (item.src) line += ` | src: ${item.src}`
        line += ']'
        lines.push(line)
        break
      }
      case 'pdf': {
        let line = '- [PDF'
        if (item.title) line += `: "${item.title}"`
        if (item.pageCount) line += ` | ${item.pageCount} pages`
        if (item.src) line += ` | src: ${item.src}`
        line += ']'
        lines.push(line)
        break
      }
    }
  }

  return lines.join('\n')
}

/**
 * Build the interactive elements section.
 */
function buildInteractiveSection(elements: InteractiveElement[]): string {
  const lines: string[] = ['## Interactive Elements']

  // Group by type
  const buttons = elements.filter((e) => e.type === 'button')
  const forms = elements.filter((e) => e.type === 'form')
  const inputs = elements.filter((e) => e.type === 'input')
  const selects = elements.filter((e) => e.type === 'select')
  const links = elements.filter((e) => e.type === 'link')

  if (buttons.length > 0) {
    lines.push(`\n### Buttons (${buttons.length})`)
    for (const btn of buttons) {
      lines.push(`- ${btn.label}`)
    }
  }

  if (forms.length > 0) {
    lines.push(`\n### Forms (${forms.length})`)
    for (const form of forms) {
      let line = `- ${form.label}`
      if (form.action) line += ` → ${form.action}`
      if (form.fields && form.fields.length > 0) {
        line += ` [fields: ${form.fields.join(', ')}]`
      }
      lines.push(line)
    }
  }

  if (inputs.length > 0) {
    lines.push(`\n### Inputs (${inputs.length})`)
    for (const input of inputs) {
      lines.push(`- ${input.label}`)
    }
  }

  if (selects.length > 0) {
    lines.push(`\n### Selects (${selects.length})`)
    for (const select of selects) {
      let line = `- ${select.label}`
      if (select.fields && select.fields.length > 0) {
        line += ` [options: ${select.fields.join(', ')}]`
      }
      lines.push(line)
    }
  }

  if (links.length > 0) {
    // Limit links to avoid flooding (show first 20)
    const shownLinks = links.slice(0, 20)
    const remaining = links.length - shownLinks.length
    lines.push(`\n### Links (${links.length})`)
    for (const link of shownLinks) {
      lines.push(`- [${link.label}](${link.href || '#'})`)
    }
    if (remaining > 0) {
      lines.push(`- ... and ${remaining} more links`)
    }
  }

  return lines.join('\n')
}

/**
 * Build the fetch stats footer.
 */
function buildStatsFooter(data: PageData): string {
  const lines: string[] = ['---', '_Rawfy fetch stats:_']
  lines.push(`- Method: ${data.fetchStats.method}`)
  lines.push(`- Duration: ${data.fetchStats.durationMs}ms`)
  lines.push(`- Estimated tokens: ${data.fetchStats.estimatedTokens.toLocaleString()}`)
  if (data.fetchStats.truncated) {
    lines.push('- ⚠️ Output was truncated')
  }
  return lines.join('\n')
}

/**
 * Escape special characters for YAML string values.
 */
function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/**
 * Rawfy — JSON output serializer
 *
 * Produces structured JSON output following the schema:
 *   { metadata, content, media[], interactive_elements[], fetch_stats }
 *
 * Designed for programmatic consumers (Python wrappers, MCP servers, etc.)
 */

import type { PageData } from '../types.js'

/**
 * Serialize PageData into a structured JSON string.
 *
 * @param data - Complete page data from the pipeline
 * @returns Pretty-printed JSON string
 */
export function serializeJson(data: PageData): string {
  const output = {
    metadata: {
      url: data.metadata.url,
      canonical_url: data.metadata.canonicalUrl || null,
      title: data.metadata.title || null,
      description: data.metadata.description || null,
      type: data.metadata.type,
      lang: data.metadata.lang || null,
      word_count: data.metadata.wordCount,
      reading_time_minutes: data.metadata.readingTimeMinutes,
      fetched_at: data.metadata.fetchedAt,
      og: data.metadata.og
        ? {
            title: data.metadata.og.title || null,
            type: data.metadata.og.type || null,
            image: data.metadata.og.image || null,
            description: data.metadata.og.description || null,
            site_name: data.metadata.og.siteName || null,
          }
        : null,
      json_ld: data.metadata.jsonLd || null,
    },
    content: {
      markdown: data.content.markdown,
      text: data.content.text,
    },
    media: data.media.map((item) => {
      switch (item.type) {
        case 'image':
          return {
            type: 'image',
            src: item.src,
            alt: item.alt || null,
            description: item.description || null,
            description_source: item.descriptionSource || null,
          }
        case 'video':
          return {
            type: 'video',
            src: item.src || null,
            title: item.title || null,
            thumbnail_url: item.thumbnailUrl || null,
            transcript: item.transcript || null,
            duration_seconds: item.durationSeconds || null,
          }
        case 'audio':
          return {
            type: 'audio',
            src: item.src || null,
            title: item.title || null,
            transcript: item.transcript || null,
            duration_seconds: item.durationSeconds || null,
          }
        case 'pdf':
          return {
            type: 'pdf',
            src: item.src || null,
            title: item.title || null,
            page_count: item.pageCount || null,
            text: item.text || null,
          }
      }
    }),
    interactive_elements: data.interactiveElements.map((el) => ({
      type: el.type,
      label: el.label,
      href: el.href || null,
      action: el.action || null,
      fields: el.fields || null,
      aria_label: el.ariaLabel || null,
    })),
    fetch_stats: {
      method: data.fetchStats.method,
      duration_ms: data.fetchStats.durationMs,
      estimated_tokens: data.fetchStats.estimatedTokens,
      truncated: data.fetchStats.truncated,
    },
  }

  return JSON.stringify(output, null, 2)
}

/**
 * Rawfy — HTML to Markdown converter
 *
 * Wraps Turndown with custom rules for Rawfy's semantic output format.
 * Converts cleaned HTML into markdown with special handling for
 * images, videos, audio, code blocks, tables, and interactive elements.
 *
 * TODO: Phase 2 implementation
 */

/**
 * Convert HTML content to Rawfy-flavored Markdown.
 *
 * Custom Turndown rules:
 * - <img> → [IMAGE: {alt} | src: {src}]
 * - <video> → [VIDEO: {metadata}]
 * - <audio> → [AUDIO: {metadata}]
 * - <figure> → preserve with figcaption
 * - <details>/<summary> → preserve
 * - <code> → inline backticks
 * - <pre><code> → fenced blocks with language detection
 * - <table> → proper markdown tables
 * - <a> → [text](url) with relative URLs resolved
 */
export function htmlToMarkdown(_html: string, _baseUrl: string): string {
  // TODO: implement in Phase 2
  return ''
}

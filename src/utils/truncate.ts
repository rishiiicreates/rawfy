/**
 * Rawfy — Token-aware output truncation
 *
 * Estimates token count and truncates content when it exceeds
 * the configured max_tokens limit.
 *
 * TODO: Phase 4 implementation
 */

import { encode, decode } from 'gpt-tokenizer'

/**
 * Estimate the token count for a string using gpt-tokenizer (cl100k_base equivalent).
 */
export function estimateTokens(text: string): number {
  return encode(text).length
}

/**
 * Truncate text to fit within a token budget.
 * Appends a truncation notice if content was cut.
 */
export function truncate(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const tokens = encode(text)
  if (tokens.length <= maxTokens) {
    return { text, truncated: false }
  }

  const truncated = decode(tokens.slice(0, maxTokens))
  const omitted = tokens.length - maxTokens
  const notice = `\n\n[TRUNCATED: output exceeded ${maxTokens.toLocaleString()} token limit. ~${omitted.toLocaleString()} tokens omitted. Use --max-tokens to increase limit.]`

  return { text: truncated + notice, truncated: true }
}

/**
 * Rawfy — Token-aware output truncation
 *
 * Estimates token count and truncates content when it exceeds
 * the configured max_tokens limit.
 *
 * TODO: Phase 4 implementation
 */

const CHARS_PER_TOKEN = 4

/**
 * Estimate the token count for a string.
 * Uses the rough heuristic of 1 token ≈ 4 characters.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Truncate text to fit within a token budget.
 * Appends a truncation notice if content was cut.
 */
export function truncate(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const estimated = estimateTokens(text)
  if (estimated <= maxTokens) {
    return { text, truncated: false }
  }

  const maxChars = maxTokens * CHARS_PER_TOKEN
  const truncated = text.slice(0, maxChars)
  const omitted = estimated - maxTokens
  const notice = `\n\n[TRUNCATED: output exceeded ${maxTokens.toLocaleString()} token limit. ~${omitted.toLocaleString()} tokens omitted. Use --max-tokens to increase limit.]`

  return { text: truncated + notice, truncated: true }
}

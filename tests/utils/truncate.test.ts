import { describe, it, expect } from 'vitest'
import { estimateTokens, truncate } from '../../src/utils/truncate.js'

describe('estimateTokens', () => {
  it('estimates empty string as 0 tokens', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('estimates tokens using gpt-tokenizer', () => {
    // 100 'a's will be encoded into a certain number of tokens, usually ~25-50 depending on BPE
    const text = 'a'.repeat(100)
    expect(estimateTokens(text)).toBeGreaterThan(0)
  })

  it('accurately counts real words', () => {
    // 'hello' is typically 1 token
    expect(estimateTokens('hello')).toBe(1)
  })
})

describe('truncate', () => {
  it('returns text unchanged when under limit', () => {
    const result = truncate('short text', 1000)
    expect(result.text).toBe('short text')
    expect(result.truncated).toBe(false)
  })

  it('truncates and appends notice when over limit', () => {
    const text = 'a'.repeat(100) // 25 tokens
    const result = truncate(text, 10) // limit to 10 tokens (40 chars)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('[TRUNCATED:')
    expect(result.text).toContain('10')
    // The actual content portion should be 40 chars
    expect(result.text.startsWith('a'.repeat(40))).toBe(true)
  })

  it('does not truncate text exactly at the limit', () => {
    const text = 'a'.repeat(40) // exactly 10 tokens
    const result = truncate(text, 10)
    expect(result.text).toBe(text)
    expect(result.truncated).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { createError, isRawfyError, wrapError } from '../../src/utils/errors.js'

describe('createError', () => {
  it('creates a structured error with code and message', () => {
    const err = createError('INVALID_URL', 'URL is not valid')
    expect(err.code).toBe('INVALID_URL')
    expect(err.message).toBe('URL is not valid')
    expect(err.url).toBeUndefined()
    expect(err.details).toBeUndefined()
  })

  it('includes optional url and details', () => {
    const err = createError('FETCH_TIMEOUT', 'timed out', 'https://example.com', { ms: 15000 })
    expect(err.code).toBe('FETCH_TIMEOUT')
    expect(err.message).toBe('timed out')
    expect(err.url).toBe('https://example.com')
    expect(err.details).toEqual({ ms: 15000 })
  })

  it('omits url and details keys when not provided', () => {
    const err = createError('PARSE_FAILED', 'bad html')
    expect(Object.keys(err)).toEqual(['code', 'message'])
  })
})

describe('isRawfyError', () => {
  it('returns true for valid RawfyError objects', () => {
    expect(isRawfyError({ code: 'FETCH_FAILED', message: 'fail' })).toBe(true)
  })

  it('returns true for errors with optional fields', () => {
    expect(
      isRawfyError({
        code: 'FETCH_TIMEOUT',
        message: 'timeout',
        url: 'https://example.com',
        details: {},
      }),
    ).toBe(true)
  })

  it('returns false for null', () => {
    expect(isRawfyError(null)).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isRawfyError('string')).toBe(false)
    expect(isRawfyError(42)).toBe(false)
    expect(isRawfyError(undefined)).toBe(false)
  })

  it('returns false for objects missing code', () => {
    expect(isRawfyError({ message: 'fail' })).toBe(false)
  })

  it('returns false for objects missing message', () => {
    expect(isRawfyError({ code: 'FETCH_FAILED' })).toBe(false)
  })
})

describe('wrapError', () => {
  it('wraps a native Error into a RawfyError', () => {
    const native = new Error('connection refused')
    const wrapped = wrapError('FETCH_FAILED', native, 'https://example.com')
    expect(wrapped.code).toBe('FETCH_FAILED')
    expect(wrapped.message).toBe('connection refused')
    expect(wrapped.url).toBe('https://example.com')
    expect(wrapped.details).toEqual(
      expect.objectContaining({ name: 'Error', stack: expect.any(String) }),
    )
  })

  it('passes through an existing RawfyError unchanged', () => {
    const existing = createError('INVALID_URL', 'bad url', 'https://bad')
    const wrapped = wrapError('FETCH_FAILED', existing)
    expect(wrapped).toBe(existing)
  })

  it('wraps a plain string error', () => {
    const wrapped = wrapError('UNKNOWN_ERROR', 'something broke')
    expect(wrapped.code).toBe('UNKNOWN_ERROR')
    expect(wrapped.message).toBe('something broke')
    expect(wrapped.details).toBe('something broke')
  })
})

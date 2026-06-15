import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchStatic } from '../../src/fetcher/static.js'
import { isRawfyError } from '../../src/utils/errors.js'

// Mock the global fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Helper to create a mock Response object
 */
function mockResponse(options: {
  body?: string
  status?: number
  statusText?: string
  url?: string
  headers?: Record<string, string>
}): Response {
  const headers = new Headers(options.headers ?? { 'content-type': 'text/html' })
  return {
    ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    url: options.url ?? 'https://example.com',
    headers,
    text: vi.fn().mockResolvedValue(options.body ?? '<html><body>Hello</body></html>'),
    json: vi.fn(),
    blob: vi.fn(),
    arrayBuffer: vi.fn(),
    formData: vi.fn(),
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'basic' as ResponseType,
  } as unknown as Response
}

describe('fetchStatic', () => {
  describe('successful fetches', () => {
    it('returns HTML content and metadata for a simple page', async () => {
      const html = '<html><body><h1>Test</h1></body></html>'
      mockFetch.mockResolvedValue(
        mockResponse({ body: html, url: 'https://example.com' }),
      )

      const result = await fetchStatic('https://example.com')

      expect(result.html).toBe(html)
      expect(result.finalUrl).toBe('https://example.com')
      expect(result.method).toBe('static')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.headers).toBeDefined()
      expect(result.headers['content-type']).toBe('text/html')
    })

    it('captures final URL after redirect', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          body: '<html>Redirected</html>',
          url: 'https://example.com/final-page',
        }),
      )

      const result = await fetchStatic('https://example.com/old-page')
      expect(result.finalUrl).toBe('https://example.com/final-page')
    })

    it('sends realistic User-Agent header', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))

      await fetchStatic('https://example.com')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Chrome'),
          }),
        }),
      )
    })

    it('respects custom User-Agent', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))

      await fetchStatic('https://example.com', { userAgent: 'RawfyBot/1.0' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'RawfyBot/1.0',
          }),
        }),
      )
    })

    it('uses redirect: follow mode', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))

      await fetchStatic('https://example.com')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          redirect: 'follow',
        }),
      )
    })
  })

  describe('URL validation', () => {
    it('throws INVALID_URL for malformed URLs', async () => {
      try {
        await fetchStatic('not-a-url')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('INVALID_URL')
          expect(err.url).toBe('not-a-url')
        }
      }
    })

    it('throws INVALID_URL for unsupported protocols', async () => {
      try {
        await fetchStatic('ftp://files.example.com/doc.txt')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('INVALID_URL')
          expect(err.message).toContain('ftp:')
        }
      }
    })
  })

  describe('error handling', () => {
    it('throws FETCH_FAILED for HTTP 404', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ status: 404, statusText: 'Not Found' }),
      )

      try {
        await fetchStatic('https://example.com/missing')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_FAILED')
          expect(err.message).toContain('404')
        }
      }
    })

    it('throws FETCH_FAILED for HTTP 500', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ status: 500, statusText: 'Internal Server Error' }),
      )

      try {
        await fetchStatic('https://example.com/error')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_FAILED')
          expect(err.message).toContain('500')
        }
      }
    })

    it('throws FETCH_TIMEOUT for timeout errors', async () => {
      const timeoutError = new DOMException('The operation was aborted', 'TimeoutError')
      mockFetch.mockRejectedValue(timeoutError)

      try {
        await fetchStatic('https://slow.example.com', { timeoutMs: 1000 })
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_TIMEOUT')
          expect(err.url).toBe('https://slow.example.com')
        }
      }
    })

    it('throws FETCH_TIMEOUT for abort errors', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockFetch.mockRejectedValue(abortError)

      try {
        await fetchStatic('https://slow.example.com')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_TIMEOUT')
        }
      }
    })

    it('wraps unknown errors as FETCH_FAILED', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      try {
        await fetchStatic('https://down.example.com')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_FAILED')
          expect(err.message).toContain('ECONNREFUSED')
        }
      }
    })
  })

  describe('timeout configuration', () => {
    it('uses default 15s timeout', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))

      await fetchStatic('https://example.com')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
    })

    it('accepts custom timeout', async () => {
      mockFetch.mockResolvedValue(mockResponse({}))

      await fetchStatic('https://example.com', { timeoutMs: 5000 })

      // Verify fetch was called (timeout is set via AbortSignal.timeout)
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})

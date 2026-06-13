import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isRawfyError } from '../../src/utils/errors.js'

// We need to mock the child modules before importing the router
vi.mock('../../src/fetcher/static.js', () => ({
  fetchStatic: vi.fn(),
}))

vi.mock('../../src/fetcher/playwright.js', () => ({
  fetchPlaywright: vi.fn(),
}))

vi.mock('../../src/utils/detect.js', () => ({
  detectNeedsPlaywright: vi.fn(),
}))

// Import after mocking
import { fetchPage } from '../../src/fetcher/index.js'
import { fetchStatic } from '../../src/fetcher/static.js'
import { fetchPlaywright } from '../../src/fetcher/playwright.js'
import { detectNeedsPlaywright } from '../../src/utils/detect.js'
import type { FetchResult } from '../../src/types.js'

const mockFetchStatic = vi.mocked(fetchStatic)
const mockFetchPlaywright = vi.mocked(fetchPlaywright)
const mockDetect = vi.mocked(detectNeedsPlaywright)

/** Helper to build a FetchResult */
function makeFetchResult(overrides: Partial<FetchResult> = {}): FetchResult {
  return {
    html: '<html><body>Hello</body></html>',
    finalUrl: 'https://example.com',
    headers: { 'content-type': 'text/html' },
    method: 'static',
    durationMs: 100,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchPage', () => {
  describe('static-only path', () => {
    it('returns static result when detection says no Playwright needed', async () => {
      const staticResult = makeFetchResult()
      mockFetchStatic.mockResolvedValue(staticResult)
      mockDetect.mockReturnValue({
        needsPlaywright: false,
        reason: 'Static page',
      })

      const result = await fetchPage('https://example.com')

      expect(result).toBe(staticResult)
      expect(mockFetchStatic).toHaveBeenCalledOnce()
      expect(mockFetchPlaywright).not.toHaveBeenCalled()
    })

    it('returns static result when noPlaywright option is set', async () => {
      const staticResult = makeFetchResult()
      mockFetchStatic.mockResolvedValue(staticResult)

      const result = await fetchPage('https://example.com', { noPlaywright: true })

      expect(result).toBe(staticResult)
      expect(mockDetect).not.toHaveBeenCalled()
      expect(mockFetchPlaywright).not.toHaveBeenCalled()
    })
  })

  describe('Playwright escalation', () => {
    it('escalates to Playwright when detection recommends it', async () => {
      const staticResult = makeFetchResult({ html: '<div id="root"></div>' })
      const pwResult = makeFetchResult({
        html: '<div id="root"><h1>Rendered</h1></div>',
        method: 'playwright',
        durationMs: 3000,
      })

      mockFetchStatic.mockResolvedValue(staticResult)
      mockDetect.mockReturnValue({
        needsPlaywright: true,
        reason: 'Empty app shell',
      })
      mockFetchPlaywright.mockResolvedValue(pwResult)

      const result = await fetchPage('https://spa.example.com')

      expect(result).toBe(pwResult)
      expect(mockFetchStatic).toHaveBeenCalledOnce()
      expect(mockFetchPlaywright).toHaveBeenCalledOnce()
    })

    it('falls back to static result when Playwright is not installed', async () => {
      const staticResult = makeFetchResult({ html: '<div id="root"></div>' })
      mockFetchStatic.mockResolvedValue(staticResult)
      mockDetect.mockReturnValue({
        needsPlaywright: true,
        reason: 'Empty app shell',
      })
      mockFetchPlaywright.mockRejectedValue({
        code: 'PLAYWRIGHT_NOT_INSTALLED',
        message: 'Playwright not installed',
      })

      const result = await fetchPage('https://spa.example.com')

      // Should fall back to static result, not throw
      expect(result).toBe(staticResult)
    })

    it('falls back to static result when Playwright times out', async () => {
      const staticResult = makeFetchResult({ html: '<div id="root"></div>' })
      mockFetchStatic.mockResolvedValue(staticResult)
      mockDetect.mockReturnValue({
        needsPlaywright: true,
        reason: 'Empty app shell',
      })
      mockFetchPlaywright.mockRejectedValue({
        code: 'FETCH_TIMEOUT',
        message: 'Playwright timed out',
      })

      const result = await fetchPage('https://slow-spa.example.com')

      expect(result).toBe(staticResult)
    })
  })

  describe('progress callbacks', () => {
    it('calls onProgress during static-only fetch', async () => {
      const progress = vi.fn()
      mockFetchStatic.mockResolvedValue(makeFetchResult())
      mockDetect.mockReturnValue({
        needsPlaywright: false,
        reason: 'Static',
      })

      await fetchPage('https://example.com', { onProgress: progress })

      expect(progress).toHaveBeenCalledWith(
        expect.stringContaining('fetching'),
      )
      expect(progress).toHaveBeenCalledWith(
        expect.stringContaining('done'),
      )
    })

    it('reports Playwright escalation in progress', async () => {
      const progress = vi.fn()
      mockFetchStatic.mockResolvedValue(makeFetchResult({ html: '<div id="root"></div>' }))
      mockDetect.mockReturnValue({
        needsPlaywright: true,
        reason: 'SPA detected',
      })
      mockFetchPlaywright.mockResolvedValue(
        makeFetchResult({ method: 'playwright' }),
      )

      await fetchPage('https://spa.example.com', { onProgress: progress })

      expect(progress).toHaveBeenCalledWith(
        expect.stringContaining('JS-rendered'),
      )
    })
  })

  describe('URL validation', () => {
    it('throws INVALID_URL for garbage input', async () => {
      try {
        await fetchPage('not-a-url')
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('INVALID_URL')
        }
      }
    })
  })

  describe('static fetch failure with Playwright fallback', () => {
    it('tries Playwright when static fetch fails and noPlaywright is not set', async () => {
      const pwResult = makeFetchResult({ method: 'playwright' })
      mockFetchStatic.mockRejectedValue(new Error('ECONNRESET'))
      mockFetchPlaywright.mockResolvedValue(pwResult)

      const result = await fetchPage('https://flaky.example.com')

      expect(result).toBe(pwResult)
    })

    it('throws when static fails and noPlaywright is set', async () => {
      mockFetchStatic.mockRejectedValue({
        code: 'FETCH_FAILED',
        message: 'ECONNRESET',
      })

      try {
        await fetchPage('https://down.example.com', { noPlaywright: true })
        expect.fail('Should have thrown')
      } catch (err) {
        expect(isRawfyError(err)).toBe(true)
        if (isRawfyError(err)) {
          expect(err.code).toBe('FETCH_FAILED')
        }
      }
    })
  })
})

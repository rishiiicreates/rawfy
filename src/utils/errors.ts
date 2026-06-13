/**
 * Rawfy — Error factory and utilities
 *
 * All Rawfy errors pass through here. No raw exceptions leak to callers.
 */

import type { RawfyError, RawfyErrorCode } from '../types.js'

/**
 * Create a structured RawfyError.
 *
 * Every catch block in the pipeline should use this to wrap raw errors
 * before propagating them upward.
 */
export function createError(
  code: RawfyErrorCode,
  message: string,
  url?: string,
  details?: unknown,
): RawfyError {
  return {
    code,
    message,
    ...(url !== undefined && { url }),
    ...(details !== undefined && { details }),
  }
}

/**
 * Type guard to check if an unknown value is a RawfyError.
 */
export function isRawfyError(value: unknown): value is RawfyError {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj['code'] === 'string' && typeof obj['message'] === 'string'
}

/**
 * Wrap an unknown caught error into a RawfyError.
 *
 * Useful in catch blocks where the error type is unknown:
 * ```ts
 * try { ... } catch (err) { throw wrapError('FETCH_FAILED', err, url) }
 * ```
 */
export function wrapError(code: RawfyErrorCode, err: unknown, url?: string): RawfyError {
  if (isRawfyError(err)) return err

  const message = err instanceof Error ? err.message : String(err)
  const details = err instanceof Error ? { name: err.name, stack: err.stack } : err

  return createError(code, message, url, details)
}

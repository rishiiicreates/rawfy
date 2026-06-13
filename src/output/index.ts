/**
 * Rawfy — Output serializer router
 *
 * Routes to the appropriate serializer based on the requested format.
 *
 * TODO: Phase 4 implementation
 */

import type { OutputFormat, PageData } from '../types.js'
import { serializeRfm } from './rfm.js'
import { serializeJson } from './json.js'
import { serializeText } from './text.js'

/**
 * Serialize PageData into the requested output format.
 */
export function serialize(page: PageData, format: OutputFormat): string {
  switch (format) {
    case 'markdown':
      return serializeRfm(page)
    case 'json':
      return serializeJson(page)
    case 'text':
      return serializeText(page)
  }
}

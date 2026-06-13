/**
 * Rawfy — Audio handler
 *
 * Extracts audio element metadata and looks for
 * transcript links nearby in the DOM.
 *
 * TODO: Phase 3 implementation
 */

import type { AudioResult } from '../types.js'

/**
 * Extract audio information and transcripts.
 */
export async function extractAudio(
  _src: string,
  _metadata?: { title?: string; duration?: number },
): Promise<AudioResult> {
  // TODO: implement in Phase 3
  return {
    type: 'audio',
    src: _src,
    title: _metadata?.title,
  }
}

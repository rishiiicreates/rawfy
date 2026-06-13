/**
 * Rawfy — Video handler
 *
 * Extracts video metadata and transcripts from web pages.
 * Supports YouTube transcript API, native <track> captions,
 * and yt-dlp for local transcription.
 *
 * TODO: Phase 3 implementation
 */

import type { VideoResult } from '../types.js'

/**
 * Extract video information and transcripts.
 */
export async function extractVideo(
  _src: string,
  _metadata?: { title?: string; duration?: number },
): Promise<VideoResult> {
  // TODO: implement in Phase 3
  return {
    type: 'video',
    src: _src,
    title: _metadata?.title,
  }
}

/**
 * Rawfy — Shared type definitions
 *
 * Central type registry for the entire Rawfy pipeline.
 * Every module imports from here — no circular dependencies.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Canonical error codes returned by all Rawfy layers */
export type RawfyErrorCode =
  | 'INVALID_URL'
  | 'FETCH_TIMEOUT'
  | 'FETCH_FAILED'
  | 'PARSE_FAILED'
  | 'PLAYWRIGHT_FAILED'
  | 'PLAYWRIGHT_NOT_INSTALLED'
  | 'OCR_FAILED'
  | 'VISION_FAILED'
  | 'PDF_PARSE_FAILED'
  | 'SERIALIZE_FAILED'
  | 'UNKNOWN_ERROR'

/** Structured error that every Rawfy layer must produce on failure */
export interface RawfyError {
  code: RawfyErrorCode
  message: string
  url?: string
  details?: unknown
}

// ---------------------------------------------------------------------------
// Fetch types
// ---------------------------------------------------------------------------

/** Options passed to the fetch pipeline */
export interface FetchOptions {
  /** Force static-only fetch (skip Playwright) */
  noPlaywright?: boolean
  /** Force Playwright fetch (skip static heuristics) */
  forcePlaywright?: boolean
  /** Fetch timeout in milliseconds */
  timeoutMs?: number
  /** User-Agent header override */
  userAgent?: string
}

/** Which fetch strategy was used */
export type FetchMethod = 'static' | 'playwright'

/** Raw result from the fetch layer before extraction */
export interface FetchResult {
  /** The raw HTML string */
  html: string
  /** Final URL after redirects */
  finalUrl: string
  /** HTTP response headers */
  headers: Record<string, string>
  /** Which fetch method was used */
  method: FetchMethod
  /** Fetch duration in milliseconds */
  durationMs: number
  /** Extracted player config (e.g., ytInitialPlayerConfig for YouTube) */
  playerConfig?: YouTubePlayerConfig
  /** Native video captions extracted from Playwright (if available) */
  videoCaptions?: VideoCaptionTrack[]
}

/** Video caption track extracted from the DOM via Playwright */
export interface VideoCaptionTrack {
  /** Language code (e.g. 'en') */
  lang: string
  /** Caption text content */
  text: string
  /** Track label (e.g. 'English (auto-generated)') */
  label?: string
}

/** YouTube caption track entry from player config */
export interface YouTubeCaptionTrack {
  languageCode?: string
  baseUrl?: string
}

/** YouTube player config shape used for transcript extraction */
export interface YouTubePlayerConfig {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YouTubeCaptionTrack[]
    }
  }
}

// ---------------------------------------------------------------------------
// Detection types
// ---------------------------------------------------------------------------

/** Result of JS-rendering detection heuristic */
export interface DetectionResult {
  /** Whether Playwright is recommended for this page */
  needsPlaywright: boolean
  /** Human-readable reason for the decision */
  reason: string
}

// ---------------------------------------------------------------------------
// Extraction types
// ---------------------------------------------------------------------------

/** Page type classification */
export type PageType = 'article' | 'product' | 'docs' | 'search' | 'homepage' | 'video' | 'other'

/** Metadata extracted from a page */
export interface PageMetadata {
  url: string
  canonicalUrl?: string
  type: PageType
  fetchedAt: string
  lang?: string
  title?: string
  description?: string
  wordCount: number
  readingTimeMinutes: number
  interactiveElementCount: number
  og?: OpenGraphData
  jsonLd?: unknown[]
}

/** Open Graph metadata */
export interface OpenGraphData {
  title?: string
  type?: string
  description?: string
  image?: string
  url?: string
  siteName?: string
}

/** Content extracted by Readability */
export interface ReadabilityResult {
  title: string
  content: string
  excerpt?: string
  byline?: string
  siteName?: string
}

/** Types of interactive elements found on a page */
export type InteractiveElementType = 'button' | 'link' | 'form' | 'input' | 'select'

/** A single interactive element extracted from the page */
export interface InteractiveElement {
  type: InteractiveElementType
  label: string
  href?: string
  action?: string
  fields?: string[]
  ariaLabel?: string
}

// ---------------------------------------------------------------------------
// Media types
// ---------------------------------------------------------------------------

/** Source of an image description */
export type ImageDescriptionSource = 'alt_text' | 'figcaption' | 'ocr' | 'vision_api'

/** Extracted image information */
export interface ImageResult {
  type: 'image'
  src: string
  alt?: string
  description?: string
  descriptionSource?: ImageDescriptionSource
}

/** Extracted video information */
export interface VideoResult {
  type: 'video'
  src?: string
  title?: string
  durationSeconds?: number
  transcript?: string
  thumbnailUrl?: string
}

/** Extracted audio information */
export interface AudioResult {
  type: 'audio'
  src?: string
  title?: string
  durationSeconds?: number
  transcript?: string
}

/** Extracted PDF information */
export interface PdfResult {
  type: 'pdf'
  src: string
  title?: string
  pageCount?: number
  text?: string
}

/** Union of all media results */
export type MediaResult = ImageResult | VideoResult | AudioResult | PdfResult

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Supported output formats */
export type OutputFormat = 'markdown' | 'json' | 'text'

/** Complete page data — the pipeline's final internal representation */
export interface PageData {
  metadata: PageMetadata
  content: {
    /** Markdown-formatted body */
    markdown: string
    /** Plain text body (no formatting) */
    text: string
  }
  media: MediaResult[]
  interactiveElements: InteractiveElement[]
  fetchStats: {
    method: FetchMethod
    durationMs: number
    estimatedTokens: number
    truncated: boolean
  }
}

/** Options for the top-level rawfy fetch call */
export interface RawfyOptions {
  /** Output format */
  format?: OutputFormat
  /** Enable AI-powered image descriptions */
  vision?: boolean
  /** Skip Playwright JS rendering */
  noPlaywright?: boolean
  /** Force Playwright JS rendering */
  forcePlaywright?: boolean
  /** Maximum output tokens (truncate beyond this) */
  maxTokens?: number
  /** Write output to file path instead of returning */
  out?: string
}

# Changelog

All notable changes to Rawfy will be documented in this file.

## [0.1.0] — 2024-06-14

### 🎉 Initial Release

Rawfy — Universal web perception skill for AI agents.

### Added

**Core Pipeline**
- 7-stage pipeline: fetch → extract → markdown → media → PageData → serialize → truncate
- `rawfyFetch()` — full pipeline orchestrator
- `rawfyMetadata()` — lightweight metadata-only fetch

**Fetch Layer**
- Static HTTP fetch with URL validation, timeout, and user-agent
- JS-rendering detection (11 framework signatures)
- Playwright headless Chromium for SPAs (graceful fallback if not installed)
- Automatic strategy selection: static vs Playwright

**Extraction Layer**
- Readability.js-based content extraction
- HTML → Markdown conversion (Turndown + 9 custom rules)
- Metadata extraction (title, OG, JSON-LD, lang, word count, page type)
- Page type classification (article, product, search, docs, homepage, video)
- Interactive element detection (buttons, forms, inputs, selects, links)

**Media Pipeline**
- Image handling: 4-tier priority (alt → figcaption → OCR → Vision API)
- Video handling: YouTube/Vimeo embeds, transcript scraping, caption tracks
- Audio handling: metadata extraction, transcript link detection
- PDF handling: pdfjs-dist text extraction, metadata, deduplication

**Output Serializers**
- WSM format: YAML frontmatter + markdown body + media/interactive sections
- JSON format: structured, snake_case keys, null for missing fields
- Plain text: UPPERCASE headings, stripped formatting
- Token-aware truncation with configurable limits

**Interfaces**
- CLI: `rawfy fetch <url>`, `rawfy serve`, `rawfy api`, `rawfy install`, `rawfy version`
- MCP Server: stdio transport, `rawfy_fetch` + `rawfy_metadata` tools (Zod schemas)
- REST API: Hono-based, `/fetch`, `/metadata`, `/health`, `/version`, CORS
- Node.js library: full public API via `import { rawfyFetch } from 'rawfy'`
- Python wrapper: `from rawfy import fetch, metadata`

**Testing**
- 180 unit tests across 16 test files
- Type checking (tsc --noEmit)
- Linting (eslint)
- Formatting (prettier)

**Documentation**
- Agent integration guides: Claude Code, LangChain, Ollama, AntiGravity, subprocess
- Python wrapper README
- Full project README

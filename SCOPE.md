# SCOPE.md — WebScout v1 Scope Definition

## project name
WebScout — Universal Web Perception Skill

## version
v1.0.0 (MVP)

## one-line definition
a cross-platform CLI + MCP server that converts any URL into structured,
agent-readable markdown with described images, transcribed video, and
extracted metadata.

---

## in scope (v1)

### core fetch pipeline
- [x] HTTP/HTTPS fetch with proper user-agent, redirect handling, timeout
- [x] JS-rendered pages via Playwright headless (Chromium, installed locally)
- [x] automatic detection: static vs JS-rendered (decide which fetch mode)
- [x] Readability.js-based content extraction (removes nav, ads, footer, sidebar)
- [x] HTML → semantic markdown conversion (headings, lists, tables, code, blockquotes)
- [x] preserve hyperlinks as `[text](url)` in output
- [x] preserve code blocks with language detection
- [x] preserve tables as markdown tables

### media handling
- [x] images: extract alt text + src + surrounding context
- [x] images: optional OCR via tesseract-js for images with text
- [x] images: optional vision description via Anthropic API (claude-sonnet-4-6)
- [x] video: extract native captions/subtitles via DOM (YouTube, Vimeo, etc.)
- [x] video: metadata (title, duration, thumbnail description)
- [x] audio: detect and note presence, extract title/label if available
- [x] PDFs: detect PDF links, extract text via pdfjs-dist

### metadata extraction
- [x] page URL, canonical URL
- [x] page title, meta description
- [x] Open Graph metadata (og:title, og:type, og:description)
- [x] JSON-LD structured data (extract and inline)
- [x] language detection
- [x] estimated reading time
- [x] page type classification (article / product / search / docs / homepage / other)
- [x] interactive elements map (buttons, forms, inputs with labels)
- [x] fetch timestamp

### output formats
- [x] WebScout Markdown (WSM) — default, human + agent readable
- [x] JSON — structured, for programmatic agent consumption
- [x] plain text — stripped, minimal, for token-constrained contexts

### interfaces
- [x] CLI: `webscout fetch <url> [options]`
- [x] MCP server: `webscout serve` — stdio-based MCP protocol
- [x] local REST API: `webscout api --port 3000`
- [x] Node.js module: `import { fetch } from 'webscout'`
- [x] Python module: `from webscout import fetch`

### cross-platform
- [x] macOS (arm64 + x86_64)
- [x] Windows (x64)
- [x] Linux (x64, arm64)
- [x] install via npm: `npm install -g webscout-skill`
- [x] install via pip: `pip install webscout-skill`
- [x] install via single binary (pkg/PyInstaller)

### agent compatibility
- [x] Claude Code (via MCP or CLI subprocess)
- [x] OpenClaw (via CLI or REST)
- [x] AntiGravity CLI (via CLI or REST)
- [x] LangChain / LangGraph (via Python module)
- [x] AutoGen (via Python module)
- [x] Ollama tool-call agents (via REST)
- [x] any agent that can run a shell command or call HTTP

---

## out of scope (v1)

- [ ] authenticated / logged-in page fetching (no cookie session management)
- [ ] multi-page crawling (single URL only in v1)
- [ ] page interaction (clicking, form submission, scroll-triggered content)
- [ ] real-time page monitoring / diffing
- [ ] content caching layer
- [ ] browser extension variant
- [ ] mobile platforms (iOS, Android)
- [ ] CAPTCHA solving
- [ ] Tor / proxy routing
- [ ] PDF form filling
- [ ] downloading or storing media files
- [ ] rate limiting / politeness policies (agent's responsibility)

---

## constraints

| constraint          | value                                      |
|---------------------|--------------------------------------------|
| max output size     | 100,000 tokens (truncate with notice)      |
| default timeout     | 15s (fetch) + 10s (Playwright)             |
| image vision calls  | opt-in only, off by default                |
| video transcription | opt-in only, requires local Whisper or API |
| dependencies        | Node.js ≥18 OR Python ≥3.10               |
| Playwright browsers | Chromium only (smallest footprint)         |
| MCP protocol        | MCP spec 2025-03-26                        |

---

## success criteria for v1

1. `webscout fetch https://en.wikipedia.org/wiki/Neural_network` returns clean,
   structured markdown in under 5 seconds on a standard laptop
2. an AI agent using WebScout as an MCP tool can answer questions about any
   public webpage without needing any other browsing capability
3. works identically on macOS, Windows, and Linux with a single install command
4. zero configuration required for basic usage
5. plugs into Claude Code as an MCP server with one config line

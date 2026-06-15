# TECHSTACK.md — WebScout Technology Decisions

## language: TypeScript (Node.js)

**why TypeScript over Python:**
- single codebase for both CLI and MCP server (no dual-language maintenance)
- `npm install -g` is the lowest-friction install path for developer tools
- Playwright's Node SDK is more mature than the Python one
- Readability.js is a JS library — native integration, no port
- existing MCP SDKs (@modelcontextprotocol/sdk) are TypeScript-first

**Python module** will be a thin wrapper that shells out to the Node CLI or
calls the local REST API. not a reimplementation.

---

## fetch layer

### tier 1: undici (Node.js built-in HTTP)
- used for: static HTML pages (no JS required)
- why: built into Node 18+, fast, no extra dependency
- detection heuristic: if page has `<meta name="application-name">` or known
  JS frameworks (Next.js, React, Vue meta tags) → escalate to Playwright

### tier 2: Playwright (headless Chromium)
- used for: JS-rendered SPAs, pages with lazy-loaded content
- why: industry standard, cross-platform, handles modern web
- browser: Chromium only (smallest download, ~170MB)
- mode: headless, no GPU, no sandbox issues in CI
- install: `npx playwright install chromium` (one-time setup command)

### content extraction: @mozilla/readability
- the same library Firefox Reader Mode uses
- strips boilerplate (nav, footer, ads, cookie banners, sidebar)
- preserves article body, headings, lists, tables, code
- works on the DOM — runs inside Playwright's page context or via jsdom

### HTML → Markdown: turndown
- battle-tested HTML-to-Markdown converter
- custom rules for: tables, code blocks, images, links, blockquotes
- extended with webscout-specific rules for interactive elements

---

## media pipeline

### images
```
priority 1: alt attribute (instant, free)
priority 2: title + figcaption (instant, free)
priority 3: OCR via tesseract.js (local, ~2s, opt-in)
priority 4: Claude vision API (accurate, costs tokens, opt-in --vision flag)
```

### video
```
priority 1: native captions via TextTrack API (Playwright context)
priority 2: YouTube Data API v3 (if YouTube URL, gets transcript)
priority 3: yt-dlp subprocess (download + whisper local transcription, opt-in)
priority 4: video metadata only (title, duration, thumbnail)
```

### audio / podcasts
```
priority 1: transcript link in DOM (many podcasts embed RSS + transcript)
priority 2: audio metadata (title, duration, description)
```

### PDFs
```
tool: pdfjs-dist (Mozilla PDF.js)
runs in Node.js worker thread
extracts: text, headings, tables (best effort), metadata
```

---

## MCP server

### protocol: MCP 2025-03-26 spec
```
transport: stdio (default) — works with Claude Code, OpenClaw, any MCP client
transport: SSE (optional, --transport sse) — for HTTP-based MCP clients
```

### SDK: @modelcontextprotocol/sdk
- official Anthropic SDK
- handles JSON-RPC, tool registration, request routing

### tools exposed via MCP
```json
{
  "tools": [
    {
      "name": "webscout_fetch",
      "description": "Fetch a URL and return clean machine-readable content",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string" },
          "format": { "enum": ["markdown", "json", "text"], "default": "markdown" },
          "vision": { "type": "boolean", "default": false },
          "max_tokens": { "type": "number", "default": 50000 }
        },
        "required": ["url"]
      }
    },
    {
      "name": "webscout_metadata",
      "description": "Extract only metadata from a URL (fast, no content)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "url": { "type": "string" }
        },
        "required": ["url"]
      }
    }
  ]
}
```

---

## REST API

### framework: Hono
- tiny (14kb), fast, TypeScript-native
- runs on Node.js and Bun
- minimal overhead for a local-only API server

### endpoints
```
GET  /fetch?url=<url>&format=markdown
GET  /metadata?url=<url>
GET  /health
GET  /version
```

---

## CLI

### framework: Commander.js
- most widely used Node CLI framework
- subcommand support (`webscout fetch`, `webscout serve`, `webscout api`)
- auto-generates --help output

### commands
```
webscout fetch <url>              # fetch and print to stdout
  --format markdown|json|text     # output format (default: markdown)
  --vision                        # enable image vision descriptions
  --no-playwright                 # force static fetch only
  --max-tokens <n>                # truncate output (default: 50000)
  --out <file>                    # write to file instead of stdout

webscout serve                    # start MCP stdio server
  --transport sse                 # use SSE instead of stdio
  --port <n>                      # SSE port (default: 3100)

webscout api                      # start local REST API
  --port <n>                      # default: 3000

webscout install                  # install Playwright Chromium
webscout version                  # print version
```

---

## packaging and distribution

### npm package: webscout-skill
```json
{
  "name": "webscout-skill",
  "bin": { "webscout": "./dist/cli.js" },
  "engines": { "node": ">=18" }
}
```

### pip package: webscout-skill
- thin Python wrapper
- calls Node CLI via subprocess
- exposes `fetch(url, **options)` → dict

### single binary (optional, v1.1)
- tool: `pkg` (Node.js → self-contained binary)
- ships Chromium alongside binary
- download from GitHub Releases

---

## output format spec: WebScout Markdown (WSM)

```
---
url: <canonical url>
type: article|product|docs|search|homepage|other
fetched_at: <ISO 8601>
lang: <BCP 47>
reading_time_minutes: <number>
word_count: <number>
interactive_elements: <number>
og_title: <string>
og_description: <string>
---

<converted markdown body>

[IMAGE: <description> | src: <url>]
[VIDEO: <duration> | <title> | transcript: <text or "unavailable">]
[AUDIO: <title> | duration: <duration>]
[PDF: <title> | pages: <n> | text: <extracted>]
[BUTTON: <label> → <url or action>]
[FORM: <name> | fields: <field1>, <field2>]
```

---

## directory structure

```
webscout-skill/
├── src/
│   ├── cli.ts              # CLI entry point (Commander)
│   ├── server-mcp.ts       # MCP stdio server
│   ├── server-api.ts       # REST API (Hono)
│   ├── fetcher/
│   │   ├── index.ts        # fetch router (static vs Playwright)
│   │   ├── static.ts       # undici-based fetch
│   │   └── playwright.ts   # Playwright headless fetch
│   ├── extractor/
│   │   ├── readability.ts  # Readability.js wrapper
│   │   ├── metadata.ts     # meta, og, json-ld extraction
│   │   ├── interactive.ts  # buttons, forms, inputs
│   │   └── html-to-md.ts   # turndown + custom rules
│   ├── media/
│   │   ├── image.ts        # image alt/ocr/vision pipeline
│   │   ├── video.ts        # video captions/metadata
│   │   ├── audio.ts        # audio metadata
│   │   └── pdf.ts          # PDF text extraction
│   ├── output/
│   │   ├── wsm.ts          # WebScout Markdown serializer
│   │   ├── json.ts         # JSON output serializer
│   │   └── text.ts         # plain text serializer
│   └── utils/
│       ├── detect.ts       # static vs JS detection
│       ├── truncate.ts     # token-aware truncation
│       └── classify.ts     # page type classification
├── python/
│   ├── webscout/__init__.py
│   └── setup.py
├── tests/
│   ├── fixtures/           # saved HTML pages for testing
│   └── *.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## dependencies summary

| package                        | purpose                        | size    |
|-------------------------------|--------------------------------|---------|
| @modelcontextprotocol/sdk     | MCP server protocol            | ~50kb   |
| playwright                    | JS rendering (Chromium)        | ~5MB    |
| @mozilla/readability          | content extraction             | ~50kb   |
| turndown                      | HTML to Markdown               | ~30kb   |
| jsdom                         | DOM for static pages           | ~2MB    |
| pdfjs-dist                    | PDF text extraction            | ~1.5MB  |
| tesseract.js                  | local OCR (optional)           | ~8MB    |
| commander                     | CLI framework                  | ~100kb  |
| hono                          | REST API                       | ~14kb   |
| undici                        | HTTP client                    | built-in|
| zod                           | input validation               | ~50kb   |

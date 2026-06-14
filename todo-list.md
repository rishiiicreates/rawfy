# todo-list.md — WebScout Development Tasks

## legend
- [ ] not started
- [~] in progress
- [x] done
- [!] blocked / needs decision

---

## phase 0 — project setup

- [x] init npm package: `rawfy@0.1.0` (ESM, Node >=18)
- [x] configure TypeScript: `tsconfig.json` (strict, ESM, target ES2022, TS6 compat)
- [x] configure build: `tsup` (bundle CLI, MCP server, API server, library index)
- [x] add `.gitignore` (node_modules, dist, .env, chromium)
- [x] create `src/` directory structure (see TECHSTACK.md) — 24 modules
- [x] add eslint + prettier config (flat config, strict type-checked)
- [x] add vitest for testing (unit + integration separation)
- [x] write `package.json` scripts: build, dev, test, start:mcp, start:api, typecheck, lint, format
- [x] set up GitHub repo: `github.com/rishiiicreates/rawfy`
- [x] add GitHub Actions CI: test on ubuntu, macos, windows (×3 Node versions)

---

## phase 1 — fetch layer

- [x] implement `src/fetcher/static.ts`
  - [x] undici-based HTTP GET (Node.js built-in fetch)
  - [x] follow redirects (redirect: 'follow' + manual redirect-limit variant)
  - [x] set realistic User-Agent header (Chrome 125 on macOS)
  - [x] handle gzip/brotli decompression (automatic via fetch)
  - [x] timeout: 15 seconds (via AbortSignal.timeout)
  - [x] return: raw HTML string + response headers + final URL
  
- [x] implement `src/utils/detect.ts`
  - [x] parse HTML with lightweight regex heuristic
  - [x] detect: Next.js, React, Vue, Angular, Svelte, Gatsby, Nuxt, Remix, Ember
  - [x] detect: empty body (less than 500 chars of text)
  - [x] detect: app shell pattern (empty root div)
  - [x] conservative: framework + sparse content = Playwright, framework alone = SSR
  - [x] return: `{ needsPlaywright: boolean, reason: string }`

- [x] implement `src/fetcher/playwright.ts`
  - [x] launch Chromium headless (dynamic import for lazy loading)
  - [x] block: images, fonts, stylesheets (load faster)
  - [x] wait for: `networkidle` or 10s timeout
  - [x] extract full rendered HTML
  - [x] extract: native video captions via `textTracks` JS evaluation
  - [x] close browser after fetch (finally block)
  - [x] handle: navigation errors, SSL errors, timeout, not-installed

- [x] implement `src/fetcher/index.ts`
  - [x] route to static or Playwright based on detector
  - [x] expose unified `fetchPage(url, options)` function
  - [x] graceful fallback: Playwright failure → static result
  - [x] progress callbacks for CLI feedback

---

## phase 2 — extraction layer

- [x] implement `src/extractor/readability.ts`
  - [x] wrap @mozilla/readability
  - [x] create jsdom document from HTML (for static fetches)
  - [x] run Readability on document
  - [x] handle failure (non-article pages): fall back to full body extraction
  - [x] return: `{ title, content (HTML), excerpt, byline, siteName }`

- [x] implement `src/extractor/metadata.ts`
  - [x] extract: `<title>`, `<meta name="description">`
  - [x] extract all `<meta property="og:*">` tags
  - [x] extract all `<meta name="twitter:*">` tags (via OG fallback)
  - [x] find and parse `<script type="application/ld+json">` blocks
  - [x] detect page language: `<html lang>` or `content-language` header
  - [x] classify page type (via src/utils/classify.ts — JSON-LD → OG → URL → content)
  - [x] calculate word count and reading time
  - [x] return: full metadata object

- [x] implement `src/extractor/interactive.ts`
  - [x] find all `<button>` elements → extract label, type, aria-label
  - [x] find all `<form>` elements → extract name, action, fields
  - [x] find all `<input>` → extract type, name, placeholder, label
  - [x] find all `<select>` → extract name, options
  - [x] find all `<a>` with href → classify as navigation vs content link
  - [x] return: array of interactive elements with type + label + context

- [x] implement `src/extractor/html-to-md.ts`
  - [x] configure Turndown with:
    - [x] custom rule: `<img>` → `[IMAGE: {alt} | src: {src}]`
    - [x] custom rule: `<video>` → `[VIDEO: {metadata}]`
    - [x] custom rule: `<audio>` → `[AUDIO: {metadata}]`
    - [x] custom rule: `<figure>` → preserve with figcaption
    - [x] custom rule: `<details>/<summary>` → preserve
    - [x] custom rule: `<code>` → inline backticks
    - [x] custom rule: `<pre><code>` → fenced blocks with lang
    - [x] custom rule: `<table>` → proper markdown table (recursive node walk)
    - [x] standard: `<a>` → `[text](url)` keeping relative URLs resolved
  - [x] resolve relative URLs against base URL
  - [x] return: markdown string

---

## phase 3 — media pipeline

- [x] implement `src/media/image.ts`
  - [x] priority 1: return alt attribute if non-empty and meaningful
  - [x] priority 2: return title + figcaption if alt missing
  - [x] priority 3 (opt-in): run tesseract.js OCR on image URL
  - [x] priority 4 (opt-in --vision): call Anthropic API with image (claude-sonnet-4-6)
  - [x] format output: `[IMAGE: {description} | src: {url}]`
  - [x] tracking pixel filtering, placeholder alt detection

- [x] implement `src/media/video.ts`
  - [x] YouTube embed + page URL detection → oEmbed metadata + transcript scraping
  - [x] Vimeo embed extraction
  - [x] native `<video>` + `<source>` elements
  - [x] Playwright caption track integration
  - [x] format output: `[VIDEO: {duration} | "{title}" | transcript: {text|unavailable}]`

- [x] implement `src/media/audio.ts`
  - [x] extract audio element metadata (src, title, aria-label)
  - [x] nearby heading detection (DOM tree walk)
  - [x] transcript link detection (text + href matching)
  - [x] format output: `[AUDIO: "{title}" | {duration} | transcript: {text|unavailable}]`

- [x] implement `src/media/pdf.ts`
  - [x] detect PDF URLs in page links (.pdf, .pdf?, /pdf/)
  - [x] fetch and extract text with pdfjs-dist (dynamic import)
  - [x] PDF metadata (title from metadata or filename, page count)
  - [x] configurable limits (maxPdfs, maxPages), URL deduplication
  - [x] format output: `[PDF: "{title}" | {pages} pages | text: {extracted}]`

---

## phase 4 — output serializers

- [x] implement `src/output/wsm.ts`
  - [x] build YAML frontmatter from metadata
  - [x] combine with markdown body
  - [x] inject media element descriptions
  - [x] inject interactive elements section at end
  - [x] return: full WSM string

- [x] implement `src/output/json.ts`
  - [x] structured JSON output (snake_case keys)
  - [x] schema: `{ metadata, content, media[], interactive_elements[], fetch_stats }`

- [x] implement `src/output/text.ts`
  - [x] strip all markdown syntax
  - [x] keep: headings as UPPERCASE, links as `text (url)`
  - [x] strip: media placeholders, images, formatting
  - [x] return: minimal plain text

- [x] implement `src/utils/truncate.ts` (Phase 0)
  - [x] estimate token count (characters / 4)
  - [x] truncate at max_tokens with notice

- [x] implement `src/pipeline.ts`
  - [x] rawfyFetch() 7-stage orchestrator
  - [x] rawfyMetadata() lightweight fetch

---

## phase 5 — interfaces

- [x] implement `src/cli.ts`
  - [x] `rawfy fetch <url>` command + shorthand
  - [x] all flags: --format, --vision, --no-playwright, --max-tokens, --out
  - [x] pipe-friendly: exit 0/1, errors to stderr
  - [x] `rawfy serve` / `rawfy api` / `rawfy install` / `rawfy version`

- [x] implement `src/server-mcp.ts`
  - [x] McpServer high-level API + Zod schemas
  - [x] registerTool: `rawfy_fetch`, `rawfy_metadata`
  - [x] stdio transport + error handling

- [x] implement `src/server-api.ts`
  - [x] Hono + @hono/node-server
  - [x] GET /fetch, /metadata, /health, /version
  - [x] CORS headers

- [x] implement `src/index.ts` — full public API export surface

---

## phase 6 — python wrapper

- [ ] create `python/webscout/__init__.py`
  - [ ] `fetch(url, format="markdown", vision=False, max_tokens=50000)` function
  - [ ] detect Node.js and webscout CLI in PATH
  - [ ] subprocess call to `webscout fetch <url> --format json`
  - [ ] parse JSON, return dict
  - [ ] raise WebScoutError on failure

- [ ] create `python/setup.py` / `pyproject.toml`
  - [ ] package name: `webscout-skill`
  - [ ] post-install: check for Node.js, warn if not found
  - [ ] entry point: `webscout` (same CLI)

---

## phase 7 — agent integration guides

- [ ] write `docs/claude-code.md` — how to add as MCP server
- [ ] write `docs/openclaw.md` — how to use as subprocess tool
- [ ] write `docs/antigravity.md` — how to use with --mcp flag
- [ ] write `docs/langchain.md` — Python module usage in LangChain agent
- [ ] write `docs/ollama.md` — REST API usage with Ollama tool-call agents
- [ ] write `docs/shiro.md` — integrating into Shiro's tool registry

---

## phase 8 — testing

- [ ] unit tests: fetcher/static.ts
- [ ] unit tests: extractor/metadata.ts
- [ ] unit tests: extractor/html-to-md.ts
- [ ] unit tests: output/wsm.ts
- [ ] integration tests: Wikipedia article fetch
- [ ] integration tests: YouTube page (metadata only)
- [ ] integration tests: JS-rendered SPA (React page)
- [ ] integration tests: product page
- [ ] integration tests: documentation page
- [ ] e2e test: CLI fetch command
- [ ] e2e test: MCP server tool call
- [ ] e2e test: REST API /fetch endpoint
- [ ] cross-platform test: run CI on ubuntu-latest, macos-latest, windows-latest

---

## phase 9 — packaging and release

- [ ] build: `tsup` bundle for CLI + servers
- [ ] test `npm install -g rawfy` on fresh machine
- [ ] test `pip install rawfy` on fresh machine
- [ ] write `README.md` (install + quickstart + all commands)
- [ ] write `CHANGELOG.md`
- [ ] publish to npm: `npm publish`
- [ ] publish to PyPI: `twine upload`
- [ ] create GitHub Release with changelog
- [ ] optional: build single binary with `pkg`

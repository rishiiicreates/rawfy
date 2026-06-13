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

- [ ] implement `src/extractor/readability.ts`
  - [ ] wrap @mozilla/readability
  - [ ] create jsdom document from HTML (for static fetches)
  - [ ] run Readability on document
  - [ ] handle failure (non-article pages): fall back to full body extraction
  - [ ] return: `{ title, content (HTML), excerpt, byline, siteName }`

- [ ] implement `src/extractor/metadata.ts`
  - [ ] extract: `<title>`, `<meta name="description">`
  - [ ] extract all `<meta property="og:*">` tags
  - [ ] extract all `<meta name="twitter:*">` tags
  - [ ] find and parse `<script type="application/ld+json">` blocks
  - [ ] detect page language: `<html lang>` or `content-language` header
  - [ ] classify page type (see RESEARCH.md heuristics)
  - [ ] calculate word count and reading time
  - [ ] return: full metadata object

- [ ] implement `src/extractor/interactive.ts`
  - [ ] find all `<button>` elements → extract label, type, aria-label
  - [ ] find all `<form>` elements → extract name, action, fields
  - [ ] find all `<input>` → extract type, name, placeholder, label
  - [ ] find all `<select>` → extract name, options
  - [ ] find all `<a>` with href → classify as navigation vs content link
  - [ ] return: array of interactive elements with type + label + context

- [ ] implement `src/extractor/html-to-md.ts`
  - [ ] configure Turndown with:
    - [ ] custom rule: `<img>` → `[IMAGE: {alt} | src: {src}]`
    - [ ] custom rule: `<video>` → `[VIDEO: {metadata}]`
    - [ ] custom rule: `<audio>` → `[AUDIO: {metadata}]`
    - [ ] custom rule: `<figure>` → preserve with figcaption
    - [ ] custom rule: `<details>/<summary>` → preserve
    - [ ] custom rule: `<code>` → inline backticks
    - [ ] custom rule: `<pre><code>` → fenced blocks with lang
    - [ ] custom rule: `<table>` → proper markdown table
    - [ ] standard: `<a>` → `[text](url)` keeping relative URLs resolved
  - [ ] resolve relative URLs against base URL
  - [ ] return: markdown string

---

## phase 3 — media pipeline

- [ ] implement `src/media/image.ts`
  - [ ] priority 1: return alt attribute if non-empty and meaningful
  - [ ] priority 2: return title + figcaption if alt missing
  - [ ] priority 3 (opt-in): run tesseract.js OCR on image URL
  - [ ] priority 4 (opt-in --vision): call Anthropic API with image
  - [ ] format output: `[IMAGE: {description} | src: {url}]`

- [ ] implement `src/media/video.ts`
  - [ ] check if YouTube URL → fetch transcript via YouTube API or yt-dlp
  - [ ] check for native `<track kind="captions">` elements
  - [ ] extract video metadata: title, duration, description
  - [ ] format output: `[VIDEO: {duration} | "{title}" | transcript: {text|unavailable}]`

- [ ] implement `src/media/audio.ts`
  - [ ] extract audio element metadata
  - [ ] look for transcript link nearby in DOM
  - [ ] format output: `[AUDIO: "{title}" | {duration} | transcript: {text|unavailable}]`

- [ ] implement `src/media/pdf.ts`
  - [ ] detect PDF URLs in page links
  - [ ] fetch and extract text with pdfjs-dist
  - [ ] format output: `[PDF: "{title}" | {pages} pages | text: {extracted}]`

---

## phase 4 — output serializers

- [ ] implement `src/output/wsm.ts`
  - [ ] build YAML frontmatter from metadata
  - [ ] combine with markdown body
  - [ ] inject media element descriptions
  - [ ] inject interactive elements section at end
  - [ ] return: full WSM string

- [ ] implement `src/output/json.ts`
  - [ ] structured JSON output
  - [ ] schema: `{ metadata, content, media[], interactive_elements[], raw_markdown }`

- [ ] implement `src/output/text.ts`
  - [ ] strip all markdown syntax
  - [ ] keep: headings as UPPERCASE, links as `text (url)`
  - [ ] strip: media placeholders, images, formatting
  - [ ] return: minimal plain text

- [ ] implement `src/utils/truncate.ts`
  - [ ] estimate token count (characters / 4)
  - [ ] truncate at max_tokens with notice: `[TRUNCATED at {n} tokens]`

---

## phase 5 — interfaces

- [ ] implement `src/cli.ts`
  - [ ] `webscout fetch <url>` command
  - [ ] all flags: --format, --vision, --no-playwright, --max-tokens, --out
  - [ ] pipe-friendly: exit 0 on success, exit 1 on error, errors to stderr
  - [ ] `webscout serve` command → start MCP stdio server
  - [ ] `webscout api` command → start REST API
  - [ ] `webscout install` command → `npx playwright install chromium`
  - [ ] `webscout version` command

- [ ] implement `src/server-mcp.ts`
  - [ ] use @modelcontextprotocol/sdk Server class
  - [ ] register tool: `webscout_fetch`
  - [ ] register tool: `webscout_metadata`
  - [ ] implement stdio transport
  - [ ] implement SSE transport (--transport sse flag)
  - [ ] proper error responses in MCP format

- [ ] implement `src/server-api.ts`
  - [ ] Hono app
  - [ ] GET /fetch with url + format query params
  - [ ] GET /metadata with url query param
  - [ ] GET /health → `{ status: "ok", version }`
  - [ ] GET /version → `{ version }`
  - [ ] CORS headers (for browser-based agent UIs)

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
- [ ] test `npm install -g webscout-skill` on fresh machine
- [ ] test `pip install webscout-skill` on fresh machine
- [ ] write `README.md` (install + quickstart + all commands)
- [ ] write `CHANGELOG.md`
- [ ] publish to npm: `npm publish`
- [ ] publish to PyPI: `twine upload`
- [ ] create GitHub Release with changelog
- [ ] optional: build single binary with `pkg`

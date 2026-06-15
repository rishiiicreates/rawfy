# work-done.md — WebScout Progress Log

## status: pre-development (planning complete)

this file tracks completed work as the project progresses.
update after each session / PR merge.

---

## planning phase (completed)

| deliverable         | status   | notes                                          |
|--------------------|----------|------------------------------------------------|
| IDEAS.md           | ✓ done   | concept, differentiators, future roadmap        |
| SCOPE.md           | ✓ done   | v1 in/out scope, constraints, success criteria  |
| TECHSTACK.md       | ✓ done   | full tech decisions with rationale              |
| RESEARCH.md        | ✓ done   | competitor analysis, MCP notes, insights        |
| todo-list.md       | ✓ done   | granular tasks in phase order                   |
| workflow.md        | ✓ done   | dev loop, conventions, release checklist        |
| UI_UX.md           | ✓ done   | CLI design, WSM format spec, error UX           |
| AGENT_PROMPT.md    | ✓ done   | full Claude Code build prompt                   |
| work-done.md       | ✓ done   | this file                                       |

---

## development phase (not started)

### phase 0 — project setup
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| npm package init             | ✓ done      | —     | rawfy@0.1.0, ESM, Node >=18 |
| TypeScript config            | ✓ done      | —     | strict, ES2022, TS6 compat |
| tsup build config            | ✓ done      | —     | 4 entry points, DTS, sourcemaps |
| eslint + prettier            | ✓ done      | —     | flat config, strict type-checked |
| vitest setup                 | ✓ done      | —     | unit + integration separation |
| src/ directory structure     | ✓ done      | —     | 24 modules, matches TECHSTACK.md |
| types.ts (shared types)      | ✓ done      | —     | 180+ lines, full type registry |
| errors.ts (error factory)    | ✓ done      | —     | createError, wrapError, isRawfyError |
| truncate.ts (token util)     | ✓ done      | —     | estimateTokens, truncate |
| smoke tests (18 passing)     | ✓ done      | —     | errors + truncate tests |
| GitHub Actions CI            | ✓ done      | —     | 3 OS × 3 Node versions |
| git init + push              | ✓ done      | —     | dev branch → github.com/rishiiicreates/rawfy |

### phase 1 — fetch layer
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| static fetcher (undici)      | ✓ done      | —     | Node.js built-in fetch, URL validation, timeout, UA |
| JS detector heuristic        | ✓ done      | —     | 11 framework signatures, app shell detection |
| Playwright fetcher           | ✓ done      | —     | dynamic import, resource blocking, video captions |
| fetch router                 | ✓ done      | —     | graceful fallback, progress callbacks |
| tests (37 new)               | ✓ done      | —     | 55 total passing (detect: 13, static: 14, router: 10) |

### phase 2 — extraction layer
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| Readability wrapper          | ✓ done      | —     | @mozilla/readability + jsdom, body fallback |
| metadata extractor           | ✓ done      | —     | title, OG, JSON-LD, lang, word count, page type |
| page type classifier         | ✓ done      | —     | JSON-LD → OG → URL → content chain, 7 types |
| interactive element extractor| ✓ done      | —     | buttons, forms, inputs, selects, links |
| HTML → markdown converter    | ✓ done      | —     | Turndown + 9 custom rules |
| tests (60 new)               | ✓ done      | —     | 115 total (readability:7, metadata:17, interactive:13, md:23) |

### phase 3 — media pipeline
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| image handler                | ✓ done      | —     | alt → figcaption → OCR → Vision API, pixel filtering |
| video handler                | ✓ done      | —     | YouTube/Vimeo embeds, native video, transcript scraping |
| audio handler                | ✓ done      | —     | metadata, nearby heading, transcript link detection |
| PDF handler                  | ✓ done      | —     | pdfjs-dist text extraction, metadata, deduplication |
| tests (46 new)               | ✓ done      | —     | 161 total (image:14, video:12, audio:12, pdf:8) |

### phase 4 — output serializers
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| WSM serializer               | ✓ done      | —     | YAML frontmatter + markdown + media/interactive sections |
| JSON serializer              | ✓ done      | —     | snake_case keys, null for missing, pretty-printed |
| text serializer              | ✓ done      | —     | UPPERCASE headings, stripped formatting, bullets |
| token truncator              | ✓ done      | —     | Phase 0 implementation, 6 tests |
| pipeline orchestrator        | ✓ done      | —     | 7-stage rawfyFetch() + rawfyMetadata() |
| tests (19 new)               | ✓ done      | —     | 180 total (wsm:7, json:6, text:6) |

### phase 5 — interfaces
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| CLI                          | ✓ done      | —     | 5 commands, all flags, pipe-friendly, shorthand |
| MCP server (stdio)           | ✓ done      | —     | McpServer + Zod, rawfy_fetch + rawfy_metadata |
| REST API (Hono)              | ✓ done      | —     | /fetch, /metadata, /health, /version, CORS |
| public API exports           | ✓ done      | —     | full export surface in src/index.ts |

### phase 6 — python wrapper
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| Python module                | ✓ done      | —     | `rawfy.client`, subprocess integration |
| pyproject.toml               | ✓ done      | —     | setuptools config, `rawfy-py` entry point |

### phase 7 — docs
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| Claude Code MCP              | ✓ done      | —     | `docs/claude-code.md` |
| Subprocess API               | ✓ done      | —     | `docs/subprocess.md` |
| AntiGravity MCP              | ✓ done      | —     | `docs/antigravity.md` |
| LangChain/LangGraph          | ✓ done      | —     | `docs/langchain.md` |
| Ollama REST API              | ✓ done      | —     | `docs/ollama.md` |
| docs/shiro.md                | not started | —     | —     |

### phase 8 — testing
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| unit tests (extractors)      | not started | —     | —     |
| integration tests            | not started | —     | —     |
| cross-platform CI            | not started | —     | —     |

### phase 9 — release
| task                          | status      | PR    | notes |
|------------------------------|-------------|-------|-------|
| npm publish                  | not started | —     | —     |
| pip publish                  | not started | —     | —     |
| GitHub Release               | not started | —     | —     |

---

## session log

### 2026-06-13 — planning session
- created full project documentation suite
- defined WebScout Markdown (WSM) output format
- researched and documented all competing tools
- wrote Claude Code agent build prompt
- established cross-platform strategy (Node.js primary, Python wrapper)
- confirmed MCP as primary agent protocol

### 2026-06-13 — Phase 0 scaffold
- rebranded WebScout → Rawfy (CLI: rawfy, format: RFM, env: RAWFY_*)
- package name: rawfy (not rawfy-skill)
- initialized npm package with ESM, TypeScript 6.0 strict mode
- configured tsup with 4 entry points (cli, server-mcp, server-api, index)
- set up ESLint v9 flat config + Prettier
- set up Vitest with separate unit/integration configs
- created full src/ directory structure (24 stub modules)
- implemented src/types.ts — complete type registry (180+ lines)
- implemented src/utils/errors.ts — error factory (createError, wrapError, isRawfyError)
- implemented src/utils/truncate.ts — token estimation + truncation
- wrote 18 tests (errors: 12, truncate: 6) — all passing
- created GitHub Actions CI (3 OS × 3 Node versions)
- pushed to github.com/rishiiicreates/rawfy on dev branch
- verified: build ✅ typecheck ✅ tests ✅ lint ✅ format ✅

---

## known issues / blockers

none currently — project is in planning phase.

---

## decisions made

| decision                          | chosen              | alternatives considered      | reason                           |
|----------------------------------|---------------------|------------------------------|----------------------------------|
| primary language                 | TypeScript / Node   | Python, Go, Rust             | best MCP SDK, Readability native |
| fetch tier 1                     | undici              | node-fetch, axios            | built into Node 18+, fastest     |
| fetch tier 2                     | Playwright          | Puppeteer, Selenium          | cross-platform, maintained       |
| content extraction               | Readability.js      | custom parser, Cheerio       | battle-tested, Firefox-grade     |
| HTML→MD                          | Turndown            | remark, pandoc               | lightweight, extensible rules    |
| MCP transport default            | stdio               | SSE, WebSocket               | works everywhere, no port config |
| output format                    | WSM (custom MD)     | raw HTML, pure JSON          | agent-readable + human-readable  |
| CLI framework                    | Commander.js        | yargs, oclif                 | simplest, well-documented        |
| REST API                         | Hono                | Express, Fastify             | tiny, TypeScript-native          |
| package distribution             | npm + pip           | binary only, Docker          | lowest friction for developers   |

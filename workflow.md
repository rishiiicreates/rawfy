# workflow.md — WebScout Development Workflow

## branch strategy

```
main          → stable, released
dev           → integration branch (merge features here first)
feat/*        → new features
fix/*         → bug fixes
docs/*        → documentation only
```

never commit directly to `main`. always open a PR from `feat/*` → `dev` → `main`.

---

## commit convention

```
feat: add Playwright JS rendering support
fix: handle gzip decompression in static fetcher
docs: add Claude Code MCP setup guide
test: add Wikipedia integration test
chore: bump dependencies
refactor: split image pipeline into priority tiers
```

format: `<type>: <what changed in present tense, lowercase>`

---

## development loop

```bash
# 1. start in dev mode (watches src/, rebuilds on change)
npm run dev

# 2. test a specific URL during development
node dist/cli.js fetch https://en.wikipedia.org/wiki/Transformer_(deep_learning)

# 3. test as MCP server (pipe a tool call in)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"webscout_fetch","arguments":{"url":"https://example.com"}}}' | node dist/server-mcp.js

# 4. test REST API
npm run start:api
curl "http://localhost:3000/fetch?url=https://example.com"

# 5. run tests
npm test

# 6. build for release
npm run build
```

---

## adding a new content type handler

1. create `src/media/<type>.ts`
2. implement the handler interface:
   ```typescript
   export interface MediaHandler {
     detect(element: Element): boolean
     extract(element: Element, options: ExtractOptions): Promise<MediaResult>
     format(result: MediaResult): string
   }
   ```
3. register in `src/extractor/html-to-md.ts` custom rules
4. add tests in `tests/media/<type>.test.ts`
5. document in `TECHSTACK.md` under media pipeline

---

## adding a new output format

1. create `src/output/<format>.ts`
2. implement `serialize(page: PageData): string`
3. register in `src/output/index.ts`
4. add `--format <name>` to CLI options in `src/cli.ts`
5. add `format: <name>` to MCP tool input schema
6. add tests

---

## adding a new agent integration

1. create `docs/<agent-name>.md`
2. document: install, config file changes, example usage
3. test manually with that agent
4. add to README.md integrations table

---

## environment variables

```bash
ANTHROPIC_API_KEY=sk-...       # for --vision flag (image descriptions)
OPENAI_API_KEY=sk-...          # for Whisper API (optional video transcription)
YOUTUBE_API_KEY=AIza...        # for YouTube transcript API (optional)
WEBSCOUT_MAX_TOKENS=50000      # default token limit (overrides CLI default)
WEBSCOUT_TIMEOUT=15000         # fetch timeout in ms
WEBSCOUT_PORT=3000             # default REST API port
WEBSCOUT_MCP_PORT=3100         # default SSE MCP port
```

none of these are required. core functionality works with zero env vars.

---

## testing philosophy

### unit tests (vitest)
- test each module in isolation
- mock HTTP calls with `msw` (Mock Service Worker)
- mock Playwright with a fake page object
- 100% coverage target for: extractors, serializers, utils

### integration tests
- hit real URLs (Wikipedia, GitHub README, a simple static page)
- these are slow (3-10s each), run separately: `npm run test:integration`
- must pass on all 3 platforms in CI

### snapshot tests
- for output serializers: save expected WSM output for known inputs
- fail if output changes unexpectedly
- update with: `npm run test -- --update-snapshots`

---

## performance targets

| operation                  | target   | hard limit |
|---------------------------|----------|------------|
| static HTML fetch + parse | < 2s     | 5s         |
| Playwright fetch + parse  | < 8s     | 20s        |
| image OCR (tesseract)     | < 5s     | 15s        |
| image vision (API)        | < 10s    | 30s        |
| full Wikipedia article    | < 3s     | 8s         |
| MCP tool response         | < 15s    | 30s        |

measure with: `time webscout fetch <url>` on a standard laptop with 50Mbps internet.

---

## error handling conventions

all errors follow this structure:

```typescript
interface WebScoutError {
  code: string          // FETCH_TIMEOUT | PARSE_FAILED | INVALID_URL | ...
  message: string       // human readable
  url?: string          // the URL that failed
  details?: unknown     // raw error for debugging
}
```

CLI: print error to stderr as JSON, exit code 1
MCP: return error in MCP error response format
REST API: return `{ error: WebScoutError }` with appropriate HTTP status

never throw raw errors to the output. always wrap.

---

## release checklist

- [ ] all tests pass on ubuntu, macos, windows in CI
- [ ] version bumped in package.json + pyproject.toml
- [ ] CHANGELOG.md updated
- [ ] README.md quickstart tested on fresh machine
- [ ] `npm run build` succeeds
- [ ] `npm publish --dry-run` succeeds
- [ ] tag: `git tag v1.0.0 && git push --tags`
- [ ] publish: `npm publish`
- [ ] publish: `twine upload dist/*`
- [ ] GitHub Release created with changelog body

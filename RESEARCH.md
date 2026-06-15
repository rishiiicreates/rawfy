# RESEARCH.md — WebScout Prior Art and Research

## existing tools and what they lack

### Jina AI Reader (r.jina.ai)
- what it does: prepend `r.jina.ai/` to any URL, get markdown back
- strengths: dead simple, hosted, works instantly
- weaknesses:
  - external service dependency (your URLs go to their servers)
  - no media handling (images just disappear)
  - no interactive element mapping
  - no MCP protocol support
  - can't run locally / air-gapped
  - rate limited on free tier
- verdict: closest existing competitor but not agent-native

### Firecrawl
- what it does: hosted web scraping API + SDK
- strengths: good JS rendering, LLM-ready output, crawl mode
- weaknesses:
  - paid service, API key required
  - external dependency
  - not designed for local agent setups (Ollama/Shiro type)
  - no MCP server mode
  - no media enrichment
- verdict: good for production SaaS, wrong for local agent skills

### Browserbase
- what it does: cloud browser automation API
- strengths: full browser control, handles complex SPAs
- weaknesses: expensive, cloud-only, total overkill for read-only fetch
- verdict: too heavy for this use case

### curl + html2text
- what it does: raw HTML → stripped plaintext
- strengths: zero dependencies, works everywhere
- weaknesses:
  - no JS rendering (SPAs return empty shell)
  - no semantic structure preserved
  - images are just deleted
  - no metadata extraction
  - terrible output quality for agents
- verdict: baseline to beat, not a real solution

### Mozilla Readability.js alone
- what it does: extract article content from HTML
- strengths: battle-tested, used in Firefox Reader Mode
- weaknesses:
  - only works for article-type pages
  - input must already be rendered HTML (needs fetch layer)
  - no media handling
  - no output serialization
  - not a CLI or agent skill
- verdict: core ingredient, not a complete tool

### LangChain WebBaseLoader
- what it does: Python class that fetches + parses HTML for LangChain
- strengths: integrates natively with LangChain ecosystem
- weaknesses:
  - LangChain-only (not agent-agnostic)
  - no JS rendering
  - basic HTML stripping, not semantic extraction
  - no MCP protocol
  - Python only
- verdict: too ecosystem-specific

### Playwright MCP (Anthropic official)
- what it does: full browser control as MCP tools
- strengths: official, full browser automation
- weaknesses:
  - gives agent a "browser" not a "reader" — agent must navigate manually
  - no content distillation — agent still gets raw HTML or screenshots
  - heavyweight for simple read tasks
  - screenshot-based (burns vision tokens per page)
- verdict: complementary to WebScout, not a replacement — WebScout is for
  reading, Playwright MCP is for interacting

---

## key insights from research

### insight 1: the "perception gap"
there is no tool that specifically solves "give an AI agent a clean, complete,
semantic view of a webpage including its media." every tool either:
- gives raw HTML (too noisy)
- gives plain text (loses structure and media)
- gives screenshots (burns vision tokens, can't be searched)
- gives controlled browser (agent must do its own reading)

WebScout fills this gap with a focused "read and describe" primitive.

### insight 2: MCP is the right protocol
MCP (Model Context Protocol) is becoming the standard tool interface for AI agents.
Claude Code, OpenClaw, and most modern agent frameworks support it. building WebScout
as an MCP server first means zero integration work for any agent that speaks MCP.

### insight 3: format matters enormously
agents perform better when page content is formatted consistently and predictably.
a custom format (WSM) lets agents learn exactly what `[IMAGE: ...]` or `[VIDEO: ...]`
means rather than parsing inconsistent raw HTML attributes.

### insight 4: media is the hard part
~40-60% of meaningful web content is in images, videos, and interactive elements
that pure text scrapers miss entirely. handling media well is the real differentiator.

### insight 5: static vs JS split
roughly 60% of the open web is static HTML (Wikipedia, news, docs, blogs).
30% requires JS rendering (React/Next.js/Vue apps, Twitter, LinkedIn).
10% requires auth or interaction. optimizing for the 60% case (fast static fetch)
while handling the 30% case (Playwright) covers most agent browsing needs.

---

## MCP protocol notes

spec reference: https://modelcontextprotocol.io/specification/2025-03-26

### stdio transport (default)
- agent spawns `webscout serve` as a subprocess
- communicates via stdin/stdout JSON-RPC
- simplest setup, works with Claude Code out of the box

### claude code integration
```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "webscout": {
      "command": "webscout",
      "args": ["serve"]
    }
  }
}
```

### openclaw integration
OpenClaw uses a tool-call interface. WebScout can be registered as a subprocess tool:
```yaml
# openclaw config
tools:
  - name: webscout
    command: webscout fetch {url} --format json
    parse: json
```

### antigravity cli integration
AntiGravity supports MCP servers natively via its `--mcp` flag:
```
antigravity chat --mcp webscout serve
```

---

## page type classification heuristics

used to set the `type` field in WSM output:

| page type | detection signals                                          |
|-----------|------------------------------------------------------------|
| article   | article tag, og:type=article, JSON-LD NewsArticle/BlogPost |
| product   | og:type=product, price meta, add-to-cart button presence   |
| docs      | URL contains /docs/ /api/ /reference/, code blocks >3      |
| search    | URL contains ?q= or ?search=, list of result links         |
| homepage  | URL is bare domain root, no article/product signals        |
| video     | YouTube/Vimeo URL, og:type=video                           |
| other     | default fallback                                           |

---

## token budget research

average page content sizes after extraction:
| page type   | avg words | avg tokens (est.) |
|-------------|-----------|-------------------|
| news article| 800       | ~1,100            |
| Wikipedia   | 3,000     | ~4,200            |
| docs page   | 1,500     | ~2,100            |
| product page| 400       | ~600              |
| homepage    | 300       | ~450              |

default max_tokens: 50,000 — covers even very long pages with media descriptions.
agents can lower this if operating under tight context budgets.

---

## whisper integration notes

for video transcription (opt-in):
- local: `whisper` CLI via subprocess — requires user to install separately
- API: OpenAI Whisper API — requires API key, costs money
- fastest local option: `whisper-ctranslate2` (faster-whisper) — 4-8x speed improvement
- for v1: support local whisper CLI only, document how to install

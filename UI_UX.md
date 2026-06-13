# UI_UX.md — WebScout CLI + Output UX Design

## design philosophy

WebScout has two "users": the AI agent (reads the output) and the developer
(reads the terminal, debugs, configures). the UX must serve both.

for agents: output must be consistent, predictable, parseable, lossless.
for developers: CLI must be obvious, errors must be clear, feedback must be visible.

---

## CLI UX principles

### 1. pipe-friendly by default
```bash
webscout fetch https://example.com | head -50
webscout fetch https://example.com > page.md
webscout fetch https://example.com --format json | jq '.metadata.title'
```
- stdout: ONLY the extracted content
- stderr: progress, warnings, errors
- exit 0: success
- exit 1: any error

### 2. zero noise in output
when piped or redirected, no spinners, no progress bars, no banners.
when writing to a terminal (TTY), show a minimal progress indicator on stderr:

```
→ fetching https://example.com...
→ extracting content (readability)...
→ processing 3 images...
✓ done (1.2s, ~2400 tokens)
```

### 3. sensible defaults
- format: markdown (most useful for agents and humans)
- vision: off (don't spend API tokens without asking)
- playwright: auto-detect (don't make user decide)
- max-tokens: 50000 (large enough for any normal page)

### 4. options are additive
basic usage always works. advanced features are opt-in flags.
```bash
webscout fetch https://example.com                    # always works
webscout fetch https://example.com --vision           # add image AI
webscout fetch https://example.com --format json      # change format
```

---

## CLI help output design

```
webscout — web perception skill for AI agents

USAGE
  webscout fetch <url> [options]   fetch a URL and print machine-readable content
  webscout serve [options]         start MCP stdio server
  webscout api [options]           start local REST API
  webscout install                 install Playwright Chromium (first-time setup)
  webscout version                 print version and exit

FETCH OPTIONS
  --format <type>      output format: markdown (default), json, text
  --vision             enable AI image descriptions (requires ANTHROPIC_API_KEY)
  --no-playwright      skip JS rendering, static fetch only (faster)
  --max-tokens <n>     truncate output at n tokens (default: 50000)
  --out <file>         write output to file instead of stdout

SERVE OPTIONS
  --transport <type>   stdio (default) or sse
  --port <n>           port for SSE transport (default: 3100)

API OPTIONS
  --port <n>           port for REST API (default: 3000)

EXAMPLES
  webscout fetch https://en.wikipedia.org/wiki/Neural_network
  webscout fetch https://github.com/anthropics/anthropic-sdk --format json
  webscout fetch https://example.com --vision --out page.md
  webscout serve
  webscout api --port 4000

AGENT INTEGRATIONS
  Claude Code:   add to ~/.claude/claude_desktop_config.json (see docs/claude-code.md)
  OpenClaw:      register as subprocess tool (see docs/openclaw.md)
  AntiGravity:   webscout serve --transport sse (see docs/antigravity.md)
```

---

## output format design: WebScout Markdown (WSM)

### design goals
- a developer can read it and understand the page
- an agent can parse it without any format-specific instructions
- semantic tags (`[IMAGE: ...]`) are unambiguous and ctrl+F-able
- media elements don't break the markdown structure
- metadata is structured but stays in the output (not in a sidecar file)

### frontmatter spec
```yaml
---
url: https://example.com/article/neural-networks
canonical_url: https://example.com/article/neural-networks
type: article
fetched_at: 2026-06-13T10:22:00Z
lang: en
title: "Why Neural Networks Work"
description: "An introduction to feedforward networks"
word_count: 1240
reading_time_minutes: 5
interactive_elements: 2
og_type: article
og_image: https://example.com/og.jpg
---
```

### body: headings and text
standard markdown. headings become H1-H6. paragraphs are paragraphs.
nothing special here — agents already understand markdown perfectly.

### body: image elements
```
[IMAGE: A diagram showing 3 layers of neurons with weighted edges between them.
The input layer has 4 nodes, the hidden layer has 3 nodes, and the output layer
has 2 nodes. Caption: "Feedforward network architecture." | src: https://...]
```

short (alt text only):
```
[IMAGE: Feedforward network diagram | src: https://...]
```

### body: video elements
```
[VIDEO: 4m32s | "Backpropagation Explained Step by Step" | transcript:
"Welcome to this tutorial on backpropagation. In this video, we'll start
with a simple 2-layer network and show how gradients flow backwards..."]
```

no transcript available:
```
[VIDEO: 4m32s | "Backpropagation Explained" | transcript: unavailable]
```

### body: interactive elements section
always appended at the end of the WSM output:

```
---
## interactive elements

- [BUTTON] "Try the demo" → https://example.com/demo
- [BUTTON] "Download PDF" → javascript:void (non-navigable)
- [LINK] "Related paper: Attention Is All You Need" → https://arxiv.org/abs/1706.03762
- [FORM] "Newsletter signup" | fields: email (input), frequency (select: daily/weekly)
```

### body: code blocks
preserved exactly as in the page:
````
```python
import numpy as np

def sigmoid(x):
    return 1 / (1 + np.exp(-x))
```
````

### truncation notice
when content exceeds max_tokens:
```
[TRUNCATED: output exceeded 50,000 token limit. 12,400 tokens omitted.
use --max-tokens to increase limit or fetch a specific section.]
```

---

## JSON output schema

```json
{
  "metadata": {
    "url": "https://example.com/article",
    "canonical_url": "https://example.com/article",
    "type": "article",
    "fetched_at": "2026-06-13T10:22:00Z",
    "lang": "en",
    "title": "Why Neural Networks Work",
    "description": "An introduction to feedforward networks",
    "word_count": 1240,
    "reading_time_minutes": 5,
    "og": { "type": "article", "image": "...", "title": "..." },
    "json_ld": [{ "@type": "Article", "author": "...", "datePublished": "..." }]
  },
  "content": {
    "markdown": "# Why Neural Networks Work\n\n...",
    "text": "Why Neural Networks Work\n\n..."
  },
  "media": [
    {
      "type": "image",
      "src": "https://example.com/diagram.png",
      "alt": "Feedforward network diagram",
      "description": "A diagram showing...",
      "description_source": "alt_text | ocr | vision_api"
    },
    {
      "type": "video",
      "src": "https://youtube.com/watch?v=...",
      "title": "Backpropagation Explained",
      "duration_seconds": 272,
      "transcript": "Welcome to this tutorial..."
    }
  ],
  "interactive_elements": [
    { "type": "button", "label": "Try the demo", "href": "https://example.com/demo" },
    { "type": "form", "name": "Newsletter", "fields": ["email", "frequency"] }
  ],
  "fetch_stats": {
    "method": "playwright | static",
    "duration_ms": 1240,
    "estimated_tokens": 2400,
    "truncated": false
  }
}
```

---

## error output design

### CLI stderr (human-readable)
```
✗ webscout: failed to fetch https://example.com
  reason: FETCH_TIMEOUT — request exceeded 15s timeout
  tip: try --no-playwright for faster static fetch, or increase timeout with WEBSCOUT_TIMEOUT=30000
```

### MCP error response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "FETCH_TIMEOUT: request to https://example.com timed out after 15000ms",
    "data": { "url": "https://example.com", "code": "FETCH_TIMEOUT" }
  }
}
```

### REST API error response
```json
{
  "error": {
    "code": "FETCH_TIMEOUT",
    "message": "request to https://example.com timed out after 15000ms",
    "url": "https://example.com"
  }
}
```
HTTP status 504 for timeout, 400 for invalid URL, 500 for internal errors.

---

## first-run UX

on first `webscout fetch` call without Chromium installed:

```
webscout: Playwright Chromium not found.
run: webscout install
this downloads ~170MB of Chromium and is needed for JS-rendered pages.
alternatively, use --no-playwright to skip JS rendering (faster, works for static pages).

attempting static fetch instead...
```

then attempts static fetch and warns if page appears JS-rendered:
```
⚠ page appears to be JS-rendered (detected: Next.js). content may be incomplete.
   run `webscout install` then retry for full rendering.
```

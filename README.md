# Rawfy

**Universal web perception skill for AI agents** — converts any URL into structured, agent-readable content with described images, transcribed video, and interactive element maps.

Rawfy is **not** an AI agent. Rawfy is a tool that AI agents call.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What It Does

```
URL → Rawfy → Structured Agent-Readable Output
```

Rawfy fetches any web page and returns:
- **Clean Markdown** — extracted article content, no boilerplate
- **Described Images** — alt text, figcaptions, OCR, or Vision API descriptions
- **Video Transcripts** — YouTube/Vimeo auto-captions and native tracks
- **Audio Metadata** — titles, durations, transcript links
- **PDF Text** — extracted text from linked PDFs
- **Structured Metadata** — title, description, Open Graph, JSON-LD, page type
- **Interactive Element Map** — buttons, forms, inputs, links with labels

## Install

```bash
# Node.js (primary)
npm install -g rawfy

# Python wrapper
pip install rawfy

# Install Playwright for JS-rendered pages (optional)
rawfy install
```

## Quick Start

### CLI

```bash
# Fetch a page (default: markdown format)
rawfy fetch https://en.wikipedia.org/wiki/Neural_network

# Get structured JSON
rawfy fetch https://example.com --format json

# Plain text for constrained contexts
rawfy fetch https://example.com --format text

# Shorthand
rawfy https://example.com
```

### MCP Server (for Claude Code, etc.)

```bash
# Start MCP server
rawfy serve
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "rawfy": {
      "command": "rawfy",
      "args": ["serve"]
    }
  }
}
```

### REST API

```bash
# Start API server
rawfy api --port 3847

# Fetch a page
curl "http://localhost:3847/fetch?url=https://example.com"

# Get metadata only
curl "http://localhost:3847/metadata?url=https://example.com"
```

### Node.js Library

```typescript
import { rawfyFetch, rawfyMetadata } from 'rawfy'

// Full page fetch
const content = await rawfyFetch('https://example.com')

// JSON format
const json = await rawfyFetch('https://example.com', { format: 'json' })

// Metadata only (lightweight)
const meta = await rawfyMetadata('https://example.com')
```

### Python

```python
from rawfy import fetch, metadata

# Full page fetch
content = fetch("https://example.com")

# Structured data
data = fetch("https://example.com", format="json")

# Metadata only
meta = metadata("https://example.com")
```

## Output Formats

### WSM Markdown (default)

```yaml
---
url: https://example.com
type: article
title: "Example Article"
word_count: 1500
reading_time_minutes: 6
---

# Article Title

Content in clean markdown...

## Media

- [IMAGE: A sunset over mountains | src: /img/sunset.jpg]
- [VIDEO: "Tutorial" | transcript: First, open the settings...]

## Interactive Elements

### Buttons (2)
- Submit
- Cancel

### Links (15)
- [About](/about)
- [Contact](/contact)
```

### JSON

```json
{
  "metadata": { "url": "...", "title": "...", "type": "article" },
  "content": { "markdown": "...", "text": "..." },
  "media": [{ "type": "image", "src": "...", "description": "..." }],
  "interactive_elements": [{ "type": "button", "label": "Submit" }],
  "fetch_stats": { "method": "static", "duration_ms": 150 }
}
```

### Plain Text

```
EXAMPLE ARTICLE
Source: https://example.com

ARTICLE TITLE

Content as plain text...
```

## CLI Reference

```
rawfy fetch <url> [flags]     Fetch and process a URL
rawfy serve                   Start MCP stdio server
rawfy api [--port 3847]       Start local REST API
rawfy install                 Install Playwright Chromium
rawfy version                 Print version
rawfy --help                  Full help
```

### Fetch Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--format <fmt>` | `markdown` | `markdown`, `json`, or `text` |
| `--vision` | off | Enable Vision API for image descriptions |
| `--no-playwright` | off | Skip Playwright (faster, static only) |
| `--max-tokens <n>` | `50000` | Max output tokens |
| `--out <file>` | stdout | Write output to file |

## Agent Integration Guides

- [Claude Code (MCP)](docs/claude-code.md)
- [LangChain / LangGraph](docs/langchain.md)
- [Ollama (REST API)](docs/ollama.md)
- [AntiGravity SDK](docs/antigravity.md)
- [General Subprocess](docs/subprocess.md)

## Architecture

```
URL → fetchPage()
       ├─ Static HTTP fetch (fast, 60% of pages)
       └─ Playwright headless (JS-rendered SPAs)
            ↓
     extractReadability() → clean article HTML
     extractMetadata()    → title, OG, JSON-LD, page type
     extractInteractive() → buttons, forms, links
     htmlToMarkdown()     → Turndown + custom rules
            ↓
     extractImages()  → alt/figcaption/OCR/Vision
     extractVideos()  → YouTube/Vimeo transcripts
     extractAudio()   → metadata + transcript links
     extractPdfs()    → pdfjs-dist text extraction
            ↓
     serialize(format) → WSM | JSON | text
     truncate(maxTokens) → fit within budget
```

## Requirements

- **Node.js >= 18** (required)
- **Playwright Chromium** (optional, for JS-rendered pages)
- **Python >= 3.10** (optional, for Python wrapper)

## License

© [rishiiicreates](https://github.com/rishiiicreates)

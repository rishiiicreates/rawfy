# IDEAS.md — WebScout: Universal Web Perception Skill for AI Agents

## core concept

WebScout is a cross-platform, agent-agnostic CLI skill that converts any public URL into
clean, structured, machine-readable content. it acts as the "eyes" of any AI agent —
stripping away everything a human needs (layout, CSS, ads, media blobs) and replacing it
with everything an agent needs (semantic text, described images, transcribed audio, structured
metadata, interactive element maps).

---

## the problem it solves

AI agents cannot natively "read" a webpage the way a human does. they either get:
- raw HTML soup (too noisy, too large, full of layout junk)
- nothing (sites that require JS rendering return blank)
- broken context (images and videos are completely opaque to text-only agents)

existing tools like `curl` give raw HTML. browser extensions only work inside a browser.
web search APIs give snippets. none of them give an agent the full, clean picture of a page
in a format it can actually reason over.

---

## the core idea

a single CLI command:

```
webscout fetch https://example.com
```

returns:

```markdown
---
url: https://example.com/article
type: article
fetched_at: 2026-06-13T10:22:00Z
lang: en
reading_time_minutes: 4
interactive_elements: 3
---

# Why Neural Networks Work

[IMAGE: A 3-layer feedforward network diagram showing input → hidden → output nodes
with weighted edges. Caption: "Standard feedforward architecture."]

Neural networks learn by adjusting internal weights through backpropagation...

[VIDEO: 4m32s | "Backpropagation Explained" | transcript: "In this video we'll walk
through how gradients flow backwards through each layer..."]

| Layer    | Parameters | Activation |
|----------|-----------|------------|
| Input    | 784       | —          |
| Hidden   | 512       | ReLU       |
| Output   | 10        | Softmax    |

[BUTTON: "Try the demo" → https://example.com/demo]
[LINK: Related: "Attention Is All You Need" → https://arxiv.org/abs/1706.03762]
```

---

## key ideas and differentiators

### 1. agent-first, not human-first
every design decision optimizes for what an AI agent needs to reason well,
not what a human wants to read. compact, semantic, lossless where it matters.

### 2. universal agent protocol
outputs a standard format (WebScout Markdown / WSM) that any agent can parse.
no vendor lock-in. works with Claude Code, OpenClaw, AntiGravity CLI, LangChain,
AutoGen, raw Ollama setups, and anything else that reads text.

### 3. cross-platform, zero-browser-dependency
runs on macOS, Windows, Linux via Node.js or Python. no Chrome/Firefox required.
uses Playwright in headless mode only when JS rendering is needed, otherwise
falls back to lightweight HTTP fetch.

### 4. pluggable enrichment pipeline
each content type has a handler that can be swapped out:
- images: alt text → OCR (tesseract) → vision model (claude/gpt-4o)
- video: native captions → whisper transcription → summary
- audio: whisper → transcript
- PDFs: pdfplumber → structured text
- tables: preserved as markdown tables
- code blocks: preserved with language tags

### 5. skill protocol compatibility
exposes itself as:
- a CLI tool (`webscout fetch <url>`)
- an MCP server (`webscout serve` → stdio MCP)
- a REST API (`webscout api` → local HTTP)
- a Python/Node importable module

this means it plugs into any agent framework without modification.

---

## future ideas (post-v1)

- `webscout crawl <url> --depth 2` — multi-page crawl with link graph
- `webscout watch <url> --interval 60` — diff-aware page monitoring for agents
- `webscout auth` — session-aware fetching (cookie injection for authenticated pages)
- `webscout cache` — local content cache with TTL so agents don't refetch
- `webscout diff <url>` — compare current page state vs cached version
- `webscout search <query>` — search + fetch top N results in one call
- Shiro integration — plug directly into Shiro's tool registry as a named skill

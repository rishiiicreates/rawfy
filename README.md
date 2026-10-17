# Rawfy 🌐

**Universal web perception engine for AI agents** — converts any URL or raw DOM into structured, agent-readable Web Semantic Markdown (WSM), clean JSON, or text with described media and interactive element maps.

Rawfy is **not** an AI agent. Rawfy is the high-performance perception tool that autonomous agents (Claude Desktop, Cursor, AntiGravity, LangChain) call to see the web without token waste, boilerplate, or broken formatting.

[![Rust 2021](https://img.shields.io/badge/Rust-2021%20edition-orange?logo=rust)](https://www.rust-lang.org)
[![Astral uv](https://img.shields.io/badge/Distributed%20via-Astral%20uv-blue?logo=python)](https://github.com/astral-sh/uv)
[![MCP Spec](https://img.shields.io/badge/Protocol-MCP%202024--11--05-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ⚡ Instant Run via Astral `uvx`

No compilation or manual environment setup needed. If you have Astral's [`uv`](https://github.com/astral-sh/uv) installed, run Rawfy directly:

```bash
# Fetch and convert any URL to clean Web Semantic Markdown
uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)

# Structured JSON output for programmatic pipelines
uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy -f json -q https://example.com

# Save directly to a file (creates parent directories automatically)
uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy -q -o out/article.md https://paulgraham.com/greatwork.html

# Pipe URLs from standard input
echo "https://news.ycombinator.com" | uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy -q
```

To install Rawfy as a persistent global tool via `uv`:
```bash
uv tool install "git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python"
rawfy --help
```

---

## 🧠 Install as an AI Agent Skill (AGY, Claude Code, Codex)

To install Rawfy directly into your AI agent runtimes with a single command:

```bash
# Recommended: one-line cross-platform installer via Astral uvx (macOS, Linux & Windows)
uvx --from git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python rawfy --install-skill

# Or if you already installed rawfy globally
rawfy --install-skill
```

Alternative methods:
```bash
# Via curl / bash
curl -fsSL https://raw.githubusercontent.com/rishiiicreates/rawfy/main/install-skill.sh | bash

# Via Windows PowerShell
irm https://raw.githubusercontent.com/rishiiicreates/rawfy/main/install-skill.ps1 | iex

# Via universal skills CLI
npx -y skills add rishiicreates/rawfy
```

This installs the skill directly into `~/.agents/skills/rawfy/` and `~/.claude/skills/rawfy/`. Autonomous agents running in Antigravity, Claude Code, Codex, and Gemini CLI will automatically discover and trigger Rawfy whenever asked to fetch or parse a webpage.

---

## 🌟 Key Capabilities

1. **Sub-100ms Native Rust Engine**
   Built in Rust (`rawfy-core` and `rawfy-cli`) with `reqwest`, `scraper`, and `html2md`. Parses heavy pages in single-digit milliseconds with zero memory overhead.

2. **Smart Web Perception & Anti-Noise Sanitization**
   - **Unified Git Diffs**: Translates GitHub commit tables into syntax-highlighted ````diff` blocks with `+` and `-` markers instead of 3-column table noise.
   - **Wikipedia Language Bar Elimination**: Strips personal tools, search chrome, and 70+ language links automatically.
   - **Heading Anchor Sanitization**: Removes Hugo/Setext and ATX permalink anchors (`[#]`, `[§]`, `[¶]`) and trailing hashes.
   - **Code Block Language Tagging**: Strips `<font>` and `<span>` terminal color styling and preserves language identifiers (`js`, `rust`, `python`, `bash`).
   - **Accurate Word Count & Reading Time**: Calculates metrics on extracted plain text rather than raw markup.

3. **Media & Multimodal Perception**
   - **YouTube & Video Embeds**: Extracts YouTube watch, embed, shorts, and Vimeo embeds. Automatically fetches oEmbed metadata and timed-text transcripts.
   - **Image Filtering**: Suppresses tracking pixels, 1x1 gifs, Wikimedia wordmarks, and small UI icons (<32px). Captures rich `alt` text and parent `<figcaption>` context.
   - **Vision AI Support**: Optional multi-provider Vision fallback (Gemini 2.5 Flash, GPT-4o-mini, Claude 3.5 Haiku) for images without alt text.

4. **Interactive Element Mapping**
   Extracts buttons, forms, text inputs, selects, and links with ARIA labels so autonomous agents can navigate and plan browser actions.

5. **Dual Protocol Architecture (MCP + REST)**
   - **MCP stdio Server**: Native Model Context Protocol server (`rawfy serve`) implementing the 2024-11-05 specification for Claude Desktop and agent IDEs.
   - **Axum REST API**: Local high-throughput HTTP server (`rawfy api`) with connection reuse, sub-millisecond offline extraction, and `x-response-time-ms` observability headers.

---

## 🛠 Native Rust Engine

To build the native binary locally:

```bash
# Clone the repository
git clone https://github.com/rishiiicreates/rawfy.git
cd rawfy

# Run all 57 integration and unit tests
cargo test --workspace

# Compile optimized release binary
cargo build --release --workspace

# Fetch a URL with the native binary
./target/release/rawfy -q https://example.com

# Start the native MCP stdio server
./target/release/rawfy serve

# Start the native Axum REST API server
./target/release/rawfy api --port 3847
```

---

## 🤖 Model Context Protocol (MCP) Server

Rawfy acts as a native MCP server over `stdio`, exposing three tools:
- `rawfy_fetch`: Fetches any URL and extracts clean WSM markdown or structured JSON.
- `rawfy_metadata`: Extracts page metadata, OpenGraph, JSON-LD, and reading metrics.
- `rawfy_extract`: Parses raw HTML offline with zero network latency.

### Claude Desktop Configuration
Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rawfy": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python",
        "rawfy",
        "serve"
      ]
    }
  }
}
```

Or point directly to your compiled release binary:
```json
{
  "mcpServers": {
    "rawfy": {
      "command": "/absolute/path/to/rawfy/target/release/rawfy",
      "args": ["serve"]
    }
  }
}
```

---

## 🌐 Local REST API Server

For agent runtimes using HTTP tool calling (Ollama, local Python agents, LangChain):

```bash
rawfy api --port 3847
```

### Endpoints
- `GET /health` — Health and engine status
- `GET /version` — Version info
- `GET /fetch?url=...&format=markdown` — Fetch URL as clean Markdown
- `POST /fetch` — JSON body `{"url": "...", "format": "json"}`
- `POST /metadata` — Extract page metadata and OpenGraph tags
- `POST /extract` — Parse offline HTML snippets `{"html": "<div>...</div>"}`

All endpoints emit standard `x-response-time-ms` headers for agent latency monitoring.

---

## 🐍 Python SDK Integration

Add Rawfy to your Python project using `uv`:

```bash
uv add "git+https://github.com/rishiiicreates/rawfy.git#subdirectory=python"
```

```python
from rawfy import fetch, fetch_json, metadata

# 1. Fetch clean Markdown
markdown_text = fetch("https://example.com")
print(markdown_text)

# 2. Fetch structured dictionary (snake_case)
data = fetch_json("https://example.com")
print(data["metadata"]["word_count"])
print(data["content"]["markdown"])

# 3. Extract metadata only
meta = metadata("https://example.com")
print(meta.title, meta.reading_time_minutes)
```

The Python wrapper automatically detects and delegates to the native Rust binary if present, falling back to a pure Python pipeline (`httpx` + `readability-lxml` + `markdownify`) if no native binary is found. You can force pure Python mode at any time with `RAWFY_FORCE_PYTHON=1`.

---

## 📄 Output Formats

### 1. Web Semantic Markdown (WSM) `[-f markdown]`
Includes YAML frontmatter, pure Markdown body, and fetch stats footer.

```markdown
---
url: https://example.com/
type: homepage
fetched_at: 2026-10-16T03:30:48.807484+00:00
lang: en
title: "Example Domain"
word_count: 25
reading_time_minutes: 1
interactive_elements: 0
media_count: 0
---

This domain is for use in documentation examples without needing permission...

---
_Rawfy fetch stats:_
- method: static
- Duration: 79ms
- Estimated tokens: 39
```

### 2. Structured JSON `[-f json]`
```json
{
  "metadata": {
    "url": "https://example.com/",
    "type": "homepage",
    "title": "Example Domain",
    "word_count": 25,
    "reading_time_minutes": 1,
    "interactive_element_count": 0
  },
  "content": {
    "markdown": "...",
    "text": "...",
    "html": "..."
  },
  "media": [],
  "interactive_elements": [],
  "fetch_stats": {
    "method": "static",
    "duration_ms": 78,
    "estimated_tokens": 39,
    "truncated": false
  }
}
```

---

## 🤝 Contributing

1. Fork the repository.
2. Verify tests pass: `cargo test --workspace`
3. Check formatting: `cargo fmt --check`
4. Submit a Pull Request.

## License

MIT © [Hrishikesh Yadav (@rishiiicreates)](https://github.com/rishiiicreates)

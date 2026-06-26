# Rawfy 🌐

**Universal web perception skill for AI agents** — converts any URL into structured, agent-readable content with described images, transcribed video, and interactive element maps.

Rawfy is **not** an AI agent. Rawfy is a tool that AI agents call to see the web clearly.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)](https://nodejs.org)

---

## The Problem 🚨

AI Agents struggle to read the web. 
- Passing raw HTML to an LLM destroys its context window.
- Simple scraping tools miss client-side rendered Single Page Apps (SPAs).
- Important information hidden in images, YouTube embeds, or PDFs is completely lost.
- Interactive elements (forms, buttons, inputs) are stripped away, making it impossible for agents to navigate.

## The Solution ✅

**Rawfy** acts as the perception layer between the wild web and your AI agent. It fetches a page, automatically decides whether to use static HTTP or headless Playwright, extracts the true content using Readability, and serializes it into an agent-friendly format like JSON or WSM (Web Semantic Markdown).

---

## 🌟 Key Features

1. **Smart Fetching Strategy**
   Rawfy analyzes the target URL. If the page is a standard static document, it uses lightning-fast HTTP fetching. If it detects a JS-heavy framework (React, Vue, Next.js, Angular), it automatically boots up a headless Chromium browser via Playwright to ensure the content is fully rendered before extraction.

2. **Pristine Markdown Output**
   Rawfy strips away navigation bars, footers, ads, and boilerplate, leaving only the core content formatted perfectly in Markdown. 

3. **Media Perception**
   - **Images:** Extracts `alt` text and `<figcaption>` automatically. (Vision API support can be enabled to describe images without alt text).
   - **Videos:** Automatically detects YouTube and Vimeo embeds and fetches their text transcripts or closed-captions to pass to the agent.
   - **Audio:** Grabs metadata and podcast transcript links.
   - **PDFs:** If a link points directly to a PDF, Rawfy uses `pdfjs-dist` to extract the text seamlessly.

4. **Interactive Element Mapping**
   Rawfy maps the UI of the page. It returns a structured list of buttons, forms, text inputs, and important links. This allows autonomous agents to know exactly what elements they can interact with.

5. **Built for Agents (MCP & REST)**
   Rawfy runs locally as an MCP (Model Context Protocol) server or a REST API, allowing immediate plug-and-play with frameworks like LangChain, Claude Code, Ollama, and Google AntiGravity.

---

## 📦 Installation

### Node.js (Primary CLI & Server)
```bash
# Install globally
npm install -g rawfy

# Install Playwright browsers (Required for rendering SPAs)
rawfy install
```

### Python Wrapper
If you're building agents in Python, you can install the wrapper. It automatically finds the Node.js CLI under the hood.
```bash
pip install .
```

---

## 🚀 Quick Start & Usage

### 1. Command Line Interface (CLI)

The CLI is the easiest way to test Rawfy.

```bash
# Fetch a page and return Markdown (default)
rawfy fetch https://en.wikipedia.org/wiki/Neural_network

# Fetch and return structured JSON
rawfy fetch https://example.com --format json

# Fast mode (Skip Playwright, only use static fetch)
rawfy fetch https://example.com --no-playwright

# Save output to a file
rawfy fetch https://example.com --out result.md
```

### 2. Model Context Protocol (MCP) Server

Rawfy can run as an MCP server, communicating over `stdio`. This allows Claude Desktop or AntiGravity to use Rawfy natively.

```bash
rawfy serve
```

**Adding to Claude Desktop Config:**
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

### 3. REST API

If your agent framework only supports HTTP tool calls (like Ollama), run the REST API.

```bash
# Starts API on port 3847
rawfy api --port 3847
```
```bash
# Example API Call
curl "http://localhost:3847/fetch?url=https://example.com&format=json"
```

### 4. Node.js / TypeScript Library

```typescript
import { rawfyFetch, rawfyMetadata } from 'rawfy'

// Fetch full page as JSON
const jsonOutput = await rawfyFetch('https://example.com', { 
  format: 'json',
  noPlaywright: false 
})

// Fetch lightweight metadata only (No page body)
const metadata = await rawfyMetadata('https://example.com')
console.log(metadata.title, metadata.type)
```

### 5. Python Integration

```python
from rawfy import fetch, fetch_json, metadata

# Get Markdown string
markdown_text = fetch("https://example.com")

# Get parsed Python Dictionary
data = fetch_json("https://example.com")
print(data["content"]["markdown"])

# Get fast metadata
meta = metadata("https://example.com")
```

---

## 📄 Output Formats

Agents consume data differently. Rawfy supports three formats using the `--format` flag.

### 1. Web Semantic Markdown (WSM) `[--format markdown]`
The best format for LLMs. Includes YAML metadata, pure Markdown body, and media/interactive lists appended to the bottom.

```yaml
---
url: https://example.com
type: article
title: "Example Domain"
word_count: 50
---

# Example Domain

This domain is for use in illustrative examples...

## Interactive Elements
### Links (1)
- [More information...](https://www.iana.org/domains/example)
```

### 2. Structured JSON `[--format json]`
Best for strict programmatic parsing or function-calling agents.

```json
{
  "metadata": {
    "url": "https://example.com",
    "title": "Example Domain",
    "type": "website"
  },
  "content": {
    "markdown": "# Example Domain\n...",
    "text": "Example Domain\n..."
  },
  "media": [],
  "interactive_elements": [
    { "type": "link", "label": "More information...", "href": "..." }
  ]
}
```

### 3. Plain Text `[--format text]`
Best for agents with extremely small context windows. Strips all Markdown formatting and UPPERCASES headings for simple visual structure.

---

## 📚 Detailed Integration Guides

Check out our specific guides for your favorite framework:
- [Claude Code (MCP)](docs/claude-code.md)
- [LangChain & LangGraph (Python)](docs/langchain.md)
- [Ollama (REST API)](docs/ollama.md)
- [Google AntiGravity SDK](docs/antigravity.md)
- [Subprocess / Generic](docs/subprocess.md)

---

## 🏗 Architecture Under the Hood

Rawfy operates through a linear, 7-stage pipeline:

1. **Routing Layer**: Determines if the URL is a PDF, YouTube video, or HTML page.
2. **Fetch Layer**: Attempts static HTTP (`node-fetch`). If a JS framework signature is found, it transparently falls back to Playwright headless.
3. **Extraction Layer**: Uses Mozilla Readability to clean DOM trees.
4. **Markdown Conversion**: Uses Turndown with custom rules to preserve tables and code blocks.
5. **Media Parsing**: Isolates audio, video, and images. Grabs YouTube captions if available.
6. **Interaction Mapping**: Scans the DOM for `<button>`, `<a>`, `<input>`, `<select>`.
7. **Serialization & Truncation**: Packs everything into the requested format and strictly truncates to token limits (default 50k tokens) to prevent agent crashes.

---

## 🤝 Contributing

Contributions are welcome! If you want to add new extractors (e.g., specific Twitter or Reddit parsing) or optimize the fetch layer:
1. Fork the repo.
2. Run `npm install` and `npm run dev` to watch files.
3. Write tests in the `tests/` directory (Run with `npm test`).
4. Submit a Pull Request!

## License

© [rishiiicreates](https://github.com/rishiiicreates)

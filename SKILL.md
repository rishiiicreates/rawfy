---
name: rawfy
description: >
  Use this skill whenever the user wants to extract content from a URL, convert
  a webpage to Markdown, fetch structured data from a site, scrape clean text
  for an AI agent, turn a URL into machine-readable content, or use Rawfy as
  part of an agentic pipeline. Triggers on phrases like "fetch this URL",
  "extract content from", "scrape this page", "convert URL to markdown",
  "get the text from this website", or any time a URL needs to become structured
  data for downstream processing. Also use when the user wants to set up Rawfy
  as an MCP server tool, call it from a Node.js agent, or integrate it into a
  REST-based workflow.
---

# Rawfy Skill

## 1. What is Rawfy

Rawfy is a universal agent skill / content extraction layer that takes any URL and returns clean, structured, machine-readable output (Markdown, JSON, plain text). It handles JavaScript-rendered pages, PDFs, article extraction, metadata, and link maps. The tool ships with four interfaces: a CLI, an MCP server, a REST API, and a Node.js library (plus a Python wrapper).

## 2. Interface Selection Guide

| Context | Use |
| --- | --- |
| Agent terminal session | CLI (`rawfy <url>`) |
| Agentic loop using MCP | MCP server tool call |
| External service / microservice calling it | REST API |
| Node.js agent or script | Node.js SDK |
| Python agent | Python wrapper |

## 3. Quick Start per Interface

**CLI**
```bash
# Minimal
npx rawfy https://example.com

# With output format flag
npx rawfy https://example.com --format markdown

# Pipe into another tool
npx rawfy https://example.com --format json | jq '.content'
```

**MCP Server**
```json
// MCP tool call (in agentic context)
{
  "tool": "rawfy_fetch",
  "input": {
    "url": "https://example.com",
    "format": "markdown"
  }
}
```

**Node.js SDK**
```javascript
// Node.js
import { rawfy } from 'rawfy';
const result = await rawfy('https://example.com', { format: 'markdown' });
console.log(result.content);
```

**REST API**
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "markdown"}'
```

## 4. Output Shape

```json
{
  "url": "https://...",
  "title": "...",
  "content": "...",       // extracted body in requested format
  "metadata": { ... },
  "links": [ ... ],
  "format": "markdown"
}
```

## 5. Common Patterns in Agentic Workflows

- **Research agent**: fetch → extract markdown → pass to summariser
- **Link crawler**: fetch → extract links array → loop over links
- **Structured data extraction**: fetch with JSON format → parse → store

## 6. Error Handling

- **URL unreachable / timeout** → retry once, then surface error
- **JS-heavy SPA returns empty content** → suggest `--js` or `--wait` flag
- **PDF URL** → rawfy handles it natively, no special flag needed
- **Rate limiting / 429** → back off and retry

## 7. When NOT to use Rawfy

- Internal file paths (use bash cat / read instead)
- APIs returning JSON directly (call the API endpoint, skip Rawfy)
- Already-extracted content in context (no need to re-fetch)

## 8. Reference Pointers

- For full CLI flags: see `references/cli-usage.md`
- For MCP server config: see `references/mcp-usage.md`
- For REST endpoints: see `references/api-usage.md`
- For Node.js SDK: see `references/node-sdk-usage.md`

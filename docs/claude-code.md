# Using Rawfy with Claude Code

Rawfy integrates with Claude Code as an MCP server, giving Claude the ability
to fetch and understand any web page.

## Setup

### 1. Install Rawfy

```bash
npm install -g @rishiicreates/rawfy
```

### 2. Add to Claude Code MCP config

Add Rawfy to your Claude Code MCP server configuration:

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

This goes in your Claude Code settings file (usually `~/.claude/mcp_servers.json`
or configured via the Claude Code UI).

### 3. Install Playwright (optional)

For JS-rendered pages (SPAs, React sites, etc.):

```bash
rawfy install
```

## Available Tools

Once configured, Claude Code will have access to:

### `rawfy_fetch`

Fetch and process any URL into structured markdown.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL to fetch |
| `format` | `"markdown"` \| `"json"` \| `"text"` | `"markdown"` | Output format |
| `vision` | boolean | `false` | Enable image descriptions via Vision API |
| `no_playwright` | boolean | `false` | Skip browser rendering |
| `max_tokens` | number | `50000` | Max output size |

### `rawfy_metadata`

Lightweight metadata fetch (no media extraction).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL to fetch |
| `no_playwright` | boolean | `false` | Skip browser rendering |

## Example Prompts

Once Rawfy is connected, you can ask Claude:

- *"Read https://docs.python.org/3/library/asyncio.html and explain the key concepts"*
- *"What does the landing page of https://example.com look like?"*
- *"Summarize the article at https://blog.example.com/post"*
- *"Compare the pricing pages of these two services: [url1] [url2]"*

## Troubleshooting

**"rawfy: command not found"**
Make sure rawfy is installed globally: `npm install -g @rishiicreates/rawfy`

**"Playwright not installed"**
Run `rawfy install` to install Chromium for JS-rendered pages.

**Timeout errors**
Some pages take longer to load. The default timeout is 15 seconds.
Use `no_playwright: true` for faster static-only fetching.

# Using Rawfy with AntiGravity SDK

Rawfy can be used as a tool in Google AntiGravity agents via the
MCP server or REST API.

## Setup

```bash
npm install -g @rishiicreates/rawfy
rawfy install  # optional: install Playwright for JS pages
```

## MCP Integration

Add Rawfy as an MCP server in your AntiGravity agent configuration:

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

The agent will automatically discover `rawfy_fetch` and `rawfy_metadata`
tools via MCP tool listing.

## REST API Integration

For agents using HTTP tool calling:

```bash
# Start the API server
rawfy api --port 3847
```

Then configure your agent to call:

```
GET http://localhost:3847/fetch?url={url}&format=markdown
GET http://localhost:3847/metadata?url={url}
```

## CLI Integration

For agents that use subprocess tool calling:

```bash
rawfy fetch <url> --format json
```

The agent can parse the structured JSON output directly.

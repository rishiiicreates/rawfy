# MCP Server Usage Reference

## Adding Rawfy to an Agent
Add this configuration to your `.mcp.json` or MCP config block:
```json
{
  "mcpServers": {
    "rawfy": {
      "command": "npx",
      "args": ["-y", "rawfy", "mcp"]
    }
  }
}
```

## Tool Definitions

### `rawfy_fetch`
Extracts content from a single URL.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "url": { "type": "string", "description": "URL to extract" },
    "format": { "type": "string", "enum": ["markdown", "json", "text", "html"] },
    "js": { "type": "boolean", "description": "Enable headless browser" },
    "wait": { "type": "integer", "description": "Wait time in ms for JS" }
  },
  "required": ["url"]
}
```

**Output Schema:**
```json
{
  "type": "object",
  "properties": {
    "content": { "type": "string" },
    "title": { "type": "string" }
  }
}
```

### `rawfy_batch`
Extracts content from multiple URLs concurrently.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "urls": {
      "type": "array",
      "items": { "type": "string" }
    },
    "format": { "type": "string" }
  },
  "required": ["urls"]
}
```

## Troubleshooting
- **Server not starting**: Ensure Node.js is installed. Verify the configuration formatting.
- **Tool not appearing**: Restart the agent app after modifying the config. Check for conflicting server names.

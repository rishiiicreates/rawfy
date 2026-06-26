# MCP Server Usage Reference

## Adding Rawfy to an Agent
Add this configuration to your `.mcp.json` or MCP config block:
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string" },
          "text": { "type": "string" }
        }
      }
    }
  }
}
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

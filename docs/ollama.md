# Using Rawfy with Ollama Tool-Call Agents

Rawfy's REST API makes it easy to integrate with Ollama-based agents
that support tool calling.

## Setup

```bash
npm install -g rawfy     # Install CLI
rawfy api --port 3847    # Start REST API
```

## REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fetch?url=<url>&format=<fmt>` | GET | Full page fetch |
| `/metadata?url=<url>` | GET | Metadata only |
| `/health` | GET | Health check |
| `/version` | GET | Version info |

### Query Parameters for `/fetch`

| Param | Default | Description |
|-------|---------|-------------|
| `url` | required | URL to fetch |
| `format` | `markdown` | `markdown`, `json`, or `text` |
| `vision` | `false` | Enable image descriptions |
| `no_playwright` | `false` | Skip browser rendering |
| `max_tokens` | `50000` | Max output tokens |

## Ollama Tool Definition

```python
import ollama
import requests

# Define Rawfy as a tool
tools = [
    {
        "type": "function",
        "function": {
            "name": "rawfy_fetch",
            "description": "Fetch a web page and return its content as structured markdown. Use to read and understand any web page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["markdown", "json", "text"],
                        "description": "Output format",
                        "default": "markdown"
                    }
                },
                "required": ["url"]
            }
        }
    }
]


def call_rawfy(url: str, format: str = "markdown") -> str:
    """Call the Rawfy REST API."""
    response = requests.get(
        "http://localhost:3847/fetch",
        params={"url": url, "format": format}
    )
    if response.ok:
        return response.text
    return f"Error: {response.json().get('message', 'Unknown error')}"


# Chat with tool calling
response = ollama.chat(
    model="llama3.1",
    messages=[
        {"role": "user", "content": "Read https://example.com and tell me what it says"}
    ],
    tools=tools,
)

# Handle tool calls
if response.message.tool_calls:
    for tool_call in response.message.tool_calls:
        if tool_call.function.name == "rawfy_fetch":
            result = call_rawfy(**tool_call.function.arguments)
            # Feed result back to the model
            response = ollama.chat(
                model="llama3.1",
                messages=[
                    {"role": "user", "content": "Read https://example.com"},
                    response.message,
                    {"role": "tool", "content": result},
                ],
            )
            print(response.message.content)
```

## Using with curl

```bash
# Start the API server
rawfy api &

# Fetch a page
curl "http://localhost:3847/fetch?url=https://example.com"

# Get JSON
curl "http://localhost:3847/fetch?url=https://example.com&format=json"

# Get metadata only
curl "http://localhost:3847/metadata?url=https://example.com"

# Health check
curl "http://localhost:3847/health"
```

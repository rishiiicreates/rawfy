# Rawfy Python Wrapper

Python bindings for the [Rawfy](https://github.com/rishiiicreates/rawfy) AI agent skill.

## Prerequisites

- **Node.js >= 18** — Rawfy is a Node.js tool
- **Rawfy CLI** — `npm install -g rawfy`

## Install

```bash
pip install rawfy
```

## Quick Start

```python
from rawfy import fetch, metadata

# Full page fetch (returns WSM markdown)
content = fetch("https://example.com")

# Get structured JSON data
import json
data = fetch("https://example.com", format="json")
parsed = json.loads(data)

# Or use the convenience wrapper
from rawfy import fetch_json
data = fetch_json("https://example.com")
print(data["metadata"]["title"])

# Lightweight metadata only
meta = metadata("https://docs.python.org")
print(f"Title: {meta['title']}, Words: {meta['word_count']}")
```

## API

### `fetch(url, *, format="markdown", vision=False, no_playwright=False, max_tokens=50000, timeout=30)`

Fetch and process a URL. Returns the content as a string.

### `fetch_json(url, **kwargs)`

Same as `fetch()` with `format="json"`, returns a parsed dict.

### `metadata(url, *, no_playwright=False, timeout=15)`

Fetch only page metadata (lightweight). Returns a dict.

### `check_installation()`

Check if Rawfy and dependencies are installed. Returns a status dict.

## Error Handling

```python
from rawfy import fetch, RawfyError

try:
    content = fetch("https://example.com")
except RawfyError as e:
    print(f"Error [{e.code}]: {e}")
    print(f"URL: {e.url}")
```

## CLI

```bash
python -m rawfy https://example.com
python -m rawfy https://example.com --format json
```

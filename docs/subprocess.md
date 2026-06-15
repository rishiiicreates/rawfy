# Using Rawfy as a Subprocess Tool

Rawfy can be used by any AI agent that can execute shell commands.
This guide covers general subprocess integration.

## CLI Reference

```bash
# Full page fetch
rawfy fetch <url> [flags]

# Shorthand
rawfy <url>

# Metadata only (use JSON format + jq)
rawfy fetch <url> --format json | jq '.metadata'
```

### Fetch Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--format <fmt>` | `markdown` | Output: `markdown`, `json`, `text` |
| `--vision` | off | Enable image descriptions |
| `--no-playwright` | off | Static fetch only (faster) |
| `--max-tokens <n>` | `50000` | Max output tokens |
| `--out <file>` | stdout | Write to file |

### Other Commands

```bash
rawfy serve           # Start MCP stdio server
rawfy api             # Start REST API (default port 3847)
rawfy api --port 8080 # Custom port
rawfy install         # Install Playwright Chromium
rawfy version         # Print version
rawfy --help          # Full help
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (details on stderr) |

## Pipe-Friendly Design

- **stdout**: Clean output only (the page content)
- **stderr**: Progress messages, errors, warnings

This means you can safely pipe Rawfy output:

```bash
# Pipe to a file
rawfy fetch https://example.com > page.md

# Pipe to another tool
rawfy fetch https://example.com --format json | jq '.metadata.title'

# Use in a script
CONTENT=$(rawfy fetch https://example.com --format text)
echo "Page has $(echo "$CONTENT" | wc -w) words"
```

## Integration Patterns

### Python (subprocess)

```python
import subprocess
import json

result = subprocess.run(
    ["rawfy", "fetch", "https://example.com", "--format", "json"],
    capture_output=True, text=True, timeout=30
)

if result.returncode == 0:
    data = json.loads(result.stdout)
    print(data["metadata"]["title"])
else:
    print(f"Error: {result.stderr}")
```

### JavaScript/TypeScript (child_process)

```typescript
import { execSync } from 'child_process';

const output = execSync(
  'rawfy fetch https://example.com --format json',
  { encoding: 'utf-8', timeout: 30000 }
);
const data = JSON.parse(output);
console.log(data.metadata.title);
```

### Go (os/exec)

```go
cmd := exec.Command("rawfy", "fetch", url, "--format", "json")
output, err := cmd.Output()
if err != nil {
    log.Fatal(err)
}
var data map[string]interface{}
json.Unmarshal(output, &data)
```

### Bash

```bash
#!/bin/bash
URL="$1"
CONTENT=$(rawfy fetch "$URL" --format text 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "$CONTENT"
else
    echo "Failed to fetch $URL" >&2
    exit 1
fi
```

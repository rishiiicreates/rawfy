# CLI Usage Reference

## Installation
```bash
# Install globally
npm install -g @rishiicreates/rawfy

# Run via npx
npx rawfy <url>
```

## Flags
- `--format <type>`: Output format (markdown, json, text, html). Default: markdown.
- `--js`: Enable headless browser for JS-rendered SPA sites.
- `--wait <ms>`: Wait time for JS to execute (implies `--js`).
- `--output <file>`: Save output to file instead of stdout.
- `--timeout <ms>`: Request timeout in milliseconds.
- `--no-metadata`: Exclude metadata from the output.
- `--links-only`: Return an array of links found on the page.

## Stdin Piping
```bash
echo "https://example.com" | rawfy --format json
```

## Environment Variables
- `RAWFY_TIMEOUT`: Default timeout in milliseconds.
- `RAWFY_USER_AGENT`: Custom User-Agent string.

## Exit Codes
- `0`: Success.
- `1`: Invalid URL or Arguments.
- `2`: Network Error / Unreachable.
- `3`: Extraction Error.

## Examples
1. Fetch markdown: `rawfy https://example.com`
2. JS site extraction: `rawfy https://spa-example.com --js --wait 2000`
3. JSON output: `rawfy https://example.com --format json`
4. Extract links: `rawfy https://example.com --links-only`
5. Save to file: `rawfy https://example.com --output result.md`

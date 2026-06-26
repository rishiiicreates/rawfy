# Node.js SDK Usage Reference

## Installation
```bash
npm install @rishiicreates/rawfy
```

## Imports
**ESM:**
```javascript
import { rawfy, rawfyBatch } from 'rawfy';
```
**CommonJS:**
```javascript
const { rawfy, rawfyBatch } = require('rawfy');
```

## API

### `rawfy(url, options?)`
Extracts content from a single URL.

**Options:**
- `format` (string): 'markdown', 'json', 'text', 'html'
- `js` (boolean): Enable headless browser evaluation
- `wait` (number): Wait time in ms
- `timeout` (number): Request timeout in ms

### `rawfy.batch(urls, options?)`
Extracts multiple URLs in parallel. Returns an array of results.

## TypeScript Interfaces
```typescript
interface RawfyOptions {
  format?: 'markdown' | 'json' | 'text' | 'html';
  js?: boolean;
  wait?: number;
  timeout?: number;
}

interface RawfyResult {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  links: string[];
  format: string;
}
```

## Examples

**1. Simple Fetch**
```javascript
const result = await rawfy('https://example.com');
console.log(result.content);
```

**2. Fetch with JS**
```javascript
const result = await rawfy('https://spa-example.com', { js: true, wait: 2000 });
```

**3. Batch Fetch**
```javascript
const results = await rawfy.batch(['https://url1.com', 'https://url2.com']);
results.forEach(r => console.log(r.title));
```

**4. Error Handling**
```javascript
try {
  await rawfy('https://bad-url');
} catch (error) {
  console.error('Extraction failed:', error.message);
}
```

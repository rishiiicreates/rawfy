# Phase 0 — Project Setup

Scaffold the Rawfy project from zero to a build-ready, lint-passing, test-running TypeScript monorepo.

## Architecture Validation

I've read all 8 planning documents. Cross-referencing them reveals:

| Check | Status | Notes |
|-------|--------|-------|
| Tech stack consistency | ✅ | TECHSTACK.md ↔ todo-list.md ↔ workflow.md all agree on deps |
| Directory structure | ✅ | TECHSTACK.md `directory structure` section is canonical |
| Output format spec | ✅ | UI_UX.md WSM spec aligns with IDEAS.md examples |
| Error interface | ✅ | workflow.md error struct matches UI_UX.md error examples |
| CLI contract | ✅ | UI_UX.md, SCOPE.md, TECHSTACK.md all agree |
| Phase ordering | ✅ | todo-list.md phases are dependency-correct |

> [!IMPORTANT]
> **Rebrand**: All planning docs use "WebScout". Per your decision, everything is now **Rawfy**: CLI `rawfy`, package `rawfy-skill`, format **RFM** (Rawfy Markdown), env vars `RAWFY_*`, error types `RawfyError`.

## User Review Required

> [!WARNING]
> **npm package name**: I'll use `rawfy-skill` as the npm package name (matching the planning docs' `webscout-skill` convention). If you want just `rawfy` instead, let me know.

> [!IMPORTANT]
> **GitHub repo**: todo-list.md includes "set up GitHub repo" and "add GitHub Actions CI". I'll create the CI workflow file locally but will **not** run `git remote add` or push — you'll need to create the GitHub repo yourself and connect it. I'll init git locally.

## Open Questions

None — naming conflict resolved, all other decisions are clearly documented.

---

## Proposed Changes

### Project Root — Package & Config Files

#### [NEW] [package.json](file:///Users/rishii/Rawfy/package.json)

```jsonc
{
  "name": "rawfy-skill",
  "version": "0.1.0",
  "description": "Universal web perception skill for AI agents — converts any URL into structured, agent-readable content",
  "type": "module",
  "engines": { "node": ">=18" },
  "bin": { "rawfy": "./dist/cli.js" },
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.ts'",
    "format:check": "prettier --check 'src/**/*.ts'",
    "start:mcp": "node dist/server-mcp.js",
    "start:api": "node dist/server-api.js",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["ai", "agent", "mcp", "web", "scraper", "skill", "cli", "markdown"],
  "license": "MIT",
  "author": "Rawfy"
}
```

Key decisions:
- `"type": "module"` — ESM throughout, matches modern Node.js and all our deps
- `bin.rawfy` — the CLI entry point
- `exports` — clean module entry for `import { fetch } from 'rawfy-skill'`
- Separate `test:integration` script — integration tests hit real URLs, run separately

---

#### [NEW] [tsconfig.json](file:///Users/rishii/Rawfy/tsconfig.json)

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key decisions:
- `target: ES2022` — as specified in todo-list.md
- `moduleResolution: bundler` — works with tsup, supports ESM imports cleanly
- `strict: true` — mandatory per your rules
- `noUncheckedIndexedAccess: true` — catches undefined-index bugs (production-grade)
- `exactOptionalPropertyTypes: false` — too noisy with jsdom/Readability types

---

#### [NEW] [tsup.config.ts](file:///Users/rishii/Rawfy/tsup.config.ts)

Three entry points — CLI, MCP server, API server — each bundles independently:

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    'server-mcp': 'src/server-mcp.ts',
    'server-api': 'src/server-api.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  shims: false,
  banner: {
    // CLI entry needs shebang
    js: '',
  },
})
```

The CLI entry (`src/cli.ts`) will have `#!/usr/bin/env node` as its first line; tsup preserves this.

---

#### [NEW] [eslint.config.js](file:///Users/rishii/Rawfy/eslint.config.js)

ESLint v9 flat config with TypeScript support:

```javascript
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  { ignores: ['dist/', 'node_modules/', '*.config.*'] },
)
```

---

#### [NEW] [.prettierrc](file:///Users/rishii/Rawfy/.prettierrc)

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

---

#### [NEW] [vitest.config.ts](file:///Users/rishii/Rawfy/vitest.config.ts)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/server-mcp.ts', 'src/server-api.ts'],
    },
    testTimeout: 10_000,
  },
})
```

---

#### [NEW] [vitest.integration.config.ts](file:///Users/rishii/Rawfy/vitest.integration.config.ts)

Separate config for slow integration tests that hit real URLs:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
})
```

---

#### [NEW] [.gitignore](file:///Users/rishii/Rawfy/.gitignore)

```
node_modules/
dist/
.env
.env.*
*.tgz
coverage/

# Playwright
chromium/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

---

#### [NEW] [.nvmrc](file:///Users/rishii/Rawfy/.nvmrc)

```
18
```

Ensures CI and contributors use the minimum supported Node version.

---

#### [NEW] [.editorconfig](file:///Users/rishii/Rawfy/.editorconfig)

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

---

### Source Directory Structure

#### [NEW] src/ skeleton

These are **stub files** — minimal valid TypeScript that compiles and exports nothing yet. They establish the canonical directory structure from TECHSTACK.md.

```
src/
├── index.ts              # Public API re-exports
├── cli.ts                # CLI entry point (#!/usr/bin/env node)
├── server-mcp.ts         # MCP server entry
├── server-api.ts         # REST API entry
├── types.ts              # Shared types: RawfyError, PageData, FetchOptions, etc.
├── fetcher/
│   ├── index.ts          # Fetch router (static vs Playwright)
│   ├── static.ts         # undici-based fetch
│   └── playwright.ts     # Playwright headless fetch
├── extractor/
│   ├── readability.ts    # Readability.js wrapper
│   ├── metadata.ts       # Meta, OG, JSON-LD extraction
│   ├── interactive.ts    # Buttons, forms, inputs
│   └── html-to-md.ts     # Turndown + custom rules
├── media/
│   ├── image.ts          # Image alt/OCR/vision pipeline
│   ├── video.ts          # Video captions/metadata
│   ├── audio.ts          # Audio metadata
│   └── pdf.ts            # PDF text extraction
├── output/
│   ├── index.ts          # Serializer router
│   ├── rfm.ts            # Rawfy Markdown serializer (was wsm.ts)
│   ├── json.ts           # JSON output serializer
│   └── text.ts           # Plain text serializer
└── utils/
    ├── detect.ts         # Static vs JS detection
    ├── truncate.ts       # Token-aware truncation
    ├── classify.ts       # Page type classification
    └── errors.ts         # RawfyError factory + error codes
```

Each stub will export a TODO comment and satisfy TypeScript compilation.

> [!NOTE]
> Renamed `wsm.ts` → `rfm.ts` per the Rawfy rebrand. The `types.ts` file is new — not in TECHSTACK.md's tree, but necessary to share types across modules without circular imports. This is the right place for `RawfyError`, `PageData`, `FetchOptions`, `FetchResult`, `MediaResult`, etc.

---

### Tests Directory

#### [NEW] tests/ skeleton

```
tests/
├── fixtures/             # Saved HTML pages for deterministic testing
│   └── .gitkeep
├── utils/
│   └── errors.test.ts    # Smoke test: validates RawfyError creation
└── setup.ts              # Global test setup (if needed)
```

One real test — `errors.test.ts` — to prove vitest works end-to-end.

---

### CI

#### [NEW] [.github/workflows/ci.yml](file:///Users/rishii/Rawfy/.github/workflows/ci.yml)

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  build-and-test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

---

## Implementation Order

I'll implement Phase 0 in this exact sequence:

| Step | What | Files Created |
|------|------|---------------|
| 1 | `npm init` + package.json | `package.json` |
| 2 | TypeScript config | `tsconfig.json` |
| 3 | tsup build config | `tsup.config.ts` |
| 4 | ESLint + Prettier | `eslint.config.js`, `.prettierrc` |
| 5 | Vitest config | `vitest.config.ts`, `vitest.integration.config.ts` |
| 6 | Dotfiles | `.gitignore`, `.nvmrc`, `.editorconfig` |
| 7 | Source stubs | All `src/**/*.ts` files (27 files) |
| 8 | Test stubs | `tests/` skeleton + smoke test |
| 9 | CI workflow | `.github/workflows/ci.yml` |
| 10 | Install deps | `npm install` |
| 11 | Verify | `npm run build && npm run typecheck && npm test && npm run lint` |
| 12 | Git init | `git init`, initial commit on `dev` branch |

---

## Verification Plan

### Automated
```bash
npm run build       # tsup compiles all 4 entry points successfully
npm run typecheck   # tsc --noEmit passes with zero errors
npm test            # vitest runs smoke test, passes
npm run lint        # eslint reports no errors
npm run format:check # prettier confirms formatting
```

### Manual
- Confirm `dist/` contains `cli.js`, `server-mcp.js`, `server-api.js`, `index.js` + `.d.ts` files
- Confirm `node dist/cli.js --version` prints `0.1.0` (once CLI stub has version)
- Confirm directory structure matches TECHSTACK.md exactly (with rfm.ts rename + types.ts addition)

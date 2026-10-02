import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    'server-mcp': 'src/server-mcp.ts',
    'server-api': 'src/server-api.ts',
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  target: 'node18',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  shims: false,
})

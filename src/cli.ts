#!/usr/bin/env node
/**
 * Rawfy — CLI entry point
 *
 * Commands:
 *   rawfy fetch <url>     Fetch a URL and print machine-readable content
 *   rawfy serve           Start MCP stdio server
 *   rawfy api             Start local REST API
 *   rawfy install         Install Playwright Chromium
 *   rawfy version         Print version and exit
 */

import { rawfyFetch } from './pipeline.js'
import * as fs from 'fs'
import { isRawfyError } from './utils/errors.js'
import type { OutputFormat } from './types.js'
import { serializeText } from './output/text.js'
import { serializeWsm } from './output/wsm.js'

const VERSION = '0.1.1'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    printUsage()
    process.exit(0)
  }

  switch (command) {
    case 'fetch':
      await handleFetch(args.slice(1))
      break
    case 'serve':
      await handleServe()
      break
    case 'api':
      await handleApi(args.slice(1))
      break
    case 'install':
      await handleInstall()
      break
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION)
      break
    default:
      // Scan for any URL in the arguments if not a known command
      const hasUrl = args.some(a => a.startsWith('http://') || a.startsWith('https://'))
      if (hasUrl) {
        await handleFetch(args)
      } else {
        console.error(`\x1b[31mrawfy: unknown command '${command}'\x1b[0m`)
        console.error("Run 'rawfy --help' for usage.")
        process.exit(1)
      }
  }
}

/**
 * rawfy fetch <url> [flags]
 */
async function handleFetch(args: string[]): Promise<void> {
  const { flags, positionals } = parseFlags(args)
  let url = positionals[0]
  
  if (!url && !process.stdin.isTTY) {
    url = await new Promise<string>((resolve) => {
      let data = ''
      process.stdin.on('data', chunk => data += chunk)
      process.stdin.on('end', () => resolve(data.trim()))
    })
  }

  if (!url) {
    console.error('rawfy fetch: missing URL argument')
    console.error('Usage: rawfy fetch <url> [--format markdown|json|text]')
    process.exit(1)
  }

  const formatRaw = flags['format'] || flags['f'] || 'markdown'
  if (!['markdown', 'json', 'text', 'html'].includes(formatRaw)) {
    console.error(`\x1b[31mrawfy: invalid format '${formatRaw}'\x1b[0m`)
    console.error('Allowed formats: markdown, json, text, html')
    process.exit(1)
  }
  const format = formatRaw as OutputFormat
  const vision = flags['vision'] !== undefined
  const noPlaywright = flags['no-playwright'] !== undefined
  const forcePlaywright = flags['force-playwright'] !== undefined
  const maxTokens = flags['max-tokens'] ? parseInt(flags['max-tokens'], 10) : undefined
  const timeoutMs = flags['timeout'] ? parseInt(flags['timeout'], 10) : undefined
  const linksOnly = flags['links-only'] !== undefined
  const outFile = flags['out'] || flags['o']

  // Use stderr for progress (keeps stdout clean for pipe)
  const isTTY = process.stderr.isTTY
  const progress = isTTY
    ? (msg: string) => process.stderr.write(`\r  ⏳ ${msg}`)
    : undefined

  try {
    const output = await rawfyFetch(
      url,
      { format, vision, noPlaywright, forcePlaywright, maxTokens, timeoutMs, linksOnly },
      progress,
    )

    if (isTTY) process.stderr.write('\r  ✅ done\n')
    
    let finalString = ''
    switch (format) {
      case 'json':
        finalString = JSON.stringify(output, null, 2)
        break
      case 'html':
        finalString = output.content.html
        break
      case 'text':
        finalString = serializeText(output)
        break
      case 'markdown':
      default:
        finalString = serializeWsm(output)
        break
    }

    if (outFile) {
      fs.writeFileSync(outFile, finalString, 'utf-8')
      console.error(`rawfy: output written to ${outFile}`)
    } else {
      process.stdout.write(finalString + '\n')
    }
  } catch (err) {
    if (isTTY) process.stderr.write('\r')

    if (isRawfyError(err)) {
      console.error(`rawfy error [${err.code}]: ${err.message}`)
      if (err.url) console.error(`  url: ${err.url}`)
    } else if (err instanceof Error) {
      console.error(`rawfy error: ${err.message}`)
    } else {
      console.error('rawfy: unexpected error', err)
    }
    process.exit(1)
  }
}

/**
 * rawfy serve — start MCP stdio server
 */
async function handleServe(): Promise<void> {
  const { startMcpServer } = await import('./server-mcp.js')
  await startMcpServer()
}

/**
 * rawfy api — start REST API server
 */
async function handleApi(args: string[]): Promise<void> {
  const { flags } = parseFlags(args)
  const port = flags['port'] ? parseInt(flags['port'], 10) : 3847

  const { startApiServer } = await import('./server-api.js')
  await startApiServer(port)
}

/**
 * rawfy install — install Playwright Chromium
 */
async function handleInstall(): Promise<void> {
  console.log('Installing Playwright Chromium...')
  const { execSync } = await import('node:child_process')
  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
    })
    console.log('✅ Playwright Chromium installed successfully.')
  } catch {
    console.error('Failed to install Playwright Chromium.')
    console.error('Make sure npx is available in your PATH.')
    process.exit(1)
  }
}

/**
 * Print usage help.
 */
function printUsage(): void {
  console.log(`
  rawfy v${VERSION}
  AI agent skill for semantic web content extraction

  Usage:
    rawfy fetch <url> [flags]     Fetch and process a URL
    rawfy serve                   Start MCP stdio server
    rawfy api [--port 3847]       Start local REST API
    rawfy install                 Install Playwright Chromium
    rawfy version                 Print version

  Fetch flags:
    --format <fmt>    Output format: markdown (default), json, text
    --vision          Enable vision API for image descriptions
    --no-playwright   Skip Playwright, use static fetch only
    --max-tokens <n>  Maximum output tokens (default: 50000)
    --out <file>      Write output to file instead of stdout

  Shorthand:
    rawfy <url>                   Same as 'rawfy fetch <url>'

  Examples:
    rawfy fetch https://example.com
    rawfy fetch https://docs.python.org --format json
    rawfy fetch https://blog.example.com --max-tokens 10000 --out page.md
    rawfy https://example.com --format text
`)
}

/**
 * Parse --key value flags from args.
 */
function parseFlags(args: string[]): { flags: Record<string, string>, positionals: string[] } {
  const flags: Record<string, string> = {}
  const positionals: string[] = []
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1)
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    } else {
      positionals.push(arg)
    }
  }
  return { flags, positionals }
}

main().catch((err: unknown) => {
  console.error('rawfy: fatal error', err)
  process.exit(1)
})

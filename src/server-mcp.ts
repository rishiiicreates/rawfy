/**
 * Rawfy — MCP (Model Context Protocol) Server
 *
 * Exposes Rawfy as an MCP tool that AI agents can call:
 *   - rawfy_fetch: Fetch and process a URL
 *   - rawfy_metadata: Get metadata only (lightweight)
 *
 * Uses the high-level McpServer API with stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { rawfyFetch, rawfyMetadata, rawfyBatch } from './pipeline.js'
import { isRawfyError } from './utils/errors.js'
import type { OutputFormat } from './types.js'
import { serializeWsm } from './output/wsm.js'
import { serializeText } from './output/text.js'

const SERVER_NAME = 'rawfy'
const SERVER_VERSION = '0.1.1'

/**
 * Start the MCP server with stdio transport.
 */
export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  })

  // -----------------------------------------------------------------------
  // rawfy_fetch tool
  // -----------------------------------------------------------------------
  server.registerTool(
    'rawfy_fetch',
    {
      description:
        'Fetch a web page and return its content as structured, agent-readable markdown with described images, transcribed video, and interactive element maps.',
      inputSchema: {
        url: z.string().describe('The URL to fetch and process'),
        format: z
          .enum(['markdown', 'json', 'text', 'html'])
          .default('markdown')
          .describe('Output format: markdown (WSM, default), json, or text'),
        vision: z
          .boolean()
          .default(false)
          .describe('Enable vision API for image descriptions (requires ANTHROPIC_API_KEY)'),
        no_playwright: z
          .boolean()
          .default(false)
          .describe('Skip Playwright, use static fetch only'),
        max_tokens: z
          .number()
          .default(50000)
          .describe('Maximum output tokens (default: 50000)'),
      },
    },
    async ({ url, format, vision, no_playwright, max_tokens }) => {
      try {
        const result = await rawfyFetch(url, {
          format: format as OutputFormat,
          vision,
          noPlaywright: no_playwright,
          maxTokens: max_tokens,
        })

        let text = ''
        if (format === 'json') {
          text = JSON.stringify(result, null, 2)
        } else if (format === 'html') {
          text = result.content.html
        } else if (format === 'text') {
          text = serializeText(result)
        } else {
          text = serializeWsm(result)
        }

        return {
          content: [{ type: 'text' as const, text }],
        }
      } catch (err: unknown) {
        const message = isRawfyError(err)
          ? `[${err.code}] ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error'

        return {
          content: [{ type: 'text' as const, text: `Rawfy error: ${message}` }],
          isError: true,
        }
      }
    },
  )

  // -----------------------------------------------------------------------
  // rawfy_metadata tool
  // -----------------------------------------------------------------------
  server.registerTool(
    'rawfy_metadata',
    {
      description:
        'Fetch only the metadata for a web page (title, description, type, language, word count). Lightweight — no media extraction.',
      inputSchema: {
        url: z.string().describe('The URL to fetch metadata for'),
        no_playwright: z
          .boolean()
          .default(false)
          .describe('Skip Playwright, use static fetch only'),
      },
    },
    async ({ url, no_playwright }) => {
      try {
        const metadata = await rawfyMetadata(url, { noPlaywright: no_playwright })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(metadata, null, 2) }],
        }
      } catch (err: unknown) {
        const message = isRawfyError(err)
          ? `[${err.code}] ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown error'

        return {
          content: [{ type: 'text' as const, text: `Rawfy error: ${message}` }],
          isError: true,
        }
      }
    },
  )

// -----------------------------------------------------------------------
  // rawfy_batch tool
  // -----------------------------------------------------------------------
  server.registerTool(
    'rawfy_batch',
    {
      description: 'Fetch and process multiple URLs in parallel.',
      inputSchema: {
        urls: z.array(z.string()).describe('Array of URLs to fetch'),
        format: z.enum(['markdown', 'json', 'text', 'html']).default('markdown'),
        no_playwright: z.boolean().default(false)
      }
    },
    async ({ urls, format, no_playwright }) => {
      try {
        const results = await rawfyBatch(urls, { format: format as OutputFormat, noPlaywright: no_playwright })
        const text = results.map(r => {
          if (format === 'json') return JSON.stringify(r, null, 2)
          if (format === 'html') return r.content.html
          if (format === 'text') return serializeText(r)
          return serializeWsm(r)
        }).join('\n\n---\n\n')
        return { content: [{ type: 'text', text }] }
      } catch (err: unknown) {
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true }
      }
    }
  )

  // -----------------------------------------------------------------------
  // Connect transport and start

  // -----------------------------------------------------------------------
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} started`)
}

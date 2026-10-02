/**
 * Rawfy — REST API Server
 *
 * Lightweight HTTP API built on Hono:
 *   GET /fetch?url=<url>&format=<fmt>  Fetch and process a URL
 *   GET /metadata?url=<url>             Get metadata only
 *   GET /health                         Health check
 *   GET /version                        Version info
 *
 * All endpoints include CORS headers for browser-based agent UIs.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { rawfyFetch, rawfyMetadata } from './pipeline.js'
import { isRawfyError } from './utils/errors.js'
import type { OutputFormat } from './types.js'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgPath = path.resolve(__dirname, '../package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const VERSION = pkg.version

/**
 * Start the Rawfy REST API server.
 *
 * @param port - Port to listen on (default: 3847)
 */
export async function startApiServer(port: number = 3847): Promise<void> {
  const app = new Hono()

  // CORS for browser-based agent UIs
  app.use('/*', cors())

  // -----------------------------------------------------------------------
  // GET /health
  // -----------------------------------------------------------------------
  app.get('/health', (c) => {
    return c.json({ status: 'ok', version: VERSION })
  })

  // -----------------------------------------------------------------------
  // GET /version
  // -----------------------------------------------------------------------
  app.get('/version', (c) => {
    return c.json({ version: VERSION })
  })

  // -----------------------------------------------------------------------
  // GET /fetch?url=<url>&format=<fmt>&vision=true&max_tokens=50000
  // -----------------------------------------------------------------------
  app.get('/fetch', async (c) => {
    const url = c.req.query('url')
    if (!url) {
      return c.json({ error: 'Missing required query parameter: url' }, 400)
    }

    const format = (c.req.query('format') || 'markdown') as OutputFormat
    const vision = c.req.query('vision') === 'true'
    const noPlaywright = c.req.query('no_playwright') === 'true'
    const maxTokensParam = c.req.query('max_tokens')
    const maxTokens = maxTokensParam ? parseInt(maxTokensParam, 10) : undefined

    try {
      const result = await rawfyFetch(url, {
        format,
        vision,
        noPlaywright,
        maxTokens,
      })

      // Return as appropriate content type
      if (format === 'json') {
        return c.json(result)
      } else if (format === 'html') {
        return c.html(result.content.html)
      } else if (format === 'text') {
        const { serializeText } = await import('./output/text.js')
        return c.text(serializeText(result))
      } else {
        const { serializeWsm } = await import('./output/wsm.js')
        return c.text(serializeWsm(result))
      }
    } catch (err) {
      if (isRawfyError(err)) {
        return c.json(
          {
            error: err.code,
            message: err.message,
            url: err.url,
          },
          500,
        )
      }
      return c.json(
        {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
        500,
      )
    }
  })

  // -----------------------------------------------------------------------
  // GET /metadata?url=<url>
  // -----------------------------------------------------------------------
  app.get('/metadata', async (c) => {
    const url = c.req.query('url')
    if (!url) {
      return c.json({ error: 'Missing required query parameter: url' }, 400)
    }

    const noPlaywright = c.req.query('no_playwright') === 'true'

    try {
      const metadata = await rawfyMetadata(url, { noPlaywright })
      return c.json(metadata)
    } catch (err) {
      if (isRawfyError(err)) {
        return c.json(
          {
            error: err.code,
            message: err.message,
            url: err.url,
          },
          500,
        )
      }
      return c.json(
        {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
        500,
      )
    }
  })

  // -----------------------------------------------------------------------
  // Start server
  // -----------------------------------------------------------------------
  console.log(`🚀 Rawfy API server running at http://localhost:${port}`)
  console.log(`   GET /fetch?url=<url>&format=markdown|json|text`)
  console.log(`   GET /metadata?url=<url>`)
  console.log(`   GET /health`)

  serve({
    fetch: app.fetch,
    port,
  })
}

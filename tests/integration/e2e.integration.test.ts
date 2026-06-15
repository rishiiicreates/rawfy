import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import util from 'util'
import { startApiServer } from '../../src/server-api'
import type { Server } from 'http'

const execAsync = util.promisify(exec)

describe('E2E Tests', () => {
  describe('CLI', () => {
    it('rawfy fetch returns json output', async () => {
      const { stdout } = await execAsync(
        'npx tsx src/cli.ts fetch https://example.com --format json --no-playwright',
      )
      const data = JSON.parse(stdout)
      expect(data).toHaveProperty('metadata')
      expect(data.metadata.title).toBe('Example Domain')
      expect(data).toHaveProperty('content')
      expect(data.content.text).toContain('documentation examples')
    })

    it('rawfy <url> shorthand works', async () => {
      const { stdout } = await execAsync(
        'npx tsx src/cli.ts https://example.com --format text --no-playwright',
      )
      expect(stdout).toContain('EXAMPLE DOMAIN')
      expect(stdout).toContain('Source: https://example.com')
    })
  })

  describe('REST API', () => {
    let server: Server
    const port = 49123

    beforeAll(async () => {
      server = await startApiServer(port)
    })

    afterAll(() => {
      if (server) {
        server.close()
      }
    })

    it('GET /fetch works', async () => {
      const res = await fetch(`http://localhost:${port}/fetch?url=https://example.com&format=json&no_playwright=true`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('metadata')
      expect((data as any).metadata.title).toBe('Example Domain')
    })

    it('GET /metadata works', async () => {
      const res = await fetch(`http://localhost:${port}/metadata?url=https://example.com&no_playwright=true`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('title', 'Example Domain')
      expect(data).toHaveProperty('type')
      expect(data).toHaveProperty('url')
    })

    it('GET /health works', async () => {
      const res = await fetch(`http://localhost:${port}/health`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveProperty('status', 'ok')
    })
  })
})

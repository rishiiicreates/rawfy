import { describe, it, expect } from 'vitest'
import { extractInteractiveElements } from '../../src/extractor/interactive.js'

describe('extractInteractiveElements', () => {
  describe('buttons', () => {
    it('extracts <button> elements', () => {
      const html = `
        <html><body>
          <button>Click Me</button>
          <button aria-label="Close dialog">X</button>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const buttons = result.filter((el) => el.type === 'button')

      expect(buttons).toHaveLength(2)
      expect(buttons[0]!.label).toBe('Click Me')
      expect(buttons[1]!.label).toBe('Close dialog')
      expect(buttons[1]!.ariaLabel).toBe('Close dialog')
    })

    it('extracts <input type="submit"> as buttons', () => {
      const html = `
        <html><body>
          <input type="submit" value="Submit Form">
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const buttons = result.filter((el) => el.type === 'button')

      expect(buttons).toHaveLength(1)
      expect(buttons[0]!.label).toBe('Submit Form')
    })
  })

  describe('forms', () => {
    it('extracts forms with their fields', () => {
      const html = `
        <html><body>
          <form action="/login" name="loginForm">
            <input name="username" type="text">
            <input name="password" type="password">
            <button type="submit">Log In</button>
          </form>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const forms = result.filter((el) => el.type === 'form')

      expect(forms).toHaveLength(1)
      expect(forms[0]!.label).toBe('loginForm')
      expect(forms[0]!.action).toBe('https://example.com/login')
      expect(forms[0]!.fields).toContain('username')
      expect(forms[0]!.fields).toContain('password')
    })

    it('generates label from fields when no name', () => {
      const html = `
        <html><body>
          <form>
            <input name="email" type="email">
            <input name="message" type="text">
          </form>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const forms = result.filter((el) => el.type === 'form')

      expect(forms[0]!.label).toContain('email')
    })
  })

  describe('standalone inputs', () => {
    it('extracts inputs not inside a form', () => {
      const html = `
        <html><body>
          <input type="search" placeholder="Search..." aria-label="Search site">
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const inputs = result.filter((el) => el.type === 'input')

      expect(inputs).toHaveLength(1)
      expect(inputs[0]!.label).toContain('Search site')
      expect(inputs[0]!.label).toContain('search')
    })

    it('skips hidden inputs', () => {
      const html = `
        <html><body>
          <input type="hidden" name="csrf_token" value="abc123">
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const inputs = result.filter((el) => el.type === 'input')
      expect(inputs).toHaveLength(0)
    })

    it('skips inputs inside forms', () => {
      const html = `
        <html><body>
          <form>
            <input name="inside_form" type="text">
          </form>
          <input name="outside_form" type="text">
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const inputs = result.filter((el) => el.type === 'input')

      // Only the standalone input should be in the inputs list
      expect(inputs).toHaveLength(1)
      expect(inputs[0]!.label).toContain('outside_form')
    })
  })

  describe('selects', () => {
    it('extracts standalone select elements with options', () => {
      const html = `
        <html><body>
          <select name="country" aria-label="Select country">
            <option>US</option>
            <option>UK</option>
            <option>Canada</option>
          </select>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const selects = result.filter((el) => el.type === 'select')

      expect(selects).toHaveLength(1)
      expect(selects[0]!.label).toBe('Select country')
      expect(selects[0]!.fields).toEqual(['US', 'UK', 'Canada'])
    })
  })

  describe('links', () => {
    it('extracts links with resolved URLs', () => {
      const html = `
        <html><body>
          <a href="/about">About Us</a>
          <a href="https://other.com">External Link</a>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const links = result.filter((el) => el.type === 'link')

      expect(links).toHaveLength(2)
      expect(links[0]!.label).toBe('About Us')
      expect(links[0]!.href).toBe('https://example.com/about')
      expect(links[1]!.href).toBe('https://other.com/')
    })

    it('skips javascript: and mailto: links', () => {
      const html = `
        <html><body>
          <a href="javascript:void(0)">JS Link</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="tel:+1234567890">Call</a>
          <a href="#section">Anchor</a>
          <a href="/real">Real Link</a>
        </body></html>
      `
      const result = extractInteractiveElements(html, 'https://example.com')
      const links = result.filter((el) => el.type === 'link')

      expect(links).toHaveLength(1)
      expect(links[0]!.label).toBe('Real Link')
    })

    it('truncates very long link labels', () => {
      const longText = 'A'.repeat(150)
      const html = `<html><body><a href="/page">${longText}</a></body></html>`

      const result = extractInteractiveElements(html, 'https://example.com')
      const links = result.filter((el) => el.type === 'link')

      expect(links[0]!.label.length).toBeLessThanOrEqual(100)
      expect(links[0]!.label).toContain('...')
    })
  })

  describe('edge cases', () => {
    it('returns empty array for pages with no interactive elements', () => {
      const html = '<html><body><p>Just text</p></body></html>'
      const result = extractInteractiveElements(html, 'https://example.com')
      expect(result).toEqual([])
    })

    it('handles empty HTML', () => {
      const result = extractInteractiveElements('', 'https://example.com')
      expect(result).toEqual([])
    })
  })
})

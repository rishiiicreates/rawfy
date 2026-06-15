import { describe, it, expect } from 'vitest'
import { extractImages, formatImage } from '../../src/media/image.js'

describe('extractImages', () => {
  const BASE = 'https://example.com'

  describe('priority 1: alt text', () => {
    it('uses alt text as description', async () => {
      const html = '<html><body><img src="/photo.jpg" alt="A sunset over the ocean"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.description).toBe('A sunset over the ocean')
      expect(results[0]!.descriptionSource).toBe('alt_text')
      expect(results[0]!.src).toBe('https://example.com/photo.jpg')
    })

    it('skips placeholder alt text', async () => {
      const html = '<html><body><img src="/photo.jpg" alt="image"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      // Should NOT use "image" as description since it's a placeholder
      expect(results[0]!.descriptionSource).not.toBe('alt_text')
    })

    it('filters common placeholder alts', async () => {
      const placeholders = ['image', 'photo', 'icon', 'logo', 'thumbnail', 'placeholder']
      for (const ph of placeholders) {
        const html = `<html><body><img src="/img.jpg" alt="${ph}"></body></html>`
        const results = await extractImages(html, BASE)
        expect(results[0]!.descriptionSource).not.toBe('alt_text')
      }
    })
  })

  describe('priority 2: figcaption/title', () => {
    it('uses figcaption when alt is missing', async () => {
      const html = `
        <html><body>
          <figure>
            <img src="/chart.png">
            <figcaption>Figure 1: Revenue by quarter</figcaption>
          </figure>
        </body></html>
      `
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.description).toBe('Figure 1: Revenue by quarter')
      expect(results[0]!.descriptionSource).toBe('figcaption')
    })

    it('uses title attribute when no alt or figcaption', async () => {
      const html = '<html><body><img src="/img.png" title="Product screenshot"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.description).toBe('Product screenshot')
      expect(results[0]!.descriptionSource).toBe('figcaption')
    })
  })

  describe('image filtering', () => {
    it('skips images with no src', async () => {
      const html = '<html><body><img alt="No source"></body></html>'
      const results = await extractImages(html, BASE)
      expect(results).toHaveLength(0)
    })

    it('skips tracking pixels (1x1)', async () => {
      const html = '<html><body><img src="/pixel.gif" width="1" height="1"></body></html>'
      const results = await extractImages(html, BASE)
      expect(results).toHaveLength(0)
    })

    it('handles data-src (lazy loading)', async () => {
      const html = '<html><body><img data-src="https://cdn.example.com/lazy.jpg" alt="Lazy image"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.src).toBe('https://cdn.example.com/lazy.jpg')
    })

    it('resolves relative URLs', async () => {
      const html = '<html><body><img src="/images/photo.jpg" alt="Photo"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results[0]!.src).toBe('https://example.com/images/photo.jpg')
    })
  })

  describe('fallback (no description)', () => {
    it('returns image with no description when no signals', async () => {
      const html = '<html><body><img src="/mystery.jpg"></body></html>'
      const results = await extractImages(html, BASE)

      expect(results).toHaveLength(1)
      expect(results[0]!.description).toBeUndefined()
      expect(results[0]!.descriptionSource).toBeUndefined()
    })
  })

  describe('multiple images', () => {
    it('extracts all images from a page', async () => {
      const html = `
        <html><body>
          <img src="/img1.jpg" alt="First image">
          <img src="/img2.jpg" alt="Second image">
          <img src="/img3.jpg">
        </body></html>
      `
      const results = await extractImages(html, BASE)
      expect(results).toHaveLength(3)
    })
  })
})

describe('formatImage', () => {
  it('formats image with description and src', () => {
    const result = formatImage({
      type: 'image',
      src: 'https://example.com/photo.jpg',
      alt: 'A sunset',
      description: 'A sunset',
      descriptionSource: 'alt_text',
    })
    expect(result).toBe('[IMAGE: A sunset | src: https://example.com/photo.jpg]')
  })

  it('formats image with OCR source', () => {
    const result = formatImage({
      type: 'image',
      src: 'https://example.com/doc.png',
      description: 'Chapter 1: Introduction',
      descriptionSource: 'ocr',
    })
    expect(result).toContain('via: ocr')
  })

  it('formats image with no description', () => {
    const result = formatImage({
      type: 'image',
      src: 'https://example.com/mystery.jpg',
    })
    expect(result).toContain('no description')
  })
})

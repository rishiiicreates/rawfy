/**
 * Rawfy — Interactive element extractor
 *
 * Finds and catalogs all interactive elements on a page:
 * - Buttons: <button>, <input type="submit">
 * - Links: <a> with href
 * - Forms: <form> with their fields
 * - Inputs: <input>, <textarea>
 * - Selects: <select> with options
 *
 * This gives AI agents a structured map of what they can interact with.
 */

import { JSDOM } from 'jsdom'
import type { InteractiveElement } from '../types.js'

/**
 * Extract all interactive elements from HTML.
 *
 * @param html - Raw HTML string
 * @param url - Page URL (for resolving relative hrefs)
 * @returns Array of interactive elements with type, label, and metadata
 */
export function extractInteractiveElements(html: string, url: string): InteractiveElement[] {
  const dom = new JSDOM(html, { url })
  const doc = dom.window.document
  const results: InteractiveElement[] = []

  // Extract buttons
  extractButtons(doc, results)

  // Extract forms (with their fields)
  extractForms(doc, url, results)

  // Extract standalone inputs (not inside a form)
  extractStandaloneInputs(doc, results)

  // Extract standalone selects (not inside a form)
  extractStandaloneSelects(doc, results)

  // Extract links
  extractLinks(doc, url, results)

  return results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGibberish(text: string): boolean {
  // Matches React generated IDs like :R1sq8q6: or :r1:
  return /^:[a-zA-Z0-9_-]+:$/.test(text)
}

function resolveLabel(
  element: Element,
  doc: Document,
  fallback: string,
  extra?: { checkValue?: boolean; checkPlaceholder?: boolean; checkNameAndId?: boolean }
): string {
  // 1. aria-label
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel && !isGibberish(ariaLabel)) return ariaLabel.trim()

  // 2. Inner Text
  const textContent = element.textContent?.trim().replace(/\s+/g, ' ')
  if (textContent && !isGibberish(textContent)) return textContent

  // 3. title attribute
  const title = element.getAttribute('title')
  if (title && !isGibberish(title)) return title.trim()

  // 4. value attribute (for inputs)
  if (extra?.checkValue) {
    const value = element.getAttribute('value')
    if (value && !isGibberish(value)) return value.trim()
  }

  // 5. placeholder attribute
  if (extra?.checkPlaceholder) {
    const placeholder = element.getAttribute('placeholder')
    if (placeholder && !isGibberish(placeholder)) return placeholder.trim()
  }

  // 6. Associated <label>
  const id = element.getAttribute('id')
  if (id) {
    // Avoid syntax errors in querySelector if ID contains weird characters
    try {
      const escapedId = id.replace(/"/g, '\\"')
      const labelElem = doc.querySelector(`label[for="${escapedId}"]`)
      if (labelElem) {
        const labelText = labelElem.textContent?.trim().replace(/\s+/g, ' ')
        if (labelText && !isGibberish(labelText)) return labelText
      }
    } catch {
      // Ignore querySelector errors
    }
  }

  // 7. name or id attributes fallback
  if (extra?.checkNameAndId) {
    const name = element.getAttribute('name')
    if (name && !isGibberish(name)) return name.trim()
    if (id && !isGibberish(id)) return id.trim()
  }

  return fallback
}

// ---------------------------------------------------------------------------
// Element extractors
// ---------------------------------------------------------------------------

/**
 * Extract all <button> and <input type="submit/button"> elements.
 */
function extractButtons(doc: Document, results: InteractiveElement[]): void {
  // <button> elements
  const buttons = doc.querySelectorAll('button')
  for (const btn of buttons) {
    const label = resolveLabel(btn, doc, '')
    if (!label) continue

    results.push({
      type: 'button',
      label,
      ariaLabel: btn.getAttribute('aria-label') || undefined,
    })
  }

  // <input type="submit"> and <input type="button">
  const submitInputs = doc.querySelectorAll('input[type="submit"], input[type="button"]')
  for (const input of submitInputs) {
    const label = resolveLabel(input, doc, 'Submit', { checkValue: true })

    results.push({
      type: 'button',
      label,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })
  }
}

/**
 * Extract all <form> elements with their fields.
 */
function extractForms(doc: Document, url: string, results: InteractiveElement[]): void {
  const forms = doc.querySelectorAll('form')

  for (const form of forms) {
    // Resolve form action URL
    const rawAction = form.getAttribute('action')
    let action: string | undefined
    if (rawAction) {
      try {
        action = new URL(rawAction, url).href
      } catch {
        action = rawAction
      }
    }

    // Extract field names from the form
    const fields: string[] = []
    const inputs = form.querySelectorAll('input, select, textarea')
    for (const input of inputs) {
      const name =
        input.getAttribute('name') ||
        input.getAttribute('placeholder') ||
        input.getAttribute('aria-label') ||
        input.getAttribute('id')
      if (name && !isGibberish(name)) fields.push(name)
    }

    // Form label: aria-label, name attr, or generated from fields
    let formLabel = form.getAttribute('aria-label') || form.getAttribute('name')
    if (formLabel && isGibberish(formLabel)) formLabel = null
    const label = formLabel || (fields.length > 0 ? `Form with: ${fields.slice(0, 3).join(', ')}` : 'Form')

    results.push({
      type: 'form',
      label,
      action,
      fields: fields.length > 0 ? fields : undefined,
      ariaLabel: form.getAttribute('aria-label') || undefined,
    })
  }
}

/**
 * Extract <input> and <textarea> elements NOT inside a <form>.
 */
function extractStandaloneInputs(doc: Document, results: InteractiveElement[]): void {
  const inputs = doc.querySelectorAll('input, textarea')

  for (const input of inputs) {
    // Skip if inside a form (handled by extractForms)
    if (input.closest('form')) continue

    // Skip hidden, submit, button types (handled elsewhere)
    const inputType = input.getAttribute('type')?.toLowerCase() || 'text'
    if (['hidden', 'submit', 'button'].includes(inputType)) continue

    const label = resolveLabel(input, doc, inputType, { checkPlaceholder: true, checkNameAndId: true })

    results.push({
      type: 'input',
      label: `${label} (${inputType})`,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })
  }
}

/**
 * Extract <select> elements NOT inside a <form>.
 */
function extractStandaloneSelects(doc: Document, results: InteractiveElement[]): void {
  const selects = doc.querySelectorAll('select')

  for (const select of selects) {
    // Skip if inside a form
    if (select.closest('form')) continue

    const options = select.querySelectorAll('option')
    const optionLabels: string[] = []
    for (const opt of options) {
      const text = opt.textContent?.trim()
      if (text) optionLabels.push(text)
    }

    const label = resolveLabel(select, doc, 'Select', { checkNameAndId: true })

    results.push({
      type: 'select',
      label,
      fields: optionLabels.length > 0 ? optionLabels : undefined,
      ariaLabel: select.getAttribute('aria-label') || undefined,
    })
  }
}

/**
 * Extract <a> elements with href.
 * Classifies links as navigation (nav, header, footer) vs content links.
 */
function extractLinks(doc: Document, url: string, results: InteractiveElement[]): void {
  const links = doc.querySelectorAll('a[href]')

  for (const link of links) {
    const rawHref = link.getAttribute('href')
    if (!rawHref) continue

    // Skip anchor-only links, javascript:, and mailto:
    if (
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      continue
    }

    // Resolve relative URLs
    let href: string
    try {
      href = new URL(rawHref, url).href
    } catch {
      href = rawHref
    }

    const label = resolveLabel(link, doc, href)

    // Skip empty-label links
    if (!label) continue

    // Truncate very long labels
    const truncatedLabel = label.length > 100 ? label.slice(0, 97) + '...' : label

    results.push({
      type: 'link',
      label: truncatedLabel,
      href,
      ariaLabel: link.getAttribute('aria-label') || undefined,
    })
  }
}

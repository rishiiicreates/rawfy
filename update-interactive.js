const fs = require('fs')
let content = fs.readFileSync('src/extractor/interactive.ts', 'utf-8')

const helpers = `
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
  extra?: { checkValue?: boolean; checkPlaceholder?: boolean }
): string {
  // 1. aria-label
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel && !isGibberish(ariaLabel)) return ariaLabel.trim()

  // 2. Inner Text
  const textContent = element.textContent?.trim().replace(/\\s+/g, ' ')
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
      const labelElem = doc.querySelector(\`label[for="\${CSS.escape(id)}"]\`)
      if (labelElem) {
        const labelText = labelElem.textContent?.trim().replace(/\\s+/g, ' ')
        if (labelText && !isGibberish(labelText)) return labelText
      }
    } catch {
      // Ignore querySelector errors
    }
  }

  return fallback
}
`

content = content.replace(
  '// ---------------------------------------------------------------------------\n// Element extractors\n// ---------------------------------------------------------------------------',
  helpers + '\n// ---------------------------------------------------------------------------\n// Element extractors\n// ---------------------------------------------------------------------------'
)

// Update extractButtons
content = content.replace(
  `  for (const btn of buttons) {
    const label =
      btn.getAttribute('aria-label') || btn.textContent?.trim() || btn.getAttribute('title') || ''

    if (!label) continue

    results.push({
      type: 'button',
      label,
      ariaLabel: btn.getAttribute('aria-label') || undefined,
    })
  }`,
  `  for (const btn of buttons) {
    const label = resolveLabel(btn, doc, '')
    if (!label) continue

    results.push({
      type: 'button',
      label,
      ariaLabel: btn.getAttribute('aria-label') || undefined,
    })
  }`
)

content = content.replace(
  `  for (const input of submitInputs) {
    const label = input.getAttribute('value') || input.getAttribute('aria-label') || 'Submit'

    results.push({
      type: 'button',
      label,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })
  }`,
  `  for (const input of submitInputs) {
    const label = resolveLabel(input, doc, 'Submit', { checkValue: true })
    results.push({
      type: 'button',
      label,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })
  }`
)

// Update extractForms
content = content.replace(
  `    // Extract field names from the form
    const fields: string[] = []
    const inputs = form.querySelectorAll('input, select, textarea')
    for (const input of inputs) {
      const name =
        input.getAttribute('name') ||
        input.getAttribute('id') ||
        input.getAttribute('placeholder') ||
        input.getAttribute('aria-label')
      if (name) fields.push(name)
    }

    // Form label: aria-label, name attr, or generated from fields
    const label =
      form.getAttribute('aria-label') ||
      form.getAttribute('name') ||
      (fields.length > 0 ? \`Form with: \${fields.slice(0, 3).join(', ')}\` : 'Form')`,
  `    // Extract field names from the form
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

    let formLabel = form.getAttribute('aria-label') || form.getAttribute('name')
    if (formLabel && isGibberish(formLabel)) formLabel = null

    const label = formLabel || (fields.length > 0 ? \`Form with: \${fields.slice(0, 3).join(', ')}\` : 'Form')`
)

// Update extractStandaloneInputs
content = content.replace(
  `    const label =
      input.getAttribute('aria-label') ||
      input.getAttribute('placeholder') ||
      input.getAttribute('name') ||
      input.getAttribute('id') ||
      inputType

    results.push({
      type: 'input',
      label: \`\${label} (\${inputType})\`,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })`,
  `    const label = resolveLabel(input, doc, inputType, { checkPlaceholder: true })

    results.push({
      type: 'input',
      label: \`\${label} (\${inputType})\`,
      ariaLabel: input.getAttribute('aria-label') || undefined,
    })`
)

// Update extractStandaloneSelects
content = content.replace(
  `    const label =
      select.getAttribute('aria-label') ||
      select.getAttribute('name') ||
      select.getAttribute('id') ||
      'Select'`,
  `    const label = resolveLabel(select, doc, 'Select')`
)

// Update extractLinks
content = content.replace(
  `    const label =
      link.getAttribute('aria-label') ||
      link.textContent?.trim() ||
      link.getAttribute('title') ||
      href`,
  `    const label = resolveLabel(link, doc, href)`
)

fs.writeFileSync('src/extractor/interactive.ts', content)

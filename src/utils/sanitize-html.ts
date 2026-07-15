const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

/** Confirmations only need bold labels; all other markup is treated as text. */
export function sanitizeConfirmMessage(message: string): string {
  const strong = /<strong>([\s\S]*?)<\/strong>/gi
  let result = ''
  let lastIndex = 0

  for (const match of message.matchAll(strong)) {
    const index = match.index ?? 0
    result += escapeHtml(message.slice(lastIndex, index))
    result += `<strong>${escapeHtml(match[1])}</strong>`
    lastIndex = index + match[0].length
  }

  return result + escapeHtml(message.slice(lastIndex))
}

/** Remove active SVG features before an icon reaches v-html. */
export function sanitizeSvg(svg: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') return ''

  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const tag = element.tagName.toLowerCase()
    if (['script', 'foreignobject', 'iframe', 'object', 'embed'].includes(tag)) {
      element.remove()
      continue
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || name === 'src' || name === 'action' || name === 'formaction') {
        element.removeAttribute(attribute.name)
      } else if ((name === 'href' || name === 'xlink:href') && !value.startsWith('#')) {
        element.removeAttribute(attribute.name)
      } else if (name === 'style' && value.includes('url(')) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return root.outerHTML
}

const path = require('node:path')

function parseSkillFrontmatter(content) {
  const manifest = { name: '', description: '', author: '', tags: [], format: 'opencode', language: 'en' }
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    manifest.name = path.basename(process.cwd())
  } else {
    const lines = match[1].split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (!kv) {
        i++
        continue
      }
      const [, key, val] = kv
      if (key === 'tags') {
        let tagVal = val.trim()
        if (tagVal === '' || tagVal === '[]') {
          const listTags = []
          let j = i + 1
          while (j < lines.length) {
            const item = lines[j].match(/^\s*-\s+(.+)$/)
            if (!item) break
            let t = item[1].trim()
            if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
              t = t.slice(1, -1)
            }
            if (t) listTags.push(t)
            j++
          }
          if (listTags.length) {
            manifest.tags = listTags
            i = j - 1
          }
        } else {
          manifest.tags = tagVal
            .replace(/[[\]'"]/g, '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        }
      } else if (key === 'name') {
        let n = val.trim()
        if ((n.startsWith('"') && n.endsWith('"')) || (n.startsWith("'") && n.endsWith("'"))) {
          n = n.slice(1, -1)
        }
        manifest.name = n
      } else if (key === 'description') {
        let d = val.trim()
        if ((d.startsWith('"') && d.endsWith('"')) || (d.startsWith("'") && d.endsWith("'"))) {
          d = d.slice(1, -1)
        } else {
          const blockMatch = d.match(/^([>|])([+-]?)$/)
          if (blockMatch) {
            const style = blockMatch[1]
            const chomp = blockMatch[2]
            const blockLines = []
            i++
            while (i < lines.length) {
              const next = lines[i]
              if (next === '' || next.startsWith(' ') || next.startsWith('\t')) {
                blockLines.push(next.trimEnd())
                i++
              } else {
                break
              }
            }
            i--
            if (style === '>') {
              const paragraphs = []
              let current = []
              for (const bl of blockLines) {
                if (bl === '') {
                  if (current.length) {
                    paragraphs.push(current.join(' '))
                    current = []
                  }
                } else {
                  current.push(bl)
                }
              }
              if (current.length) paragraphs.push(current.join(' '))
              d = paragraphs.join('\n\n')
              if (chomp === '+' && blockLines.length > 0) {
                const trailing = blockLines.reduce((n, l) => (l === '' ? n + 1 : 0), 0)
                for (let t = 0; t < trailing; t++) d += '\n'
              }
            } else {
              d = blockLines.join('\n').trimEnd()
            }
          } else if (d === '' || d === '""' || d === "''") {
            const nextIdx = i + 1
            if (nextIdx < lines.length && (lines[nextIdx].startsWith(' ') || lines[nextIdx].startsWith('\t'))) {
              const blockLines = []
              i++
              while (i < lines.length) {
                const curr = lines[i]
                if (curr.startsWith(' ') || curr.startsWith('\t')) {
                  blockLines.push(curr.trimEnd())
                  i++
                } else {
                  break
                }
              }
              i--
              d = blockLines.join(' ').replace(/\s+/g, ' ').trim()
            } else if (d === '""' || d === "''") {
              d = ''
            }
          }
        }
        if (d.startsWith('[') && d.endsWith(']')) {
          d = d.slice(1, -1).trim()
        }
        manifest.description = d
      } else if (key === 'author') {
        let a = val.trim()
        if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))) {
          a = a.slice(1, -1)
        }
        manifest.author = a
      } else if (key === 'format') manifest.format = val.trim()
      else if (key === 'language') manifest.language = val.trim()
      i++
    }
  }
  if (!manifest.description) {
    const bodyStart = match ? match[0].length : 0
    const body = normalized.slice(bodyStart).trim()
    const firstLine = body.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    if (firstLine) manifest.description = firstLine.trim().slice(0, 200)
  }
  return manifest
}

module.exports = { parseSkillFrontmatter }

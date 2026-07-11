function collectBlockLines(lines: string[], startI: number): { blockLines: string[]; nextI: number } {
  const blockLines: string[] = []
  let i = startI
  while (i < lines.length) {
    const next = lines[i]
    if (next === '' || next.startsWith(' ') || next.startsWith('\t')) {
      blockLines.push(next.trimEnd())
      i++
    } else {
      break
    }
  }
  return { blockLines, nextI: i }
}

function processFoldedBlock(blockLines: string[], chomp: string): string {
  const paragraphs: string[] = []
  let current: string[] = []
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
  let val = paragraphs.join('\n\n')
  if (chomp === '+' && blockLines.length > 0) {
    const trailing = blockLines.reduce((n, l) => (l === '' ? n + 1 : 0), 0)
    for (let t = 0; t < trailing; t++) val += '\n'
  }
  return val
}

function processLiteralBlock(blockLines: string[]): string {
  return blockLines.join('\n').trimEnd()
}

function collectIndentedLines(lines: string[], startI: number): { blockLines: string[]; nextI: number } {
  const blockLines: string[] = []
  let i = startI
  while (i < lines.length) {
    const curr = lines[i]
    if (curr.startsWith(' ') || curr.startsWith('\t')) {
      blockLines.push(curr.trimEnd())
      i++
    } else {
      break
    }
  }
  return { blockLines, nextI: i }
}

function parseKeyValue(line: string): { key: string; val: string } | null {
  const sep = line.indexOf(':')
  if (sep <= 0) return null
  const key = line.slice(0, sep).trim()
  const val = line.slice(sep + 1).trim()
  return { key, val }
}

function stripBrackets(val: string): string {
  if (val.startsWith('[') && val.endsWith(']')) {
    return val.slice(1, -1).trim()
  }
  return val
}

function tryParseQuotedValue(val: string): string | null {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }
  return null
}

function extractBodyDescription(normalized: string, match: RegExpMatchArray | null): string | undefined {
  const bodyStart = match ? match[0].length : 0
  const body = normalized.slice(bodyStart).trim()
  const firstLine = body.split('\n').find((l) => l.trim() && !l.startsWith('#') && l.trim() !== '---')
  if (firstLine) return firstLine.trim().slice(0, 200)
  return undefined
}

export function extractChineseSummary(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const match = normalized.match(/^---\n[\s\S]*?\n---\n?/)
  const bodyStart = match ? match[0].length : 0
  const body = normalized.slice(bodyStart).trim()
  const lines = body.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) continue
    const chineseChars = trimmed.match(/[\u4e00-\u9fff]/g)
    if (chineseChars && chineseChars.length / trimmed.length > 0.1) {
      return trimmed.slice(0, 200)
    }
  }
  return ''
}

export function parseFrontmatter(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---/)
  const fm: Record<string, string> = {}
  if (match) {
    const lines = match[1].split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const parsed = parseKeyValue(line)
      if (!parsed) {
        i++
        continue
      }
      const { key, val: rawVal } = parsed

      const quoted = tryParseQuotedValue(rawVal)
      if (quoted !== null) {
        fm[key] = quoted
        i++
        continue
      }

      let val = rawVal
      const blockMatch = val.match(/^([>|])([+-]?)$/)
      if (blockMatch) {
        const style = blockMatch[1]
        const chomp = blockMatch[2]
        const { blockLines, nextI } = collectBlockLines(lines, i + 1)
        i = nextI - 1
        val = style === '>' ? processFoldedBlock(blockLines, chomp) : processLiteralBlock(blockLines)
      } else if (val === '' || val === '""' || val === "''") {
        if (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
          const { blockLines, nextI } = collectIndentedLines(lines, i + 1)
          i = nextI - 1
          val = blockLines.join(' ').replace(/\s+/g, ' ').trim()
        }
      }

      val = stripBrackets(val)
      fm[key] = val
      i++
    }
  }
  if (!fm.description) {
    const desc = extractBodyDescription(normalized, match)
    if (desc) fm.description = desc
  }
  return fm
}

const path = require('node:path')
const os = require('node:os')

function homeDir() {
  return os.homedir()
}

function expandPath(p) {
  if (!p) return ''
  return p.replace(/^~/, homeDir())
}

/** Resolve path under base; throw if result escapes base (Zip Slip / absolute / ..). */
function safeResolveWithin(base, ...parts) {
  if (!base) throw new Error('safeJoin: base is required')
  const fullBase = path.resolve(expandPath(base))
  for (const part of parts) {
    if (part == null || part === '') continue
    const s = String(part)
    if (path.isAbsolute(s) || path.win32.isAbsolute(s)) {
      throw new Error(`Path escapes base directory: "${s}"`)
    }
  }
  const resolved = path.resolve(fullBase, ...parts.map((p) => String(p)))
  const rel = path.relative(fullBase, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel) || path.win32.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: "${parts.filter(Boolean).join('/')}"`)
  }
  return resolved
}

function isWindows() {
  return process.platform === 'win32'
}

function isMacOS() {
  return process.platform === 'darwin'
}

module.exports = {
  homeDir,
  expandPath,
  safeResolveWithin,
  isWindows,
  isMacOS,
}

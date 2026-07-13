const path = require('node:path')
const os = require('node:os')
const { homeDir, expandPath } = require('./path-utils')

const _bootstrapRoots = new Set()
const _dynamicRoots = new Set()
let _rootsBootstrapped = false

function _addRootTo(set, p) {
  if (!p) return
  try {
    const full = path.resolve(expandPath(String(p)))
    if (full) set.add(full)
  } catch {
    /* ignore invalid roots */
  }
}

function ensureBootstrapRoots() {
  if (_rootsBootstrapped) return
  _rootsBootstrapped = true
  try {
    const ud = typeof window !== 'undefined' && window.ztools?.getPath?.('userData')
    if (ud) _addRootTo(_bootstrapRoots, ud)
  } catch {
    /* ignore */
  }
  _addRootTo(_bootstrapRoots, path.join(homeDir(), '.cache', 'skill-hub'))
  _addRootTo(_bootstrapRoots, path.join(os.tmpdir(), 'skill-hub'))
}

function getAllowedWriteRoots() {
  ensureBootstrapRoots()
  return [..._bootstrapRoots, ..._dynamicRoots]
}

function isUnderAllowedRoot(filePath) {
  const full = path.resolve(expandPath(filePath))
  const key = process.platform === 'win32' ? full.toLowerCase() : full
  for (const root of getAllowedWriteRoots()) {
    const rk = process.platform === 'win32' ? root.toLowerCase() : root
    if (key === rk || key.startsWith(rk + path.sep)) return true
  }
  return false
}

/** Resolve and assert path is under an allowed write root. Returns absolute path. */
function assertWritable(filePath) {
  const full = path.resolve(expandPath(filePath))
  if (!isUnderAllowedRoot(full)) {
    throw new Error(`Write blocked: path is outside allowed roots: ${full}`)
  }
  return full
}

function setAllowedWriteRoots(paths) {
  _dynamicRoots.clear()
  ensureBootstrapRoots()
  if (Array.isArray(paths)) {
    for (const p of paths) _addRootTo(_dynamicRoots, p)
  }
}

module.exports = {
  ensureBootstrapRoots,
  getAllowedWriteRoots,
  isUnderAllowedRoot,
  assertWritable,
  setAllowedWriteRoots,
}

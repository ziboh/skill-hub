const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { expandPath, safeResolveWithin, isWindows } = require('./path-utils')
const { assertWritable, isUnderAllowedRoot } = require('./write-roots')

function doAtomicReplaceDir(sourceDir, targetDir) {
  const fullSrc = expandPath(sourceDir)
  const fullTarget = assertWritable(targetDir)
  assertWritable(path.dirname(fullTarget))
  if (!fs.existsSync(fullSrc)) {
    throw new Error(`atomicReplaceDir: source does not exist: ${fullSrc}`)
  }
  const hasSkill = ['SKILL.md', 'skill.md'].some((f) => fs.existsSync(path.join(fullSrc, f)))
  if (!hasSkill) {
    throw new Error('SKILL.md not found in source directory')
  }
  if (fs.existsSync(fullTarget)) {
    fs.rmSync(fullTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } else {
    fs.mkdirSync(path.dirname(fullTarget), { recursive: true })
  }
  fs.cpSync(fullSrc, fullTarget, { recursive: true, dereference: true })
}

function doAtomicWriteDir(targetDir, files) {
  const fullTarget = assertWritable(targetDir)
  assertWritable(path.dirname(fullTarget))
  if (fs.existsSync(fullTarget)) {
    fs.rmSync(fullTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  fs.mkdirSync(fullTarget, { recursive: true })
  const entries = files instanceof Map ? files.entries() : Object.entries(files)
  for (const [rel, content] of entries) {
    const full = safeResolveWithin(fullTarget, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, { encoding: 'utf-8' })
  }
  const hasSkill = ['SKILL.md', 'skill.md'].some((f) => fs.existsSync(path.join(fullTarget, f)))
  if (!hasSkill) {
    throw new Error('SKILL.md not found in downloaded files')
  }
}

function readFile(file) {
  try {
    return fs.readFileSync(expandPath(file), { encoding: 'utf-8' })
  } catch {
    return null
  }
}

function pathExists(p) {
  const full = expandPath(p)
  try {
    fs.lstatSync(full)
    return true
  } catch {
    return false
  }
}

function mkdir(dir) {
  const full = assertWritable(dir)
  fs.mkdirSync(full, { recursive: true })
}

function openFolder(dir) {
  const fullPath = expandPath(dir)
  if (!fs.existsSync(fullPath)) return
  if (isWindows()) {
    execFile('explorer', [fullPath])
  } else if (process.platform === 'darwin') {
    execFile('open', [fullPath])
  } else {
    execFile('xdg-open', [fullPath])
  }
}

function readDir(dir) {
  try {
    return fs.readdirSync(expandPath(dir), { withFileTypes: true }).map((d) => ({
      name: d.name,
      path: path.join(expandPath(dir), d.name),
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
      isSymlink: d.isSymbolicLink(),
    }))
  } catch {
    return []
  }
}

function readFileText(filePath) {
  try {
    return fs.readFileSync(expandPath(filePath), { encoding: 'utf-8' })
  } catch {
    return null
  }
}

function writeFile(filePath, content) {
  const full = assertWritable(filePath)
  const parent = path.dirname(full)
  assertWritable(parent)
  fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(full, content, { encoding: 'utf-8' })
}

function removeFile(filePath) {
  const full = assertWritable(filePath)
  try {
    fs.lstatSync(full)
    fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (e) {
    if (fs.existsSync(full)) {
      console.error('[services] removeFile failed for', full, e)
      throw e
    }
  }
}

function removeEmptyAncestors(filePath) {
  const full = expandPath(filePath)
  if (!full) return
  const stopDir = path.resolve(expandPath(path.join(window.ztools.getPath('userData'), 'skills-repo')))
  if (!isUnderAllowedRoot(full) && !isUnderAllowedRoot(path.dirname(full))) return
  let dir = path.dirname(full)
  const stopKey = process.platform === 'win32' ? stopDir.toLowerCase() : stopDir
  while (true) {
    const dirKey = process.platform === 'win32' ? dir.toLowerCase() : dir
    if (dirKey.length < stopKey.length || !(dirKey === stopKey || dirKey.startsWith(stopKey + path.sep))) break
    if (dirKey === stopKey) break
    try {
      const entries = fs.readdirSync(dir)
      if (entries.length === 0) {
        fs.rmdirSync(dir)
        dir = path.dirname(dir)
      } else {
        break
      }
    } catch {
      break
    }
  }
}

function copyFile(src, dest) {
  const fullSrc = expandPath(src)
  const fullDest = assertWritable(dest)
  assertWritable(path.dirname(fullDest))
  fs.mkdirSync(path.dirname(fullDest), { recursive: true })

  let srcIsDir = false
  try {
    srcIsDir = fs.statSync(fullSrc).isDirectory()
  } catch {
    throw new Error(`copyFile: source does not exist: ${fullSrc}`)
  }

  if (srcIsDir) {
    if (fs.existsSync(fullDest)) {
      fs.rmSync(fullDest, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    fs.cpSync(fullSrc, fullDest, { recursive: true, dereference: true })
    return
  }

  if (fs.existsSync(fullDest)) {
    fs.rmSync(fullDest, { force: true, maxRetries: 5, retryDelay: 100 })
  }
  fs.cpSync(fullSrc, fullDest, { recursive: false, dereference: true })
}

function stat(p) {
  try {
    const s = fs.statSync(expandPath(p))
    return {
      exists: true,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      isSymlink: s.isSymbolicLink(),
      size: s.size,
      mtime: s.mtime.toISOString(),
    }
  } catch {
    return { exists: false }
  }
}

function saveIconFile(sourceFilePath) {
  const iconsDir = path.join(window.ztools.getPath('userData'), 'store-icons')
  mkdir(iconsDir)
  const ext = path.extname(sourceFilePath).toLowerCase() || '.png'
  const fileName = `icon-${Date.now()}${ext}`
  const dest = path.join(iconsDir, fileName)
  copyFile(sourceFilePath, dest)
  return dest
}

function writeSvgFile(svgContent, fileName) {
  const iconsDir = path.join(window.ztools.getPath('userData'), 'store-icons')
  mkdir(iconsDir)
  const name = fileName || `icon-${Date.now()}.svg`
  const dest = path.join(iconsDir, name)
  fs.writeFileSync(dest, svgContent, 'utf-8')
  return dest
}

function listIconFiles() {
  const iconsDir = path.join(window.ztools.getPath('userData'), 'store-icons')
  if (!fs.existsSync(iconsDir)) return []
  try {
    return fs.readdirSync(iconsDir).filter((f) => /\.(svg|png|jpe?g|gif|ico)$/i.test(f))
  } catch {
    return []
  }
}

function readFileAsDataUri(filePath) {
  try {
    const buffer = fs.readFileSync(expandPath(filePath))
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const mimeMap = {
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      ico: 'image/x-icon',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function createSymlink(target, linkPath) {
  const fullTarget = expandPath(target)
  const fullLink = assertWritable(linkPath)
  assertWritable(path.dirname(fullLink))
  fs.mkdirSync(path.dirname(fullLink), { recursive: true })
  try {
    fs.lstatSync(fullLink)
    fs.rmSync(fullLink, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* ignore */
  }

  if (isWindows()) {
    try {
      const stats = fs.statSync(fullTarget)
      if (stats.isDirectory()) {
        fs.symlinkSync(fullTarget, fullLink, 'junction')
      } else {
        fs.symlinkSync(fullTarget, fullLink, 'file')
      }
    } catch {
      throw new Error(`Cannot create symlink: target "${fullTarget}" does not exist or is not accessible`)
    }
  } else {
    fs.symlinkSync(fullTarget, fullLink)
  }
  return fullLink
}

module.exports = {
  doAtomicReplaceDir,
  doAtomicWriteDir,
  readFile,
  pathExists,
  mkdir,
  openFolder,
  readDir,
  readFileText,
  writeFile,
  removeFile,
  removeEmptyAncestors,
  copyFile,
  stat,
  saveIconFile,
  writeSvgFile,
  listIconFiles,
  readFileAsDataUri,
  createSymlink,
}

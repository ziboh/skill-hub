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
  const tempDir = createTempSibling(fullTarget)
  try {
    fs.cpSync(fullSrc, tempDir, { recursive: true, dereference: true })
    replaceDirectory(tempDir, fullTarget)
  } catch (error) {
    removeIfExists(tempDir)
    throw error
  }
}

function doAtomicWriteDir(targetDir, files) {
  const fullTarget = assertWritable(targetDir)
  assertWritable(path.dirname(fullTarget))
  const tempDir = createTempSibling(fullTarget)
  const entries = files instanceof Map ? files.entries() : Object.entries(files)
  try {
    fs.mkdirSync(tempDir, { recursive: true })
    for (const [rel, content] of entries) {
      const full = safeResolveWithin(tempDir, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content, { encoding: 'utf-8' })
    }
    const hasSkill = ['SKILL.md', 'skill.md'].some((f) => fs.existsSync(path.join(tempDir, f)))
    if (!hasSkill) throw new Error('SKILL.md not found in downloaded files')
    replaceDirectory(tempDir, fullTarget)
  } catch (error) {
    removeIfExists(tempDir)
    throw error
  }
}

function createTempSibling(targetDir) {
  return `${targetDir}.skill-hub-tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function replaceDirectory(tempDir, targetDir) {
  const backupDir = `${targetDir}.skill-hub-backup-${process.pid}-${Date.now()}`
  const hadTarget = fs.existsSync(targetDir)
  try {
    if (hadTarget) fs.renameSync(targetDir, backupDir)
    fs.renameSync(tempDir, targetDir)
    if (hadTarget) removeIfExists(backupDir)
  } catch (error) {
    removeIfExists(targetDir)
    if (hadTarget && fs.existsSync(backupDir)) fs.renameSync(backupDir, targetDir)
    throw error
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

function renamePath(sourcePath, targetPath) {
  const fullSource = assertWritable(sourcePath)
  const fullTarget = assertWritable(targetPath)
  assertWritable(path.dirname(fullTarget))
  fs.renameSync(fullSource, fullTarget)
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
  const dest = safeResolveWithin(iconsDir, name)
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

const DISABLED_SKILL_FILE_NAME = 'SKILL.md.disabled'
const DISABLED_LINK_SUFFIX = '.skillhub-disabled'

function createSkillDirectoryLink(target, linkPath) {
  if (isWindows()) {
    const stats = fs.statSync(target)
    fs.symlinkSync(target, linkPath, stats.isDirectory() ? 'junction' : 'file')
  } else {
    fs.symlinkSync(target, linkPath)
  }
}

function setSkillEnabled(skillDir, enabled) {
  const fullDir = assertWritable(skillDir)
  assertWritable(path.dirname(fullDir))
  const activeFile = path.join(fullDir, 'SKILL.md')
  const disabledFile = path.join(fullDir, DISABLED_SKILL_FILE_NAME)
  const disabledLinkFile = `${fullDir}${DISABLED_LINK_SUFFIX}`

  if (enabled) {
    if (fs.existsSync(disabledLinkFile)) {
      if (fs.existsSync(fullDir) || fs.existsSync(activeFile)) {
        throw new Error(`无法启用 Skill：目标路径已存在: ${fullDir}`)
      }
      const target = fs.readFileSync(disabledLinkFile, 'utf-8').trim()
      if (!target) throw new Error('无法启用 Skill：软链接目标为空')
      createSkillDirectoryLink(expandPath(target), fullDir)
      fs.rmSync(disabledLinkFile, { force: true })
      return { enabled: true, path: fullDir }
    }

    if (fs.existsSync(activeFile)) return { enabled: true, path: fullDir }
    if (!fs.existsSync(disabledFile)) throw new Error(`无法启用 Skill：未找到 ${DISABLED_SKILL_FILE_NAME}`)
    fs.renameSync(disabledFile, activeFile)
    return { enabled: true, path: fullDir }
  }

  if (fs.existsSync(disabledLinkFile)) return { enabled: false, path: fullDir }

  let stats
  try {
    stats = fs.lstatSync(fullDir)
  } catch {
    throw new Error(`无法停用 Skill：目录不存在: ${fullDir}`)
  }

  if (stats.isSymbolicLink()) {
    const rawTarget = fs.readlinkSync(fullDir)
    const target = path.isAbsolute(rawTarget)
      ? rawTarget
      : path.resolve(path.dirname(fullDir), rawTarget)
    fs.writeFileSync(disabledLinkFile, target, 'utf-8')
    fs.rmSync(fullDir, { recursive: true, force: true })
    return { enabled: false, path: fullDir }
  }

  if (fs.existsSync(disabledFile)) return { enabled: false, path: fullDir }
  if (!fs.existsSync(activeFile)) throw new Error(`无法停用 Skill：未找到 SKILL.md: ${fullDir}`)
  fs.renameSync(activeFile, disabledFile)
  return { enabled: false, path: fullDir }
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
  renamePath,
  removeFile,
  removeEmptyAncestors,
  copyFile,
  stat,
  saveIconFile,
  writeSvgFile,
  listIconFiles,
  readFileAsDataUri,
  createSymlink,
  setSkillEnabled,
}

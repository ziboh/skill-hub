const fs = require('node:fs')
const path = require('node:path')
const { expandPath } = require('./path-utils')
const { parseSkillFrontmatter } = require('./frontmatter')

const ACTIVE_SKILL_FILE_NAME = 'SKILL.md'
const DISABLED_SKILL_FILE_NAME = 'SKILL.md.disabled'
const DISABLED_LINK_SUFFIX = '.skillhub-disabled'

function makeResult(name, dir, skillFile, content, isSymlink, enabled) {
  return {
    name,
    dir,
    skillFile,
    content,
    isSymlink,
    enabled,
    manifest: parseSkillFrontmatter(content),
  }
}

function readDisabledLinkResult(root, entryName, entryPath) {
  try {
    const rawTargetDir = fs.readFileSync(entryPath, 'utf-8').trim()
    if (!rawTargetDir) return null
    const expandedTargetDir = expandPath(rawTargetDir)
    const targetDir = path.isAbsolute(expandedTargetDir)
      ? expandedTargetDir
      : path.resolve(rootDir, expandedTargetDir)
    const skillFile = path.join(targetDir, ACTIVE_SKILL_FILE_NAME)
    if (!fs.existsSync(skillFile)) return null
    const content = fs.readFileSync(skillFile, 'utf-8')
    const originalName = entryName.slice(0, -DISABLED_LINK_SUFFIX.length)
    return makeResult(originalName, path.join(root, originalName), skillFile, content, true, false)
  } catch {
    return null
  }
}

function scanForSkills(rootDir, options = {}) {
  const fullRoot = expandPath(rootDir)
  const includeDisabled = options.includeDisabled === true
  const results = []
  if (!fs.existsSync(fullRoot)) return results
  try {
    const entries = fs.readdirSync(fullRoot, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(fullRoot, entry.name)

      if (includeDisabled && entry.isFile() && entry.name.endsWith(DISABLED_LINK_SUFFIX)) {
        const disabledLink = readDisabledLinkResult(fullRoot, entry.name, entryPath)
        if (disabledLink) results.push(disabledLink)
        continue
      }

      let isDir = entry.isDirectory()
      const isSymlinkEntry = entry.isSymbolicLink ? entry.isSymbolicLink() : false
      if (!isDir && !isSymlinkEntry) {
        try {
          const st = fs.statSync(entryPath)
          isDir = st.isDirectory()
        } catch {
          /* ignore */
        }
      }

      if (!isDir && !isSymlinkEntry) continue

      const activeSkillPath = path.join(entryPath, ACTIVE_SKILL_FILE_NAME)
      const disabledSkillPath = path.join(entryPath, DISABLED_SKILL_FILE_NAME)
      const skillPath = fs.existsSync(activeSkillPath)
        ? activeSkillPath
        : includeDisabled && fs.existsSync(disabledSkillPath)
          ? disabledSkillPath
          : null
      if (!skillPath) continue

      const content = fs.readFileSync(skillPath, 'utf-8')
      let isSymlink = isSymlinkEntry
      if (!isSymlink) {
        try {
          const lstats = fs.lstatSync(entryPath)
          isSymlink = lstats.isSymbolicLink()
        } catch {
          /* ignore */
        }
      }
      results.push(makeResult(entry.name, entryPath, skillPath, content, isSymlink, skillPath === activeSkillPath))
    }
  } catch {
    /* ignore scan errors */
  }
  return results
}

function scanForSkillFiles(dirs, options = {}) {
  const all = []
  for (const dir of dirs) {
    const found = scanForSkills(dir, options)
    all.push(...found)
  }
  return all
}

function scanForSkillFilesIncludingDisabled(dirs) {
  return scanForSkillFiles(dirs, { includeDisabled: true })
}

function parseSkillFile(filePath) {
  const full = expandPath(filePath)
  if (!fs.existsSync(full)) return null
  const content = fs.readFileSync(full, 'utf-8')
  return { content, manifest: parseSkillFrontmatter(content) }
}

module.exports = {
  ACTIVE_SKILL_FILE_NAME,
  DISABLED_SKILL_FILE_NAME,
  DISABLED_LINK_SUFFIX,
  scanForSkills,
  scanForSkillFiles,
  scanForSkillFilesIncludingDisabled,
  parseSkillFile,
}

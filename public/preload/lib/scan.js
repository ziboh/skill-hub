const fs = require('node:fs')
const path = require('node:path')
const { expandPath } = require('./path-utils')
const { parseSkillFrontmatter } = require('./frontmatter')

function scanForSkills(rootDir) {
  const fullRoot = expandPath(rootDir)
  const results = []
  if (!fs.existsSync(fullRoot)) return results
  try {
    const entries = fs.readdirSync(fullRoot, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(fullRoot, entry.name)
      let isDir = entry.isDirectory()
      let isSymlinkEntry = entry.isSymbolicLink ? entry.isSymbolicLink() : false

      if (!isDir && !isSymlinkEntry) {
        try {
          const st = fs.statSync(entryPath)
          isDir = st.isDirectory()
        } catch {
          /* ignore */
        }
      }

      if (isDir || isSymlinkEntry) {
        const skillPath = path.join(entryPath, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
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
          results.push({
            name: entry.name,
            dir: entryPath,
            skillFile: skillPath,
            content,
            isSymlink,
            manifest: parseSkillFrontmatter(content),
          })
        }
      }
    }
  } catch {
    /* ignore scan errors */
  }
  return results
}

function scanForSkillFiles(dirs) {
  const all = []
  for (const dir of dirs) {
    const found = scanForSkills(dir)
    all.push(...found)
  }
  return all
}

function parseSkillFile(filePath) {
  const full = expandPath(filePath)
  if (!fs.existsSync(full)) return null
  const content = fs.readFileSync(full, 'utf-8')
  return { content, manifest: parseSkillFrontmatter(content) }
}

module.exports = {
  scanForSkills,
  scanForSkillFiles,
  parseSkillFile,
}

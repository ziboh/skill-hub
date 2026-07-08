const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const http = require('node:http')
const os = require('node:os')
const { execFile } = require('node:child_process')
const crypto = require('node:crypto')
const AdmZip = require('adm-zip')
function homeDir() {
  return os.homedir()
}

function expandPath(p) {
  if (!p) return ''
  return p.replace(/^~/, homeDir())
}

function isWindows() {
  return process.platform === 'win32'
}

function isMacOS() {
  return process.platform === 'darwin'
}

// --- Rate Limit State ---
const _rateLimitState = { remaining: 5000, reset: 0 }

function _updateRateLimit(headers) {
  const remaining = headers['x-ratelimit-remaining']
  const reset = headers['x-ratelimit-reset']
  if (remaining !== undefined) _rateLimitState.remaining = Number(remaining)
  if (reset !== undefined) _rateLimitState.reset = Number(reset)
}

async function _rateLimitWait() {
  if (_rateLimitState.remaining > 10) return
  const resetMs = _rateLimitState.reset * 1000
  const waitMs = resetMs - Date.now() + 1000
  if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, 60000)))
}

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function _downloadFileInternal(url, token, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'))
    }
    const headers = { 'User-Agent': 'skill-hub' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const client = url.startsWith('https') ? https : http

    function doRequest(retriesLeft) {
      client.get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(_downloadFileInternal(res.headers.location, token, redirectCount + 1))
        }
        _updateRateLimit(res.headers)

        if ((res.statusCode === 429 || res.statusCode === 403) && retriesLeft > 0) {
          res.resume()
          const retryAfter = res.headers['retry-after']
          const waitMs = retryAfter ? Number(retryAfter) * 1000 : (4 - retriesLeft) * 2000
          return _sleep(Math.min(waitMs, 30000)).then(() => doRequest(retriesLeft - 1))
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: ${res.statusCode}`))
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', (err) => {
        if (retriesLeft > 0) {
          _sleep(2000).then(() => doRequest(retriesLeft - 1))
        } else {
          reject(err)
        }
      })
    }

    _rateLimitWait().then(() => doRequest(2))
  })
}

function _fetchGitHubTextInternal(url, token, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'))
    }
    const headers = {
      Accept: 'application/vnd.github.v3.raw',
      'User-Agent': 'skill-hub',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const client = url.startsWith('https') ? https : http

    function doRequest(retriesLeft) {
      client.get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(_fetchGitHubTextInternal(res.headers.location, token, redirectCount + 1))
        }
        _updateRateLimit(res.headers)

        if ((res.statusCode === 429 || res.statusCode === 403) && retriesLeft > 0) {
          res.resume()
          const retryAfter = res.headers['retry-after']
          const waitMs = retryAfter ? Number(retryAfter) * 1000 : (4 - retriesLeft) * 2000
          return _sleep(Math.min(waitMs, 30000)).then(() => doRequest(retriesLeft - 1))
        }

        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`GitHub raw: ${res.statusCode}`))
          else resolve(data)
        })
        res.on('error', reject)
      }).on('error', (err) => {
        if (retriesLeft > 0) {
          _sleep(2000).then(() => doRequest(retriesLeft - 1))
        } else {
          reject(err)
        }
      })
    }

    _rateLimitWait().then(() => doRequest(2))
  })
}

function _fetchGitHubJSONInternal(url, token, redirectCount) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'))
    }
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'skill-hub',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const client = url.startsWith('https') ? https : http

    function doRequest(retriesLeft) {
      client.get(url, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(_fetchGitHubJSONInternal(res.headers.location, token, redirectCount + 1))
        }
        _updateRateLimit(res.headers)

        if ((res.statusCode === 429 || res.statusCode === 403) && retriesLeft > 0) {
          res.resume()
          const retryAfter = res.headers['retry-after']
          const waitMs = retryAfter ? Number(retryAfter) * 1000 : (4 - retriesLeft) * 2000
          return _sleep(Math.min(waitMs, 30000)).then(() => doRequest(retriesLeft - 1))
        }

        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`GitHub API: ${res.statusCode}`))
          else {
            try { resolve(JSON.parse(data)) }
            catch (e) { reject(new Error(`GitHub API JSON parse error: ${e.message}`)) }
          }
        })
        res.on('error', reject)
      }).on('error', (err) => {
        if (retriesLeft > 0) {
          _sleep(2000).then(() => doRequest(retriesLeft - 1))
        } else {
          reject(err)
        }
      })
    }

    _rateLimitWait().then(() => doRequest(2))
  })
}

window.services = {
  hashContent(content) {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex')
  },
  // === 原始保留服务 ===
  readFile(file) {
    try {
      return fs.readFileSync(expandPath(file), { encoding: 'utf-8' })
    } catch {
      return null
    }
  },
  // === 路径工具 ===
  expandPath,
  homeDir,
  isWindows,
  isMacOS,
  pathJoin: (...parts) => path.join(...parts),
  pathExists(p) {
    const full = expandPath(p)
    try {
      fs.lstatSync(full)
      return true
    } catch {
      return false
    }
  },
  mkdir(dir) {
    fs.mkdirSync(expandPath(dir), { recursive: true })
  },
  openFolder(dir) {
    const fullPath = expandPath(dir)
    if (!fs.existsSync(fullPath)) return
    if (isWindows()) {
      execFile('explorer', [fullPath])
    } else if (process.platform === 'darwin') {
      execFile('open', [fullPath])
    } else {
      execFile('xdg-open', [fullPath])
    }
  },
  readDir(dir) {
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
  },
  readFileText(filePath) {
    try {
      return fs.readFileSync(expandPath(filePath), { encoding: 'utf-8' })
    } catch {
      return null
    }
  },
  writeFile(filePath, content) {
    const full = expandPath(filePath)
    this.mkdir(path.dirname(full))
    fs.writeFileSync(full, content, { encoding: 'utf-8' })
  },
  removeFile(filePath) {
    const full = expandPath(filePath)
    try {
      fs.lstatSync(full)
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch (e) {
      // On Windows junction symlinks, rmSync removes the link but not the target — force:true helps.
      // If the directory still exists after rmSync, log the failure for debugging.
      if (fs.existsSync(full)) {
        console.error('[services] removeFile failed for', full, e)
        throw e
      }
    }
  },
  copyFile(src, dest) {
    const fullSrc = expandPath(src)
    const fullDest = expandPath(dest)
    this.mkdir(path.dirname(fullDest))
    const tempDest = fullDest + `.tmp.${Date.now()}`
    try {
      fs.cpSync(fullSrc, tempDest, { recursive: true, dereference: true })
      try { fs.rmSync(fullDest, { recursive: true, force: true }) } catch {}
      try {
        fs.renameSync(tempDest, fullDest)
      } catch {
        fs.cpSync(tempDest, fullDest, { recursive: true, dereference: true })
        fs.rmSync(tempDest, { recursive: true, force: true })
      }
    } catch (err) {
      try { fs.rmSync(tempDest, { recursive: true, force: true }) } catch {}
      throw err
    }
  },
  stat(p) {
    try {
      const s = fs.statSync(expandPath(p))
      return { exists: true, isDirectory: s.isDirectory(), isFile: s.isFile(), isSymlink: s.isSymbolicLink(), size: s.size, mtime: s.mtime.toISOString() }
    } catch {
      return { exists: false }
    }
  },

  // === 图标文件管理 ===
  saveIconFile(sourceFilePath) {
    const iconsDir = path.join(window.ztools.getPath('userData'), 'store-icons')
    this.mkdir(iconsDir)
    const ext = path.extname(sourceFilePath).toLowerCase() || '.png'
    const fileName = `icon-${Date.now()}${ext}`
    const dest = path.join(iconsDir, fileName)
    this.copyFile(sourceFilePath, dest)
    return dest
  },
  readFileAsDataUri(filePath) {
    try {
      const buffer = fs.readFileSync(expandPath(filePath))
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeMap = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', ico: 'image/x-icon' }
      const mime = mimeMap[ext] || 'application/octet-stream'
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch { return null }
  },

  // === Symlink 支持 ===
  createSymlink(target, linkPath) {
    const fullTarget = expandPath(target)
    const fullLink = expandPath(linkPath)
    this.mkdir(path.dirname(fullLink))
    try {
      fs.lstatSync(fullLink)
      fs.rmSync(fullLink, { recursive: true })
    } catch {}
    if (isWindows()) {
      try {
        const stats = fs.statSync(fullTarget)
        if (stats.isDirectory()) {
          fs.symlinkSync(fullTarget, fullLink, 'junction')
        } else {
          fs.symlinkSync(fullTarget, fullLink, 'file')
        }
      } catch (e) {
        throw new Error(`Cannot create symlink: target "${fullTarget}" does not exist or is not accessible`)
      }
    } else {
      fs.symlinkSync(fullTarget, fullLink)
    }
    return fullLink
  },
  // === 下载 ===
  downloadFile(url, token) {
    return _downloadFileInternal(url, token, 0)
  },
  fetchGitHubText(url, token) {
    return _fetchGitHubTextInternal(url, token, 0)
  },

  // === 压缩包解压 ===
  extractBufferZip(buffer, dest) {
    const fullDest = expandPath(dest)
    this.mkdir(fullDest)
    const zip = new AdmZip(Buffer.from(buffer))
    const entries = zip.getEntries()
    for (const entry of entries) {
      const entryPath = entry.entryName
      const resolved = path.resolve(fullDest, entryPath)
      if (!resolved.startsWith(fullDest + path.sep) && resolved !== fullDest) {
        throw new Error(`Zip Slip detected: "${entryPath}" escapes destination`)
      }
    }
    zip.extractAllTo(fullDest, true)
    return fullDest
  },
  // === SKILL.md 扫描 ===
  scanForSkills(rootDir) {
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
          } catch {}
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
              } catch {}
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
    } catch {}
    return results
  },
  scanForSkillFiles(dirs) {
    const all = []
    for (const dir of dirs) {
      const found = this.scanForSkills(dir)
      all.push(...found)
    }
    return all
  },
  parseSkillFile(filePath) {
    const full = expandPath(filePath)
    if (!fs.existsSync(full)) return null
    const content = fs.readFileSync(full, 'utf-8')
    return { content, manifest: parseSkillFrontmatter(content) }
  },

  // === GitHub JSON API ===
  fetchGitHubJSON(url, token) {
    return _fetchGitHubJSONInternal(url, token, 0)
  },

  // === Skill Update Check ===
  async checkSkillUpdate(repo, skillPath, token, branch) {
    const pathCandidates = [
      skillPath ? `${skillPath}/SKILL.md` : null,
      skillPath ? `skills/${skillPath}/SKILL.md` : null,
      skillPath ? `agent-skills/${skillPath}/SKILL.md` : null,
      'SKILL.md',
    ].filter(Boolean)
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
    const tried = new Set()
    for (const b of branches) {
      if (tried.has(b)) continue
      tried.add(b)
      for (const p of pathCandidates) {
        const url = `https://raw.githubusercontent.com/${repo}/${b}/${p}`
        try {
          const text = await this.fetchGitHubText(url, token)
          return text
        } catch (err) {
          if (err.message?.includes('404')) continue
          throw err
        }
      }
    }
    return null
  },

  // === Full Skill Update Check (all files) ===
  async getLatestCommitSha(repo, branch, token) {
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
    const tried = new Set()
    for (const b of branches) {
      if (tried.has(b)) continue
      tried.add(b)
      try {
        const data = await this.fetchGitHubJSON(`https://api.github.com/repos/${repo}/commits/${b}`, token)
        return data.sha
      } catch (err) {
        if (err.message?.includes('404') && b !== branches[branches.length - 1]) continue
        throw err
      }
    }
    return null
  },

  async getRemoteSkillTree(repo, skillPath, branch, token) {
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
    const pathCandidates = skillPath
      ? [skillPath, `skills/${skillPath}`, `agent-skills/${skillPath}`]
      : ['']
    const tried = new Set()
    for (const b of branches) {
      if (tried.has(b)) continue
      tried.add(b)
      // Get commit to find tree SHA
      let treeSha
      try {
        const commit = await this.fetchGitHubJSON(`https://api.github.com/repos/${repo}/commits/${b}`, token)
        treeSha = commit.commit?.tree?.sha || commit.sha
      } catch (err) {
        if (err.message?.includes('404') && b !== branches[branches.length - 1]) continue
        throw err
      }
      // Try each path candidate against the tree
      for (const p of pathCandidates) {
        try {
          const data = await this.fetchGitHubJSON(
            `https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`,
            token
          )
          if (data && data.tree) {
            const prefix = p ? `${p}/` : ''
            const files = data.tree
              .filter((item) => item.type === 'blob' && item.path.startsWith(prefix))
              .map((item) => ({
                path: prefix ? item.path.slice(prefix.length) : item.path,
                size: item.size || 0,
              }))
            if (files.length > 0) return files
          }
        } catch (err) {
          if (err.message?.includes('404')) continue
          throw err
        }
      }
    }
    return null
  },

  saveSkillMeta(skillDir, meta) {
    const metaPath = path.join(expandPath(skillDir), '.skill-meta.json')
    try {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { encoding: 'utf-8' })
    } catch {}
  },

  loadSkillMeta(skillDir) {
    const metaPath = path.join(expandPath(skillDir), '.skill-meta.json')
    try {
      const content = fs.readFileSync(metaPath, { encoding: 'utf-8' })
      return JSON.parse(content)
    } catch {
      return null
    }
  },

  async saveSkillMetaAfterDownload(repo, branch, token, targetDir) {
    try {
      const commitSha = await this.getLatestCommitSha(repo, branch, token)
      const files = this.buildLocalFileManifest(targetDir)
      this.saveSkillMeta(targetDir, { commitSha, checkedAt: new Date().toISOString(), files })
    } catch {}
  },

  buildLocalFileManifest(skillDir) {
    const fullDir = expandPath(skillDir)
    const files = []
    function walk(dir, relative) {
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue
          walk(fullPath, rel)
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath)
            files.push({ path: rel, size: stat.size })
          } catch {}
        }
      }
    }
    walk(fullDir, '')
    return files
  },

  async checkSkillUpdateFull(repo, skillPath, token, branch, skillId) {
    // Find the skill directory by skillId
    const stateDir = path.join(window.ztools.getPath('userData'), 'skills-repo')
    const skillDir = path.join(stateDir, skillId || '')
    if (!fs.existsSync(skillDir)) return null

    // Load local meta
    const localMeta = this.loadSkillMeta(skillDir)

    // Get latest commit SHA
    const remoteSha = await this.getLatestCommitSha(repo, branch, token)
    if (!remoteSha) return null

    // Quick check: compare commit SHA
    if (localMeta && localMeta.commitSha === remoteSha) {
      return { hasUpdate: false, changedFiles: [] }
    }

    // Detailed check: compare file trees
    const remoteFiles = await this.getRemoteSkillTree(repo, skillPath, branch, token)
    if (!remoteFiles) return null

    const localFiles = this.buildLocalFileManifest(skillDir)

    // Compare file lists
    const remoteMap = new Map(remoteFiles.map((f) => [f.path, f.size]))
    const localMap = new Map(localFiles.map((f) => [f.path, f.size]))

    const changedFiles = []

    // Check for new or modified files
    for (const [filePath, remoteSize] of remoteMap) {
      const localSize = localMap.get(filePath)
      if (localSize === undefined || localSize !== remoteSize) {
        changedFiles.push(filePath)
      }
    }

    // Check for deleted files
    for (const filePath of localMap.keys()) {
      if (!remoteMap.has(filePath)) {
        changedFiles.push(filePath)
      }
    }

    return { hasUpdate: changedFiles.length > 0, changedFiles }
  },

  async updateSkillFromGitHub(repo, skillPath, targetDir, token, branch) {
    let buffer
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
    const tried = new Set()
    for (const b of branches) {
      if (tried.has(b)) continue
      tried.add(b)
      try {
        buffer = await this.downloadFile(`https://api.github.com/repos/${repo}/zipball/${b}`, token)
        break
      } catch (err) {
        if (b === branches[branches.length - 1]) throw err
      }
    }
    const tempDir = path.join(homeDir(), '.cache/skill-hub/')
    fs.mkdirSync(tempDir, { recursive: true })
    const extractDir = path.join(tempDir, `update-${Date.now()}`)
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true })
    this.extractBufferZip(buffer, extractDir)
    const extractedItems = this.readDir(extractDir)
    const rootDir = extractedItems.find((d) => d.isDirectory)
    const sourceRoot = rootDir ? rootDir.path : extractDir
    const pathCandidates = [
      skillPath,
      `skills/${skillPath}`,
      `agent-skills/${skillPath}`,
    ]
    let skillSourceDir = ''
    for (const p of pathCandidates) {
      const candidate = path.join(sourceRoot, p)
      if (fs.existsSync(candidate)) { skillSourceDir = candidate; break }
    }
    if (!skillSourceDir) { fs.rmSync(extractDir, { recursive: true }); return false }
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    this.copyFile(skillSourceDir, targetDir)
    fs.rmSync(extractDir, { recursive: true })

    // Save skill meta for future update checks
    try {
      const commitSha = await this.getLatestCommitSha(repo, branch, token)
      const files = this.buildLocalFileManifest(targetDir)
      this.saveSkillMeta(targetDir, { commitSha, checkedAt: new Date().toISOString(), files })
    } catch {}

    return true
  },

  // === Skills Repo ===
  getStateDir() {
    const stateDir = path.join(window.ztools.getPath('userData'), 'skills-repo')
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true })
    }
    return stateDir
  },
}

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
      if (!kv) { i++; continue }
      const [, key, val] = kv
      if (key === 'tags') {
        manifest.tags = val.replace(/[[\]']/g, '').split(',').map((t) => t.trim()).filter(Boolean)
      } else if (key === 'name') manifest.name = val.trim()
      else if (key === 'description') {
        let d = val.trim()
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
                if (current.length) { paragraphs.push(current.join(' ')); current = [] }
              } else {
                current.push(bl)
              }
            }
            if (current.length) paragraphs.push(current.join(' '))
            d = paragraphs.join('\n\n')
            if (chomp === '+' && blockLines.length > 0) {
              const trailing = blockLines.reduce((n, l) => l === '' ? n + 1 : 0, 0)
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
          }
        }
        if (d.startsWith('[') && d.endsWith(']')) {
          d = d.slice(1, -1).trim()
        }
        manifest.description = d
      }
      else if (key === 'author') manifest.author = val.trim()
      else if (key === 'format') manifest.format = val.trim()
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

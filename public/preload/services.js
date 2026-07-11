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

// --- Write-root whitelist (mutating FS only) ---
const _bootstrapRoots = new Set()
const _dynamicRoots = new Set()
let _rootsBootstrapped = false

function _normRootKey(p) {
  const full = path.resolve(expandPath(p))
  return process.platform === 'win32' ? full.toLowerCase() : full
}

function _addRootTo(set, p) {
  if (!p) return
  try {
    const full = path.resolve(expandPath(String(p)))
    if (full) set.add(full)
  } catch {}
}

function ensureBootstrapRoots() {
  if (_rootsBootstrapped) return
  _rootsBootstrapped = true
  try {
    const ud = typeof window !== 'undefined' && window.ztools?.getPath?.('userData')
    if (ud) _addRootTo(_bootstrapRoots, ud)
  } catch {}
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

/** Atomically replace targetDir with contents of sourceDir (copy). Keeps old dir until new is ready. */
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
  const staging = fullTarget + `.tmp.${Date.now()}`
  const bak = fullTarget + `.bak.${Date.now()}`
  assertWritable(staging)
  assertWritable(bak)
  try {
    fs.cpSync(fullSrc, staging, { recursive: true, dereference: true })
    const stagingOk = ['SKILL.md', 'skill.md'].some((f) => fs.existsSync(path.join(staging, f)))
    if (!stagingOk) {
      throw new Error('SKILL.md missing after copy to staging')
    }
    if (fs.existsSync(fullTarget)) {
      fs.renameSync(fullTarget, bak)
    } else {
      fs.mkdirSync(path.dirname(fullTarget), { recursive: true })
    }
    try {
      fs.renameSync(staging, fullTarget)
    } catch {
      fs.cpSync(staging, fullTarget, { recursive: true, dereference: true })
      fs.rmSync(staging, { recursive: true, force: true })
    }
    if (fs.existsSync(bak)) {
      fs.rmSync(bak, { recursive: true, force: true })
    }
  } catch (err) {
    try { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }) } catch {}
    try {
      if (fs.existsSync(bak) && !fs.existsSync(fullTarget)) {
        fs.renameSync(bak, fullTarget)
      }
    } catch {}
    throw err
  }
}

/** Write relative files under base into a staging dir, then atomically swap into targetDir. */
function doAtomicWriteDir(targetDir, files) {
  const fullTarget = assertWritable(targetDir)
  assertWritable(path.dirname(fullTarget))
  const staging = fullTarget + `.tmp.${Date.now()}`
  const bak = fullTarget + `.bak.${Date.now()}`
  assertWritable(staging)
  assertWritable(bak)
  fs.mkdirSync(staging, { recursive: true })
  try {
    const entries = files instanceof Map ? files.entries() : Object.entries(files)
    for (const [rel, content] of entries) {
      const full = safeResolveWithin(staging, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content, { encoding: 'utf-8' })
    }
    const hasSkill = ['SKILL.md', 'skill.md'].some((f) => fs.existsSync(path.join(staging, f)))
    if (!hasSkill) {
      throw new Error('SKILL.md not found in downloaded files')
    }
    if (fs.existsSync(fullTarget)) {
      fs.renameSync(fullTarget, bak)
    } else {
      fs.mkdirSync(path.dirname(fullTarget), { recursive: true })
    }
    try {
      fs.renameSync(staging, fullTarget)
    } catch {
      fs.cpSync(staging, fullTarget, { recursive: true, dereference: true })
      fs.rmSync(staging, { recursive: true, force: true })
    }
    if (fs.existsSync(bak)) {
      fs.rmSync(bak, { recursive: true, force: true })
    }
  } catch (err) {
    try { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }) } catch {}
    try {
      if (fs.existsSync(bak) && !fs.existsSync(fullTarget)) {
        fs.renameSync(bak, fullTarget)
      }
    } catch {}
    throw err
  }
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
  safeJoin(base, ...parts) {
    return safeResolveWithin(base, ...parts)
  },
  /** Replace dynamic allowed write roots (projects, platforms). Bootstrap roots always kept. */
  setAllowedWriteRoots(paths) {
    _dynamicRoots.clear()
    ensureBootstrapRoots()
    if (Array.isArray(paths)) {
      for (const p of paths) _addRootTo(_dynamicRoots, p)
    }
  },
  getAllowedWriteRoots() {
    return getAllowedWriteRoots()
  },
  isPathWritable(filePath) {
    try {
      return isUnderAllowedRoot(filePath)
    } catch {
      return false
    }
  },
  atomicReplaceDir(sourceDir, targetDir) {
    doAtomicReplaceDir(sourceDir, targetDir)
  },
  atomicWriteDir(targetDir, files) {
    doAtomicWriteDir(targetDir, files)
  },
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
    const full = assertWritable(dir)
    fs.mkdirSync(full, { recursive: true })
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
    const full = assertWritable(filePath)
    const parent = path.dirname(full)
    assertWritable(parent)
    fs.mkdirSync(parent, { recursive: true })
    fs.writeFileSync(full, content, { encoding: 'utf-8' })
  },
  removeFile(filePath) {
    const full = assertWritable(filePath)
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
  removeEmptyAncestors(filePath) {
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
  },
  copyFile(src, dest) {
    const fullSrc = expandPath(src)
    const fullDest = assertWritable(dest)
    assertWritable(path.dirname(fullDest))
    fs.mkdirSync(path.dirname(fullDest), { recursive: true })
    const tempDest = fullDest + `.tmp.${Date.now()}`
    assertWritable(tempDest)
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
    const fullLink = assertWritable(linkPath)
    assertWritable(path.dirname(fullLink))
    fs.mkdirSync(path.dirname(fullLink), { recursive: true })
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
  // === 压缩包解压 ===
  extractBufferZip(buffer, dest) {
    const fullDest = assertWritable(dest)
    fs.mkdirSync(fullDest, { recursive: true })
    const zip = new AdmZip(Buffer.from(buffer))
    const entries = zip.getEntries()
    for (const entry of entries) {
      const entryPath = entry.entryName
      try {
        safeResolveWithin(fullDest, entryPath)
      } catch {
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

  // === Full Skill Update Check (all files) ===
  async getLatestCommitSha(repo, branch, token) {
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
    const tried = new Set()
    for (const b of branches) {
      if (tried.has(b)) continue
      tried.add(b)
      try {
        const data = await _fetchGitHubJSONInternal(`https://api.github.com/repos/${repo}/commits/${b}`, token, 0)
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
        const commit = await _fetchGitHubJSONInternal(`https://api.github.com/repos/${repo}/commits/${b}`, token, 0)
        treeSha = commit.commit?.tree?.sha || commit.sha
      } catch (err) {
        if (err.message?.includes('404') && b !== branches[branches.length - 1]) continue
        throw err
      }
      // Try each path candidate against the tree
      for (const p of pathCandidates) {
        try {
          const data = await _fetchGitHubJSONInternal(
            `https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`,
            token,
            0
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
    try {
      const metaPath = path.join(assertWritable(skillDir), '.skill-meta.json')
      assertWritable(metaPath)
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
    try {
      doAtomicReplaceDir(skillSourceDir, targetDir)
    } finally {
      try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
    }

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
      } else if (key === 'name') {
        let n = val.trim()
        if ((n.startsWith('"') && n.endsWith('"')) || (n.startsWith("'") && n.endsWith("'"))) {
          n = n.slice(1, -1)
        }
        manifest.name = n
      }
      else if (key === 'description') {
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
            } else if (d === '""' || d === "''") {
              d = ''
            }
          }
        }
        if (d.startsWith('[') && d.endsWith(']')) {
          d = d.slice(1, -1).trim()
        }
        manifest.description = d
      }
      else if (key === 'author') {
        let a = val.trim()
        if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))) {
          a = a.slice(1, -1)
        }
        manifest.author = a
      }
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

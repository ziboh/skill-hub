const fs = require('node:fs')
const path = require('node:path')
const { homeDir, expandPath } = require('./path-utils')
const { assertWritable } = require('./write-roots')
const { downloadFile, fetchGitHubJSON } = require('./github-http')
const { extractBufferZip } = require('./zip')
const { doAtomicReplaceDir, readDir } = require('./fs')

async function getLatestCommitSha(repo, branch, token) {
  const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
  const tried = new Set()
  for (const b of branches) {
    if (tried.has(b)) continue
    tried.add(b)
    try {
      const data = await fetchGitHubJSON(`https://api.github.com/repos/${repo}/commits/${b}`, token)
      return data.sha
    } catch (err) {
      if (err.message?.includes('404') && b !== branches[branches.length - 1]) continue
      throw err
    }
  }
  return null
}

async function getRemoteSkillTree(repo, skillPath, branch, token) {
  const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
  const pathCandidates = skillPath ? [skillPath, `skills/${skillPath}`, `agent-skills/${skillPath}`] : ['']
  const tried = new Set()
  for (const b of branches) {
    if (tried.has(b)) continue
    tried.add(b)
    let treeSha
    try {
      const commit = await fetchGitHubJSON(`https://api.github.com/repos/${repo}/commits/${b}`, token)
      treeSha = commit.commit?.tree?.sha || commit.sha
    } catch (err) {
      if (err.message?.includes('404') && b !== branches[branches.length - 1]) continue
      throw err
    }
    for (const p of pathCandidates) {
      try {
        const data = await fetchGitHubJSON(`https://api.github.com/repos/${repo}/git/trees/${treeSha}?recursive=1`, token)
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
}

function saveSkillMeta(skillDir, meta) {
  try {
    const metaPath = path.join(assertWritable(skillDir), '.skill-meta.json')
    assertWritable(metaPath)
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { encoding: 'utf-8' })
  } catch {
    /* ignore */
  }
}

function loadSkillMeta(skillDir) {
  const metaPath = path.join(expandPath(skillDir), '.skill-meta.json')
  try {
    const content = fs.readFileSync(metaPath, { encoding: 'utf-8' })
    return JSON.parse(content)
  } catch {
    return null
  }
}

function buildLocalFileManifest(skillDir) {
  const fullDir = expandPath(skillDir)
  const files = []
  function walk(dir, relative) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        walk(fullPath, rel)
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(fullPath)
          files.push({ path: rel, size: st.size })
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(fullDir, '')
  return files
}

async function saveSkillMetaAfterDownload(repo, branch, token, targetDir) {
  try {
    const commitSha = await getLatestCommitSha(repo, branch, token)
    const files = buildLocalFileManifest(targetDir)
    saveSkillMeta(targetDir, { commitSha, checkedAt: new Date().toISOString(), files })
  } catch {
    /* ignore */
  }
}

async function checkSkillUpdateFull(repo, skillPath, token, branch, skillId) {
  const stateDir = path.join(window.ztools.getPath('userData'), 'skills-repo')
  const skillDir = path.join(stateDir, skillId || '')
  if (!fs.existsSync(skillDir)) return null

  const localMeta = loadSkillMeta(skillDir)
  const remoteSha = await getLatestCommitSha(repo, branch, token)
  if (!remoteSha) return null

  if (localMeta && localMeta.commitSha === remoteSha) {
    return { hasUpdate: false, changedFiles: [] }
  }

  const remoteFiles = await getRemoteSkillTree(repo, skillPath, branch, token)
  if (!remoteFiles) return null

  const localFiles = buildLocalFileManifest(skillDir)
  const remoteMap = new Map(remoteFiles.map((f) => [f.path, f.size]))
  const localMap = new Map(localFiles.map((f) => [f.path, f.size]))
  const changedFiles = []

  for (const [filePath, remoteSize] of remoteMap) {
    const localSize = localMap.get(filePath)
    if (localSize === undefined || localSize !== remoteSize) {
      changedFiles.push(filePath)
    }
  }
  for (const filePath of localMap.keys()) {
    if (!remoteMap.has(filePath)) {
      changedFiles.push(filePath)
    }
  }

  return { hasUpdate: changedFiles.length > 0, changedFiles }
}

async function updateSkillFromGitHub(repo, skillPath, targetDir, token, branch) {
  let buffer
  const branches = branch ? [branch, 'main', 'master'] : ['main', 'master']
  const tried = new Set()
  for (const b of branches) {
    if (tried.has(b)) continue
    tried.add(b)
    try {
      buffer = await downloadFile(`https://api.github.com/repos/${repo}/zipball/${b}`, token)
      break
    } catch (err) {
      if (b === branches[branches.length - 1]) throw err
    }
  }
  const tempDir = path.join(homeDir(), '.cache/skill-hub/')
  fs.mkdirSync(tempDir, { recursive: true })
  const extractDir = path.join(tempDir, `update-${Date.now()}`)
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true })
  extractBufferZip(buffer, extractDir)
  const extractedItems = readDir(extractDir)
  const rootDir = extractedItems.find((d) => d.isDirectory)
  const sourceRoot = rootDir ? rootDir.path : extractDir
  const pathCandidates = [skillPath, `skills/${skillPath}`, `agent-skills/${skillPath}`]
  let skillSourceDir = ''
  for (const p of pathCandidates) {
    const candidate = path.join(sourceRoot, p)
    if (fs.existsSync(candidate)) {
      skillSourceDir = candidate
      break
    }
  }
  if (!skillSourceDir) {
    fs.rmSync(extractDir, { recursive: true })
    return false
  }
  try {
    doAtomicReplaceDir(skillSourceDir, targetDir)
  } finally {
    try {
      fs.rmSync(extractDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }

  try {
    const commitSha = await getLatestCommitSha(repo, branch, token)
    const files = buildLocalFileManifest(targetDir)
    saveSkillMeta(targetDir, { commitSha, checkedAt: new Date().toISOString(), files })
  } catch {
    /* ignore */
  }

  return true
}

function getStateDir() {
  const stateDir = path.join(window.ztools.getPath('userData'), 'skills-repo')
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
  }
  return stateDir
}

module.exports = {
  getLatestCommitSha,
  getRemoteSkillTree,
  saveSkillMeta,
  loadSkillMeta,
  saveSkillMetaAfterDownload,
  buildLocalFileManifest,
  checkSkillUpdateFull,
  updateSkillFromGitHub,
  getStateDir,
}

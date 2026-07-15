const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const git = require('isomorphic-git')
const gitHttp = require('isomorphic-git/http/node')
const { fetchGiteeJSON, downloadGiteeRawFile } = require('./gitee-http')
const { assertWritable } = require('./write-roots')
const { doAtomicReplaceDir, doAtomicWriteDir } = require('./fs')
const { homeDir, safeResolveWithin } = require('./path-utils')

function repoParts(repo) {
  const parts = String(repo || '').split('/')
  if (parts.length < 2 || !parts[0] || !parts[1]) throw new Error(`Invalid Gitee repository: ${repo}`)
  return { owner: parts[0], name: parts[1] }
}

function branchCandidates(branch) {
  return [...new Set([branch, 'main', 'master'].filter(Boolean))]
}

function giteeGitUrl(repo) {
  return `https://gitee.com/${repo}.git`
}

function giteeCloneAuth(repo, token) {
  if (!token) return undefined
  return { username: String(repo).split('/')[0] || 'oauth2', password: token }
}

function gitAuthOptions(repo, token) {
  return token ? { onAuth: () => giteeCloneAuth(repo, token) } : {}
}

function hasSkillManifest(dir) {
  return ['SKILL.md', 'skill.md'].some((name) => fs.existsSync(path.join(dir, name)))
}

function findLocalSkillDirectory(rootDir, skillPath) {
  const normalized = String(skillPath || '').replace(/^\/+|\/+$/g, '')
  const candidates = [...new Set([normalized, `skills/${normalized}`, `agent-skills/${normalized}`].filter(Boolean))]
  for (const candidate of candidates) {
    try {
      const dir = safeResolveWithin(rootDir, candidate)
      if (hasSkillManifest(dir)) return dir
    } catch {
      /* reject paths that escape the cloned repository */
    }
  }
  if (normalized === '.' || !normalized) {
    if (hasSkillManifest(rootDir)) return rootDir
  }

  const matches = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (hasSkillManifest(dir)) matches.push(dir)
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue
      walk(path.join(dir, entry.name))
    }
  }
  walk(rootDir)
  return matches.length === 1 ? matches[0] : null
}

async function cloneGiteeRepository(repo, cloneDir, branch = 'main', token) {
  const writableCloneDir = assertWritable(cloneDir)
  fs.mkdirSync(path.dirname(writableCloneDir), { recursive: true })
  try {
    await git.clone({
      fs,
      http: gitHttp,
      dir: writableCloneDir,
      url: giteeGitUrl(repo),
      ref: branch,
      singleBranch: true,
      depth: 1,
      noCheckout: false,
      ...gitAuthOptions(repo, token),
    })
    return writableCloneDir
  } catch (error) {
    try {
      fs.rmSync(writableCloneDir, { recursive: true, force: true })
    } catch {
      /* ignore clone cleanup failures */
    }
    throw error
  }
}

async function cloneGiteeSkill(repo, skillPath, targetDir, branch = 'main', token) {
  const cloneDir = path.join(homeDir(), '.cache', 'skill-hub', `gitee-clone-${process.pid}-${Date.now()}`)
  const writableCloneDir = await cloneGiteeRepository(repo, cloneDir, branch, token)
  try {
    const skillDir = findLocalSkillDirectory(writableCloneDir, skillPath)
    if (!skillDir) return false
    doAtomicReplaceDir(skillDir, targetDir)
    return true
  } finally {
    try {
      fs.rmSync(writableCloneDir, { recursive: true, force: true })
    } catch {
      /* ignore clone cleanup failures */
    }
  }
}

async function getLatestGiteeGitCommitSha(repo, branch = 'main', token) {
  const refs = await git.listServerRefs({
    http: gitHttp,
    url: giteeGitUrl(repo),
    prefix: 'refs/heads/',
    ...gitAuthOptions(repo, token),
  })
  const ref = refs.find((item) => item.ref === `refs/heads/${branch}`)
  return ref?.oid || null
}

async function getLatestGiteeCommitSha(repo, branch = 'main', token) {
  for (const candidate of branchCandidates(branch)) {
    try {
      const sha = await getLatestGiteeGitCommitSha(repo, candidate, token)
      if (sha) return sha
    } catch {
      /* try the next branch */
    }
  }
  return null
}

async function getRemoteGiteeSkillTree(repo, branch = 'main', token) {
  const { owner, name } = repoParts(repo)
  let lastError
  for (const candidate of branchCandidates(branch)) {
    try {
      const commit = await fetchGiteeJSON(
        `https://gitee.com/api/v5/repos/${owner}/${name}/branches/${encodeURIComponent(candidate)}`,
        token,
      )
      const commitSha = commit?.commit?.sha || commit?.sha
      let treeSha = commit?.commit?.tree?.sha || commit?.tree?.sha
      if (!treeSha && commitSha) {
        const commitData = await fetchGiteeJSON(
          `https://gitee.com/api/v5/repos/${owner}/${name}/commits/${encodeURIComponent(commitSha)}`,
          token,
        )
        treeSha = commitData?.commit?.tree?.sha || commitData?.tree?.sha
      }
      if (!treeSha) return null
      const data = await fetchGiteeJSON(
        `https://gitee.com/api/v5/repos/${owner}/${name}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
        token,
      )
      return Array.isArray(data?.tree) ? data.tree : null
    } catch (error) {
      lastError = error
      if (!String(error).includes('404')) throw error
    }
  }
  throw lastError || new Error(`Gitee 仓库或分支未找到: ${repo}`)
}

function findSkillDirectory(tree, skillPath) {
  const candidates = [skillPath, `skills/${skillPath}`, `agent-skills/${skillPath}`]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map((value) => value.replace(/^\/+|\/+$/g, ''))
  for (const candidate of candidates) {
    const prefix = candidate && candidate !== '.' ? `${candidate}/` : ''
    if (tree.some((item) => item.type === 'blob' && item.path === `${prefix}SKILL.md`)) return candidate
  }
  const skillDirs = new Set(
    tree
      .filter((item) => item.type === 'blob' && /^SKILL\.md$/i.test(item.path.split('/').pop() || ''))
      .map((item) => item.path.split('/').slice(0, -1).join('/')),
  )
  if (skillDirs.size === 1) return [...skillDirs][0]
  return null
}

function buildGiteeLocalFileManifest(skillDir, includeHash = false) {
  const files = []
  function walk(dir, relative) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '.skill-meta.json') continue
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.isFile()) {
        try {
          const entry = { path: rel, size: fs.statSync(full).size }
          if (includeHash) entry.hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
          files.push(entry)
        } catch {
          /* ignore files that disappear during scanning */
        }
      }
    }
  }
  walk(path.resolve(skillDir), '')
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

async function readGiteeFile(repo, remotePath, branch, token) {
  const { owner, name } = repoParts(repo)
  const rawUrl = `https://gitee.com/${owner}/${name}/raw/${encodeURIComponent(branch)}/${remotePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  try {
    return await downloadGiteeRawFile(rawUrl)
  } catch {
    // Keep the contents API as fallback for private or unusual repositories.
  }
  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/')
  let lastError
  for (const candidate of branchCandidates(branch)) {
    try {
      const data = await fetchGiteeJSON(
        `https://gitee.com/api/v5/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(candidate)}`,
        token,
      )
      if (!data?.content) throw new Error(`Gitee file content missing: ${remotePath}`)
      return Buffer.from(String(data.content).replace(/\s/g, ''), 'base64')
    } catch (error) {
      lastError = error
      if (!String(error).includes('404')) throw error
    }
  }
  throw lastError || new Error(`Gitee file not found: ${remotePath}`)
}

async function downloadGiteeSkill(repo, skillPath, targetDir, token, branch = 'main', cachedTree) {
  try {
    // Public repositories use Git's anonymous HTTP protocol; no system Git or token is required.
    const cloned = await cloneGiteeSkill(repo, skillPath, targetDir, branch, token)
    if (cloned) return true
  } catch {
    // Fall back to raw/API when Git HTTP is unavailable or the repository requires auth.
  }
  const tree = cachedTree || (await getRemoteGiteeSkillTree(repo, branch, token))
  if (!tree) return false
  const skillDir = findSkillDirectory(tree, skillPath)
  if (skillDir === null) return false
  const prefix = skillDir && skillDir !== '.' ? `${skillDir}/` : ''
  const files = tree.filter((item) => item.type === 'blob' && item.path.startsWith(prefix))
  const contents = new Map()
  for (const file of files) {
    const localPath = file.path.slice(prefix.length)
    if (!localPath || localPath.startsWith('../')) continue
    contents.set(localPath, await readGiteeFile(repo, file.path, branch, token))
  }
  if (!contents.has('SKILL.md') && !contents.has('skill.md')) return false
  doAtomicWriteDir(targetDir, contents)
  return true
}

async function updateSkillFromGitee(repo, skillPath, targetDir, token, branch = 'main') {
  const updated = await downloadGiteeSkill(repo, skillPath, targetDir, token, branch)
  if (updated) await saveGiteeSkillMetaAfterDownload(repo, branch, token, targetDir)
  return updated
}

async function saveGiteeSkillMetaAfterDownload(repo, branch, token, targetDir) {
  try {
    const metaPath = path.join(assertWritable(targetDir), '.skill-meta.json')
    const commitSha = await getLatestGiteeCommitSha(repo, branch, token)
    const files = buildGiteeLocalFileManifest(targetDir)
    fs.writeFileSync(metaPath, JSON.stringify({ commitSha, checkedAt: new Date().toISOString(), files }, null, 2), 'utf8')
  } catch {
    /* metadata is optional */
  }
}

function getGiteeChangedFiles(remoteFiles, localFiles) {
  const remoteMap = new Map(remoteFiles.map((file) => [file.path, file.size]))
  const localMap = new Map(localFiles.map((file) => [file.path, file.size]))
  const changed = new Set()
  for (const [filePath, remoteSize] of remoteMap) {
    const local = localMap.get(filePath)
    const remote = remoteFiles.find((file) => file.path === filePath)
    if (local !== remoteSize || (remote?.hash && localFiles.find((file) => file.path === filePath)?.hash !== remote.hash)) {
      changed.add(filePath)
    }
  }
  for (const filePath of localMap.keys()) {
    if (!remoteMap.has(filePath)) changed.add(filePath)
  }
  return [...changed].sort()
}

async function checkGiteeSkillUpdateFull(repo, skillPath, token, branch = 'main', skillId) {
  const stateDir = path.join(window.ztools.getPath('userData'), 'skills-repo')
  const skillDir = path.join(stateDir, skillId || '')
  if (!fs.existsSync(skillDir)) return null
  const remoteSha = await getLatestGiteeCommitSha(repo, branch, token)
  if (!remoteSha) return null

  const cloneDir = path.join(homeDir(), '.cache', 'skill-hub', `gitee-check-${process.pid}-${Date.now()}`)
  const writableCloneDir = await cloneGiteeRepository(repo, cloneDir, branch, token)
  try {
    const remoteSkillDir = findLocalSkillDirectory(writableCloneDir, skillPath)
    if (!remoteSkillDir) return null
    const remoteFiles = buildGiteeLocalFileManifest(remoteSkillDir, true)
    const localFiles = buildGiteeLocalFileManifest(skillDir, true)
    const changedFiles = getGiteeChangedFiles(remoteFiles, localFiles)
    return { hasUpdate: changedFiles.length > 0, changedFiles }
  } finally {
    try {
      fs.rmSync(writableCloneDir, { recursive: true, force: true })
    } catch {
      /* ignore clone cleanup failures */
    }
  }
}

module.exports = {
  giteeGitUrl,
  giteeCloneAuth,
  cloneGiteeRepository,
  cloneGiteeSkill,
  getLatestGiteeGitCommitSha,
  getLatestGiteeCommitSha,
  getRemoteGiteeSkillTree,
  buildGiteeLocalFileManifest,
  getGiteeChangedFiles,
  downloadGiteeSkill,
  updateSkillFromGitee,
  saveGiteeSkillMetaAfterDownload,
  checkGiteeSkillUpdateFull,
}

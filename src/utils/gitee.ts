import type { RepositoryInfo } from './repository'

export interface GiteeTreeItem {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

const treeCache = new Map<string, GiteeTreeItem[]>()

export function buildGiteeContentsUrl(repo: string, filePath: string, branch = 'main'): string {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  return `https://gitee.com/api/v5/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
}

export function buildGiteeRawUrl(repo: string, filePath: string, branch = 'main'): string {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  return `https://gitee.com/${repo}/raw/${encodeURIComponent(branch)}/${encodedPath}`
}

export function buildGiteeGitUrl(repo: string): string {
  return `https://gitee.com/${repo}.git`
}

export function buildGiteeCloneAuth(repo: string, token?: string): { username: string; password: string } | undefined {
  if (!token) return undefined
  return { username: repo.split('/')[0] || 'oauth2', password: token }
}

export function buildGiteeTreeUrl(repo: string, treeSha: string): string {
  return `https://gitee.com/api/v5/repos/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
}

export function buildGiteeCommitUrl(repo: string, commitSha: string): string {
  return `https://gitee.com/api/v5/repos/${repo}/commits/${encodeURIComponent(commitSha)}`
}

export function getGiteeTreeSha(commit: any): string | null {
  return commit?.commit?.commit?.tree?.sha || commit?.commit?.tree?.sha || commit?.tree?.sha || null
}

export function buildGiteeBranchUrl(repo: string, branch = 'main'): string {
  return `https://gitee.com/api/v5/repos/${repo}/branches/${encodeURIComponent(branch)}`
}

export function getGiteeBranchCandidates(branch?: string): string[] {
  return Array.from(new Set([branch, 'main', 'master'].filter(Boolean) as string[]))
}

export function selectGiteeSkillFiles(
  tree: GiteeTreeItem[],
  skillPath: string,
): { remotePath: string; localPath: string }[] {
  const normalized = skillPath.replace(/^\/+|\/+$/g, '')
  const candidates = [normalized, `skills/${normalized}`, `agent-skills/${normalized}`].filter(
    (value, index, all) => value && all.indexOf(value) === index,
  )
  const prefix =
    candidates.map((candidate) => `${candidate}/`).find((candidate) =>
      tree.some((item) => item.type === 'blob' && item.path.startsWith(candidate)),
    ) || (normalized === '.' ? '' : `${normalized}/`)
  return tree
    .filter((item) => item.type === 'blob' && (!prefix || item.path.startsWith(prefix)))
    .map((item) => ({ remotePath: item.path, localPath: prefix ? item.path.slice(prefix.length) : item.path }))
    .filter((item) => item.localPath && !item.localPath.startsWith('../') && item.localPath !== '.git')
}

export function repositoryTreeToGiteeInfo(info: RepositoryInfo, tree: GiteeTreeItem[]): GiteeTreeItem[] {
  return info.provider === 'gitee' ? tree : []
}

function decodeDownloadPayload(payload: ArrayBuffer | Record<string, unknown>): Record<string, unknown> {
  if (payload instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(payload))
  return payload
}

function decodeTextPayload(payload: ArrayBuffer | string | Record<string, unknown>): string {
  if (typeof payload === 'string') return payload
  if (!(payload instanceof ArrayBuffer)) throw new Error('Gitee raw response is not text')
  return new TextDecoder().decode(payload)
}

const fileCache = new Map<string, string>()

async function fetchGiteeRawFile(owner: string, repo: string, filePath: string, branch: string, token?: string): Promise<string> {
  const url = buildGiteeRawUrl(`${owner}/${repo}`, filePath, branch)
  const cached = fileCache.get(url)
  if (cached !== undefined) return cached
  // Public raw requests do not need authentication. Keep the token for the API fallback
  // so normal users do not spend authenticated request quota on every file.
  const content = decodeTextPayload(await window.services.downloadFile(url))
  fileCache.set(url, content)
  return content
}

export async function fetchGiteeJSONCompat(url: string, token?: string): Promise<Record<string, unknown>> {
  if (typeof window.services.fetchGiteeJSON === 'function') {
    return window.services.fetchGiteeJSON(url, token)
  }
  const separator = url.includes('?') ? '&' : '?'
  const authUrl = token ? url + separator + 'access_token=' + encodeURIComponent(token) : url
  return decodeDownloadPayload(await window.services.downloadFile(authUrl))
}

export async function fetchGiteeRepoTree(
  owner: string,
  repo: string,
  branch = 'main',
  token?: string,
): Promise<GiteeTreeItem[]> {
  const cacheKey = `${owner}/${repo}@${branch}|${token ? 'authenticated' : 'anonymous'}`
  const cached = treeCache.get(cacheKey)
  if (cached) return cached
  let lastError: unknown
  for (const candidate of getGiteeBranchCandidates(branch)) {
    try {
      const commit = await fetchGiteeJSONCompat(buildGiteeBranchUrl(`${owner}/${repo}`, candidate), token)
      const commitSha = (commit as any)?.commit?.sha || (commit as any)?.sha
      let treeSha = getGiteeTreeSha(commit)
      if (!treeSha && commitSha) {
        const commitData = await fetchGiteeJSONCompat(buildGiteeCommitUrl(`${owner}/${repo}`, commitSha), token)
        treeSha = getGiteeTreeSha(commitData)
      }
      if (!treeSha) throw new Error(`Gitee 分支提交信息无效: ${candidate}`)
      const data = await fetchGiteeJSONCompat(
        `https://gitee.com/api/v5/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
        token,
      )
      const tree = Array.isArray((data as any)?.tree) ? (data as any).tree : []
      treeCache.set(cacheKey, tree)
      return tree
    } catch (error) {
      lastError = error
      if (!String(error).includes('404')) throw error
    }
  }
  // Gitee API may reject anonymous branch/tree requests even for public repos.
  // A root SKILL.md is enough to support the common single-skill repository case.
  if (!token) {
    for (const candidate of getGiteeBranchCandidates(branch)) {
      try {
        await fetchGiteeRawFile(owner, repo, 'SKILL.md', candidate)
        const tree = [{ path: 'SKILL.md', type: 'blob' as const }]
        treeCache.set(cacheKey, tree)
        return tree
      } catch {
        /* try the next branch */
      }
    }
  }
  throw lastError || new Error(`Gitee 仓库或分支未找到: ${owner}/${repo}`)
}

export async function fetchGiteeFile(owner: string, repo: string, filePath: string, branch = 'main', token?: string): Promise<string> {
  try {
    return await fetchGiteeRawFile(owner, repo, filePath, branch, token)
  } catch {
    // Raw is the low-quota path for public repos; keep API contents as fallback.
  }
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
  let lastError: unknown
  for (const candidate of getGiteeBranchCandidates(branch)) {
    try {
      const data = await fetchGiteeJSONCompat(
        `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(candidate)}`,
        token,
      )
      if (!(data as any)?.content) throw new Error(`Gitee 文件内容为空: ${filePath}`)
      const bytes = Uint8Array.from(atob(String((data as any).content).replace(/\s/g, '')), (char) => char.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    } catch (error) {
      lastError = error
      if (!String(error).includes('404')) throw error
    }
  }
  throw lastError || new Error(`Gitee 文件不存在: ${filePath}`)
}

export async function downloadGiteeSkillCompat(
  repo: string,
  skillPath: string,
  targetDir: string,
  token?: string,
  branch = 'main',
  cachedTree?: GiteeTreeItem[],
): Promise<boolean> {
  if (typeof window.services.downloadGiteeSkill === 'function') {
    return window.services.downloadGiteeSkill(repo, skillPath, targetDir, token, branch, cachedTree)
  }
  const parts = repo.split('/')
  if (parts.length < 2) throw new Error('无效的 Gitee 仓库地址')
  const tree = cachedTree || (await fetchGiteeRepoTree(parts[0], parts[1], branch, token))
  const candidates = [skillPath, 'skills/' + skillPath, 'agent-skills/' + skillPath]
  let selected: { remotePath: string; localPath: string }[] = []
  for (const candidate of candidates) {
    const files = selectGiteeSkillFiles(tree, candidate)
    if (files.some((file) => file.localPath.toLowerCase() === 'skill.md')) {
      selected = files
      break
    }
  }
  if (!selected.length) return false
  const contents = new Map<string, string>()
  for (const file of selected) {
    contents.set(file.localPath, await fetchGiteeFile(parts[0], parts[1], file.remotePath, branch, token))
  }
  if (!contents.has('SKILL.md') && !contents.has('skill.md')) return false
  if (typeof window.services.atomicWriteDir !== 'function') throw new Error('当前 Preload 不支持安全目录写入，请重新加载插件')
  window.services.atomicWriteDir(targetDir, contents)
  return true
}

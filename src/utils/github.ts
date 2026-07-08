export interface GitHubRepoInfo {
  owner: string
  repo: string
  defaultBranch: string
}

export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  const trimmed = url.trim()
  const fullMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\/|$)/
  )
  if (fullMatch) {
    return {
      owner: fullMatch[1],
      repo: fullMatch[2].replace(/\.git$/, ''),
      defaultBranch: 'main',
    }
  }
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+?)$/)
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2].replace(/\.git$/, ''),
      defaultBranch: 'main',
    }
  }
  return null
}

// --- Rate Limit State ---

interface RateLimitState {
  remaining: number
  reset: number
  limit: number
}

const rateLimitState: RateLimitState = { remaining: 5000, reset: 0, limit: 5000 }

export function getRateLimitState(): RateLimitState {
  return { ...rateLimitState }
}

export function getRateLimitWaitMs(): number {
  if (rateLimitState.remaining > 10) return 0
  const now = Date.now()
  const resetMs = rateLimitState.reset * 1000
  if (resetMs > now) return resetMs - now + 1000
  return 0
}

function updateRateLimitFromHeaders(headers: Headers) {
  const remaining = headers.get('x-ratelimit-remaining')
  const reset = headers.get('x-ratelimit-reset')
  const limit = headers.get('x-ratelimit-limit')
  if (remaining !== null) rateLimitState.remaining = Number(remaining)
  if (reset !== null) rateLimitState.reset = Number(reset)
  if (limit !== null) rateLimitState.limit = Number(limit)
}

// --- Response Cache ---

interface CacheEntry {
  data: any
  expiry: number
}

const responseCache = new Map<string, CacheEntry>()

function getCacheTtlMs(url: string): number {
  if (url.includes('/git/trees/')) return 15 * 60 * 1000
  if (url.includes('raw.githubusercontent.com')) return 5 * 60 * 1000
  return 0
}

function getCached(url: string): any | undefined {
  const entry = responseCache.get(url)
  if (!entry) return undefined
  if (Date.now() > entry.expiry) { responseCache.delete(url); return undefined }
  return entry.data
}

function setCache(url: string, data: any) {
  const ttl = getCacheTtlMs(url)
  if (ttl <= 0) return
  if (responseCache.size > 500) responseCache.clear()
  responseCache.set(url, { data, expiry: Date.now() + ttl })
}

// --- Core Fetch ---

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function githubFetch(url: string, options: {
  headers?: Record<string, string>
  cache?: boolean
  timeout?: number
  parseJson?: boolean
  responseType?: 'text' | 'arraybuffer'
}): Promise<any> {
  const { headers = {}, cache = true, timeout = 15000, parseJson = false, responseType = 'text' } = options
  const method = options as any
  const isGet = !method.method || method.method === 'GET'

  if (cache && isGet && responseType === 'text') {
    const cached = getCached(url)
    if (cached !== undefined) return cached
  }

  const waitMs = getRateLimitWaitMs()
  if (waitMs > 0) await sleep(waitMs)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const allHeaders: Record<string, string> = { 'User-Agent': 'skill-hub', ...headers }

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: allHeaders, signal: controller.signal })
      updateRateLimitFromHeaders(resp.headers)

      if (resp.ok) {
        clearTimeout(timer)
        let result: any
        if (responseType === 'arraybuffer') result = await resp.arrayBuffer()
        else result = parseJson ? await resp.json() : await resp.text()
        if (cache && isGet && responseType === 'text') setCache(url, result)
        return result
      }

      if (resp.status === 403 || resp.status === 429 || resp.status >= 500) {
        const retryAfter = resp.headers.get('retry-after')
        const waitSec = retryAfter ? Number(retryAfter) : Math.min(2 ** attempt * 1000, 8000)
        if (attempt < 2) { await sleep(waitSec); continue }
      }

      clearTimeout(timer)
      if (resp.status === 403) throw new Error('GitHub API 速率限制，请在设置中添加 Token 提升额度')
      throw new Error(`GitHub API 请求失败: ${resp.status}`)
    } catch (err: any) {
      if (err.name === 'AbortError') { clearTimeout(timer); throw new Error('GitHub API 请求超时') }
      if (err.message?.includes(': 404')) throw err
      lastError = err
      if (attempt < 2) await sleep(Math.min(2 ** attempt * 1000, 4000))
    }
  }
  clearTimeout(timer)
  throw lastError || new Error('GitHub API 请求失败')
}

// --- Public API ---

export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
  branch = 'main',
  token?: string
): Promise<string> {
  const branches = [branch, 'main', 'master']
  const tried = new Set<string>()
  for (const b of branches) {
    if (tried.has(b)) continue
    tried.add(b)
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${path.split('/').map(encodeURIComponent).join('/')}`
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      return await githubFetch(url, { headers, cache: true, parseJson: false })
    } catch {}
  }
  throw new Error(`获取文件失败: ${path}`)
}

export async function fetchGitHubRepoTree(
  owner: string,
  repo: string,
  branch = 'main',
  token?: string
): Promise<{ path: string; type: 'blob' | 'tree' }[]> {
  const branches = [branch, 'main', 'master']
  const tried = new Set<string>()
  for (const b of branches) {
    if (tried.has(b)) continue
    tried.add(b)
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${b}?recursive=1`
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      const data = await githubFetch(url, { headers, cache: true, parseJson: true })
      return data.tree || []
    } catch (err: any) {
      if (err.message?.includes('404')) continue
      if (err.message?.includes('速率限制')) throw err
      if (err.message?.includes('未找到')) continue
      throw err
    }
  }
  throw new Error(`仓库或分支未找到: ${owner}/${repo}`)
}

export const SKILL_MANIFEST_FILES = ['SKILL.md', 'skill.json', 'skill.yaml', 'skill.yml']

export function detectSkillDirectories(
  tree: { path: string; type: 'blob' | 'tree' }[]
): { dir: string; manifestFile: string }[] {
  const manifestFiles = tree.filter(
    (item) =>
      item.type === 'blob' && SKILL_MANIFEST_FILES.includes(item.path.split('/').pop() || '')
  )

  const dirSet = new Set<string>()
  for (const mf of manifestFiles) {
    const dir = mf.path.split('/').slice(0, -1).join('/') || '.'
    dirSet.add(dir)
  }

  const rootManifests = manifestFiles.filter((mf) => {
    const parts = mf.path.split('/')
    return parts.length === 1
  })

  return Array.from(dirSet).map((dir) => {
    const dirManifest = manifestFiles.find((mf) => {
      if (dir === '.') return mf.path.split('/').length === 1
      const parts = mf.path.split('/')
      return parts.length === dir.split('/').length + 1 && mf.path.startsWith(dir + '/')
    })
    return {
      dir,
      manifestFile: dirManifest ? dirManifest.path : (rootManifests[0]?.path || ''),
    }
  })
}

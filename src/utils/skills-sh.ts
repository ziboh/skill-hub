import type { Skill } from '../types'
import { parseFrontmatter } from './frontmatter'
import { fetchGitHubFile, fetchGitHubRepoTree } from './github'
import { completeStoreSkill } from './store-skill-normalize'

const BASE = 'https://skills.sh'

// ── Filter definitions ──

export interface LeaderboardFilter {
  key: string
  label: string
  path: string
}

export const LEADERBOARD_FILTERS: LeaderboardFilter[] = [
  { key: 'all', label: '全部', path: '/' },
  { key: 'trending', label: '趋势', path: '/trending' },
  { key: 'hot', label: '热门', path: '/hot' },
]

export function getFilterByKey(key: string): LeaderboardFilter {
  return LEADERBOARD_FILTERS.find((f) => f.key === key) || LEADERBOARD_FILTERS[0]
}

// ── Data types ──

export interface LeaderboardEntry {
  owner: string
  repo: string
  skillName: string
  detailPath: string
  detailUrl: string
  installs: number
}

export interface SkillDetailRaw {
  name: string
  description: string
  content: string
  canonicalId?: string
}

// ── Error ──

class SkillsShError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SkillsShError'
  }
}

// ── HTTP helper ──

/** Decode preload/IPC payloads: string, ArrayBuffer, TypedArray, Node Buffer, or { type:'Buffer', data }. */
export function decodeDownloadText(payload: unknown): string | null {
  if (payload == null) return null
  if (typeof payload === 'string') return payload
  if (payload instanceof ArrayBuffer) return new TextDecoder().decode(payload)
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView
    return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  }
  // Node Buffer after structured clone / IPC
  if (typeof payload === 'object') {
    const obj = payload as { type?: string; data?: number[]; buffer?: ArrayBuffer }
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return new TextDecoder().decode(Uint8Array.from(obj.data))
    }
    // Some bridges expose a Buffer-like with .buffer or numeric indices
    if (typeof (obj as { toString?: (enc?: string) => string }).toString === 'function') {
      try {
        const asUtf8 = (obj as { toString: (enc?: string) => string }).toString('utf8')
        if (typeof asUtf8 === 'string' && asUtf8.length > 0 && asUtf8 !== '[object Object]') return asUtf8
      } catch {
        /* fall through */
      }
    }
  }
  return null
}

async function fetchViaPreload(url: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.services?.downloadFile) return null

  try {
    const payload = await window.services.downloadFile(url)
    const text = decodeDownloadText(payload)
    if (text !== null) return text
    // Last resort for JSON API responses that arrive as plain objects
    if (payload && typeof payload === 'object' && !ArrayBuffer.isView(payload)) {
      return JSON.stringify(payload)
    }
    return null
  } catch {
    return null
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const preloadText = await fetchViaPreload(url)
  if (preloadText !== null) return preloadText

  const resp = await fetch(url, { headers: { 'User-Agent': 'skill-hub', ...headers } })
  if (!resp.ok) throw new SkillsShError(resp.status, `HTTP ${resp.status}`)
  return resp.text()
}

// ── HTML normalization ──

function normalizeHtml(html: string): string {
  return html.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(input: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      input
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|pre|code)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ).replace(/[ \t]{2,}/g, ' '),
  )
}

// ── Leaderboard HTML scraping ──

export interface LeaderboardResult {
  entries: LeaderboardEntry[]
  totalCount: number
}

/** Public skill sitemaps (not /api/*). Each file holds up to ~10k skill URLs. */
export const SKILLS_SITEMAP_URLS = [
  'https://www.skills.sh/sitemap-skills-1.xml',
  'https://www.skills.sh/sitemap-skills-2.xml',
] as const

const SKIP_SITEMAP_OWNERS = new Set(['agent', 'agents', 'api', 'search', 'trending', 'hot', 'internal'])

let skillsCatalogCache: LeaderboardEntry[] | null = null
let skillsCatalogPromise: Promise<LeaderboardEntry[]> | null = null

/** Parse skill URLs from a skills.sh sitemap urlset XML. Pure / side-effect free. */
export function parseSkillsSitemap(xml: string): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = []
  const seen = new Set<string>()
  const locRe = /<loc>\s*https?:\/\/(?:www\.)?skills\.sh\/([^<\s]+)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = locRe.exec(xml)) !== null) {
    const path = m[1].replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '')
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 3) continue
    if (SKIP_SITEMAP_OWNERS.has(parts[0].toLowerCase())) continue
    const owner = parts[0]
    const repo = parts[1]
    let skillName = parts.slice(2).join('/')
    try {
      skillName = decodeURIComponent(skillName)
    } catch {
      /* keep raw */
    }
    if (!skillName) continue
    const key = `${owner}/${repo}/${skillName}`
    if (seen.has(key)) continue
    seen.add(key)
    const detailPath = `/${owner}/${repo}/${skillName}`
    entries.push({
      owner,
      repo,
      skillName,
      detailPath,
      detailUrl: `${BASE}${detailPath}`,
      installs: 0,
    })
  }
  return entries
}

export function clearSkillsCatalogCache(): void {
  skillsCatalogCache = null
  skillsCatalogPromise = null
}

/**
 * Load the full skills.sh catalog from public sitemaps (no /api).
 * Results are memoized in-memory for the session unless `force` is true.
 */
export async function fetchAllSkillsFromSitemap(force = false): Promise<LeaderboardResult> {
  if (!force && skillsCatalogCache) {
    return { entries: skillsCatalogCache, totalCount: skillsCatalogCache.length }
  }
  if (!force && skillsCatalogPromise) {
    const entries = await skillsCatalogPromise
    return { entries, totalCount: entries.length }
  }

  const load = async (): Promise<LeaderboardEntry[]> => {
    const texts = await Promise.all(SKILLS_SITEMAP_URLS.map((url) => fetchText(url)))
    const merged: LeaderboardEntry[] = []
    const seen = new Set<string>()
    for (const xml of texts) {
      if (!xml || !xml.includes('<loc')) continue
      for (const entry of parseSkillsSitemap(xml)) {
        const key = `${entry.owner}/${entry.repo}/${entry.skillName}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(entry)
      }
    }
    // 空结果不写缓存，避免解码失败后整会话都是 0 条
    if (merged.length > 0) skillsCatalogCache = merged
    return merged
  }

  skillsCatalogPromise = load()
  try {
    const entries = await skillsCatalogPromise
    return { entries, totalCount: entries.length }
  } finally {
    skillsCatalogPromise = null
  }
}

/**
 * 排行榜 HTML（全部 / 趋势 / 热门）。
 * 首屏列表用这个（几百条、有排序），不要用 sitemap 全量塞进 Vue 列表。
 * 全量目录请用 fetchAllSkillsFromSitemap，仅作搜索索引。
 */
export async function fetchLeaderboard(filterKey?: string): Promise<LeaderboardResult> {
  const filter = getFilterByKey(filterKey || 'all')
  const url = `${BASE}${filter.path}`
  const html = normalizeHtml(await fetchText(url))
  const entries: LeaderboardEntry[] = []
  const seen = new Set<string>()

  const linkRe = /<a[^>]+href="(\/[^"']+\/[^"']+\/[^"']+\/?)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1].replace(/\/+/g, '/').replace(/\/$/, '')
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 3) continue
    // 跳过导航/代理等非 skill 链接
    if (SKIP_SITEMAP_OWNERS.has(parts[0].toLowerCase())) continue
    const owner = parts[0]
    const repo = parts[1]
    const anchorText = m[2]
    const h3Match = anchorText.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    const skillName = h3Match
      ? decodeHtmlEntities(stripTags(h3Match[1])).trim()
      : stripTags(decodeHtmlEntities(anchorText)).trim() || parts[2]
    if (!skillName) continue
    const key = `${owner}/${repo}/${skillName}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ owner, repo, skillName, detailPath: path, detailUrl: `${BASE}${path}`, installs: 0 })
  }

  if (entries.length === 0) {
    const dataRe = /"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)"/g
    while ((m = dataRe.exec(html)) !== null) {
      const [owner, repo] = m[1].split('/')
      const name = m[3]
      const key = `${owner}/${repo}/${name}`
      if (!owner || !repo || seen.has(key)) continue
      seen.add(key)
      entries.push({ owner, repo, skillName: name, detailPath: `/${m[1]}/${m[2]}`, detailUrl: `${BASE}/${m[1]}/${m[2]}`, installs: 0 })
    }
  }

  const totalCount = entries.length
  return { entries, totalCount }
}

// ── Fetch description from skills.sh detail page ──

function extractLdDescription(html: string): string | null {
  const scriptRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      if (data?.description && data['@type'] === 'SoftwareApplication') {
        return data.description
      }
    } catch {
      continue
    }
  }
  return null
}

function extractMetaDescription(html: string): string | null {
  const metaRe = /<meta[^>]+(?:name|property)\s*=\s*"(?:description|og:description)"[^>]*content\s*=\s*"([^"]+)"/i
  const m = html.match(metaRe)
  if (m) {
    const desc = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
    if (desc.length > 10) return desc
  }
  return null
}

function extractSummaryText(html: string): string | null {
  const summaryRe = /bg-muted[^>]*px-6[^>]*py-3[^>]*>([\s\S]*?)<\/div>/i
  const m = html.match(summaryRe)
  if (m) {
    const text = stripTags(m[1]).trim()
    if (text && text.length > 10) return text
  }
  return null
}

export async function fetchSkillDescriptionFromSh(skill: Skill): Promise<string | null> {
  const detailUrl = skill.sourceUrl || (skill.repo ? `${BASE}/${skill.repo}/${skill.path}` : '')
  if (!detailUrl) return null
  try {
    const html = await fetchText(detailUrl)
    return extractLdDescription(html) || extractMetaDescription(html) || extractSummaryText(html)
  } catch {}
  return null
}

// ── Fetch skill detail from GitHub SKILL.md ──

export async function fetchSkillDetailFromSkill(skill: Skill, token?: string): Promise<SkillDetailRaw | null> {
  if (!skill.repo) return null
  const parts = skill.repo.split('/')
  if (parts.length < 2) return null
  const [owner, repo] = parts
  const skillPath = skill.path || skill.name.toLowerCase().replace(/\s+/g, '-')
  const toDetail = (content: string): SkillDetailRaw => {
    const fm = parseFrontmatter(content)
    return {
      name: fm.name || skill.name,
      description: fm.description || '',
      content,
      canonicalId: fm.name ? `${skill.repo}/${fm.name}` : skill.canonicalId,
    }
  }

  try {
    const tree = await fetchGitHubRepoTree(owner, repo, 'main', token)
    const skillFiles = tree.filter((item) => item.type === 'blob' && /SKILL\.md$/i.test(item.path))

    const normalizedName = skillPath.toLowerCase().replace(/[^a-z0-9]/g, '')
    const ownerPrefix = owner.toLowerCase().replace(/[^a-z0-9]/g, '')
    let bestMatch = skillFiles[0]?.path || null
    let bestScore = 0

    for (const file of skillFiles) {
      const fullPath = file.path.replace(/\/SKILL\.md$/i, '')
      const dir = fullPath.toLowerCase().replace(/[^a-z0-9]/g, '')
      const dirSegments = fullPath.split('/')
      const lastDir = dirSegments[dirSegments.length - 1] || ''
      const lastDirNormalized = lastDir.toLowerCase().replace(/[^a-z0-9]/g, '')
      const withoutOwnerPrefix = lastDirNormalized.startsWith(ownerPrefix) ? lastDirNormalized.slice(ownerPrefix.length) : lastDirNormalized

      if (dir === normalizedName) {
        bestMatch = file.path
        break
      }
      if (dir.includes(normalizedName) || normalizedName.includes(dir)) {
        const score = Math.min(dir.length, normalizedName.length)
        if (score > bestScore) {
          bestScore = score
          bestMatch = file.path
        }
      }
      if (lastDirNormalized === normalizedName || withoutOwnerPrefix === normalizedName) {
        bestMatch = file.path
        break
      }
      if (lastDirNormalized.includes(normalizedName) || normalizedName.includes(lastDirNormalized)) {
        const score = Math.min(lastDirNormalized.length, normalizedName.length)
        if (score > bestScore) {
          bestScore = score
          bestMatch = file.path
        }
      }
    }

    if (bestMatch) {
      const content = await fetchGitHubFile(owner, repo, bestMatch)
      if (content) {
        return toDetail(content)
      }
    }
  } catch {}

  const fallbackPath = skillPath.startsWith(owner.toLowerCase().replace(/[^a-z]/g, '')) ? skillPath.slice(owner.length) : skillPath
  const strippedNames = new Set<string>()
  strippedNames.add(skillPath)
  strippedNames.add(fallbackPath)
  const ownerSegments = owner
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
  const repoSegments = repo
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
  for (const seg of [...ownerSegments, ...repoSegments]) {
    if (seg && skillPath.toLowerCase().startsWith(seg + '-')) {
      strippedNames.add(skillPath.slice(seg.length + 1))
    }
  }
  const pathCandidates = [
    ...Array.from(strippedNames).flatMap((n) => [`${n}/SKILL.md`, `skills/${n}/SKILL.md`, `agent-skills/${n}/SKILL.md`]),
    'SKILL.md',
  ]
  for (const p of pathCandidates) {
    try {
      const content = await fetchGitHubFile(owner, repo, p)
      if (content) {
        return toDetail(content)
      }
    } catch {
      continue
    }
  }
  return null
}

// ── Search ──

export interface PublicSearchResult {
  id?: string
  name: string
  source: string
  installs: number
  skillId?: string
}

export async function searchSkillsSh(q: string): Promise<PublicSearchResult[]> {
  if (!q || q.length < 1) return []
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}`
  const body = JSON.parse(await fetchText(url, { Accept: 'application/json' }))
  return body.skills || []
}

// ── Converters ──

export function leaderboardEntryToSkill(e: LeaderboardEntry): Skill {
  const dirName = e.detailPath.split('/').filter(Boolean).pop() || e.skillName.toLowerCase().replace(/\s+/g, '-')
  // Well-known 技能 ID 不包含 site/ 前缀，格式为 域名/skill名称
  const isWellKnown = e.owner === 'site' || e.owner.includes('.')
  const skillId = isWellKnown ? `${e.repo}/${dirName}` : `${e.owner}/${e.repo}/${dirName}`
  return completeStoreSkill({
    id: skillId,
    name: e.skillName,
    description: '',
    shortDescription: '',
    author: isWellKnown ? e.repo : e.owner,
    tags: [],
    source: 'skills-sh',
    sourceUrl: e.detailUrl,
    repo: `${e.owner}/${e.repo}`,
    path: dirName,
    canonicalId: skillId,
    installCount: e.installs,
  })
}

function isDomainSource(source: string): boolean {
  const owner = source.split('/')[0] || ''
  return owner === 'site' || owner.includes('.')
}

export function searchResultToSkill(s: PublicSearchResult): Skill {
  const parts = s.source.split('/')
  const owner = parts[0] || ''
  const skillPath = s.skillId || s.name.toLowerCase().replace(/\s+/g, '-')
  // Well-known 技能 ID 不包含 site/ 前缀，格式为 域名/skill名称
  const isWellKnown = isDomainSource(s.source)
  let fullId: string
  if (isWellKnown) {
    // 从 source 中提取域名（去掉 site/ 前缀）
    const domain = owner === 'site' && parts.length >= 2 ? parts.slice(1).join('/') : s.source
    fullId = s.id || `${domain}/${skillPath}`
  } else {
    fullId = s.id || `${s.source}/${skillPath}`
  }
  const repo = s.source.includes('/') ? s.source : `${s.source}/${s.source}`
  const urlPath = isWellKnown && !fullId.startsWith('site/') ? `site/${fullId}` : fullId
  return completeStoreSkill({
    id: fullId,
    name: s.name,
    description: '',
    shortDescription: '',
    author: isWellKnown ? (owner === 'site' && parts.length >= 2 ? parts[1] : owner) : owner,
    tags: [],
    source: 'skills-sh',
    sourceUrl: `${BASE}/${urlPath}`,
    repo,
    path: skillPath,
    canonicalId: fullId,
    installCount: s.installs,
  })
}

// ── GitHub download helpers ──

export function getGitHubRepo(skill: Skill): { owner: string; repo: string } | null {
  if (!skill.repo) return null
  const parts = skill.repo.split('/')
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}


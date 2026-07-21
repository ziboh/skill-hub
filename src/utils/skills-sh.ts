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

/** skills.sh 前端 infinite-scroll 使用的 API view 名（见官网 chunk：`/api/skills/${view}/${page}`） */
export type SkillsShApiView = 'all-time' | 'trending' | 'hot'

export const SKILLS_SH_PAGE_SIZE = 200

export function getFilterByKey(key: string): LeaderboardFilter {
  return LEADERBOARD_FILTERS.find((f) => f.key === key) || LEADERBOARD_FILTERS[0]
}

/** UI filter key → 官网 API view */
export function filterKeyToApiView(filterKey?: string): SkillsShApiView {
  if (filterKey === 'trending') return 'trending'
  if (filterKey === 'hot') return 'hot'
  return 'all-time'
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

/** Fallback public skill sitemaps (not /api/*). Each file holds up to ~10k skill URLs. */
export const SKILLS_SITEMAP_URLS = [
  'https://www.skills.sh/sitemap-skills-1.xml',
  'https://www.skills.sh/sitemap-skills-2.xml',
] as const

const SITEMAP_INDEX_URL = 'https://www.skills.sh/sitemap.xml'

const SKIP_SITEMAP_OWNERS = new Set(['agent', 'agents', 'api', 'search', 'trending', 'hot', 'internal'])

let skillsCatalogCache: LeaderboardEntry[] | null = null
let skillsCatalogPromise: Promise<LeaderboardEntry[]> | null = null
let skillsSitemapUrlCache: string[] | null = null

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

/** Extract skill-sitemap URLs from the public sitemap index (no /api). */
export function parseSkillsSitemapIndex(xml: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const locRe = /<loc>\s*(https?:\/\/(?:www\.)?skills\.sh\/sitemap-skills-\d+\.xml)\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = locRe.exec(xml)) !== null) {
    const url = m[1].replace('https://skills.sh/', 'https://www.skills.sh/')
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

export function clearSkillsCatalogCache(): void {
  skillsCatalogCache = null
  skillsCatalogPromise = null
  skillsSitemapUrlCache = null
}

async function resolveSkillsSitemapUrls(force = false): Promise<string[]> {
  if (!force && skillsSitemapUrlCache?.length) return skillsSitemapUrlCache
  try {
    const indexXml = await fetchText(SITEMAP_INDEX_URL)
    const fromIndex = parseSkillsSitemapIndex(indexXml)
    if (fromIndex.length > 0) {
      skillsSitemapUrlCache = fromIndex
      return fromIndex
    }
  } catch {
    /* fall back to known URLs */
  }
  skillsSitemapUrlCache = [...SKILLS_SITEMAP_URLS]
  return skillsSitemapUrlCache
}

export type SitemapCatalogProgress = {
  entries: LeaderboardEntry[]
  totalCount: number
  /** 已完成的 sitemap 文件数 */
  loadedFiles: number
  /** 计划加载的 sitemap 文件总数 */
  totalFiles: number
  done: boolean
}

/**
 * Load the full skills.sh catalog from public sitemaps (no /api).
 * Loads files one-by-one so callers can paint the first batch and grow on scroll.
 * Results are memoized in-memory for the session unless `force` is true.
 */
export async function fetchAllSkillsFromSitemap(
  force = false,
  onProgress?: (progress: SitemapCatalogProgress) => void,
): Promise<LeaderboardResult> {
  if (!force && skillsCatalogCache) {
    const cached = skillsCatalogCache
    onProgress?.({
      entries: cached,
      totalCount: cached.length,
      loadedFiles: 1,
      totalFiles: 1,
      done: true,
    })
    return { entries: cached, totalCount: cached.length }
  }
  if (!force && skillsCatalogPromise) {
    const entries = await skillsCatalogPromise
    onProgress?.({
      entries,
      totalCount: entries.length,
      loadedFiles: 1,
      totalFiles: 1,
      done: true,
    })
    return { entries, totalCount: entries.length }
  }

  const load = async (): Promise<LeaderboardEntry[]> => {
    const urls = await resolveSkillsSitemapUrls(force)
    const merged: LeaderboardEntry[] = []
    const seen = new Set<string>()
    let loadedFiles = 0
    for (const url of urls) {
      let xml = ''
      try {
        xml = await fetchText(url)
      } catch {
        loadedFiles += 1
        onProgress?.({
          entries: merged.slice(),
          totalCount: merged.length,
          loadedFiles,
          totalFiles: urls.length,
          done: loadedFiles >= urls.length,
        })
        continue
      }
      loadedFiles += 1
      if (xml && xml.includes('<loc')) {
        for (const entry of parseSkillsSitemap(xml)) {
          const key = `${entry.owner}/${entry.repo}/${entry.skillName}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(entry)
        }
      }
      onProgress?.({
        entries: merged.slice(),
        totalCount: merged.length,
        loadedFiles,
        totalFiles: urls.length,
        done: loadedFiles >= urls.length,
      })
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
 * 官网滚动加载的分页接口（与 skills.sh 前端一致）：
 *   GET /api/skills/{all-time|trending|hot}/{page}
 * page 从 0 起，每页最多 200 条，响应 `{ skills, hasMore }`。
 * all-time 实测约 0..47 页（约 9.5k 条）；第 26 条（0-based index 25）为 lark-approval。
 */
export interface SkillsPageResult {
  entries: LeaderboardEntry[]
  hasMore: boolean
  page: number
  view: SkillsShApiView
}

export async function fetchSkillsPage(view: SkillsShApiView, page: number): Promise<SkillsPageResult> {
  const safePage = Math.max(0, Math.floor(page))
  const url = `${BASE}/api/skills/${view}/${safePage}`
  const body = JSON.parse(await fetchText(url, { Accept: 'application/json' }))
  const raw = Array.isArray(body?.skills) ? body.skills : []
  const entries: LeaderboardEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const source = String(item.source || '')
    const skillId = String(item.skillId || item.name || '')
    const name = String(item.name || skillId)
    if (!source || !name) continue
    entries.push(
      publicSearchLikeToEntry(source, skillId || name, name, Number(item.installs) || 0),
    )
  }
  return {
    entries,
    hasMore: Boolean(body?.hasMore) && entries.length > 0,
    page: safePage,
    view,
  }
}

/**
 * 首屏列表：优先走官网同款分页 API page=0（含折叠组完整名次）。
 * API 失败时再回退解析排行榜 HTML。
 */
export async function fetchLeaderboard(filterKey?: string): Promise<LeaderboardResult> {
  const view = filterKeyToApiView(filterKey)
  try {
    const page0 = await fetchSkillsPage(view, 0)
    if (page0.entries.length > 0) {
      return { entries: page0.entries, totalCount: page0.entries.length }
    }
  } catch {
    /* fall through to HTML */
  }
  const filter = getFilterByKey(filterKey || 'all')
  const url = `${BASE}${filter.path}`
  const html = normalizeHtml(await fetchText(url))
  return parseLeaderboardHtml(html)
}

/** Pure HTML parser for leaderboard pages — exported for tests. */
export function parseLeaderboardHtml(html: string): LeaderboardResult {
  const normalized = normalizeHtml(html)
  const entries: LeaderboardEntry[] = []
  const seen = new Set<string>()

  // 1) 优先从页面内嵌 JSON（RSC / next_f）解析完整排行，含「+N more」折叠项
  //    例如 All Time 第 26 为 open.feishu.cn/lark-approval
  const fromPayload = parseLeaderboardFromEmbeddedJson(html)
  if (fromPayload.length > 0) {
    return { entries: fromPayload, totalCount: fromPayload.length }
  }

  // 2) 按页面上的名次数字排序（仅可见行，中间折叠会造成名次空洞）
  const rankedRe =
    /<a[^>]+href="(\/[^"']+\/[^"']+\/[^"']+\/?)"[^>]*>[\s\S]*?<span[^>]*font-mono[^>]*>(\d+)<\/span>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi
  let m: RegExpExecArray | null
  const ranked: { rank: number; entry: LeaderboardEntry }[] = []
  while ((m = rankedRe.exec(normalized)) !== null) {
    const path = m[1].replace(/\/+/g, '/').replace(/\/$/, '')
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 3) continue
    if (SKIP_SITEMAP_OWNERS.has(parts[0].toLowerCase())) continue
    const rank = Number(m[2])
    if (!Number.isFinite(rank) || rank < 1) continue
    const owner = parts[0]
    const repo = parts[1]
    const skillName = decodeHtmlEntities(stripTags(m[3])).trim() || parts[parts.length - 1]
    if (!skillName) continue
    const key = `${owner}/${repo}/${skillName}`
    if (seen.has(key)) continue
    seen.add(key)
    ranked.push({
      rank,
      entry: {
        owner,
        repo,
        skillName,
        detailPath: path,
        detailUrl: `${BASE}${path}`,
        installs: 0,
      },
    })
  }

  if (ranked.length > 0) {
    ranked.sort((a, b) => a.rank - b.rank || a.entry.skillName.localeCompare(b.entry.skillName))
    for (const item of ranked) entries.push(item.entry)
  } else {
    // 3) 回退：无名字次时按页面链接出现顺序
    const linkRe = /<a[^>]+href="(\/[^"']+\/[^"']+\/[^"']+\/?)"[^>]*>([\s\S]*?)<\/a>/gi
    while ((m = linkRe.exec(normalized)) !== null) {
      const path = m[1].replace(/\/+/g, '/').replace(/\/$/, '')
      const parts = path.split('/').filter(Boolean)
      if (parts.length < 3) continue
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
  }

  if (entries.length === 0) {
    const dataRe = /"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)"/g
    while ((m = dataRe.exec(normalized)) !== null) {
      const entry = publicSearchLikeToEntry(m[1], m[2], m[3], 0)
      const key = `${entry.owner}/${entry.repo}/${entry.skillName}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(entry)
    }
  }

  return { entries, totalCount: entries.length }
}

/**
 * Parse ranked skills from embedded page JSON (RSC flight / escaped JSON strings).
 * Keeps first-seen order (already ranked on the site) and fills installs when present.
 */
export function parseLeaderboardFromEmbeddedJson(html: string): LeaderboardEntry[] {
  const items: { source: string; skillId: string; name: string; installs: number }[] = []
  const patterns = [
    /\\"source\\":\\"([^\\"]+)\\",\\"skillId\\":\\"([^\\"]+)\\",\\"name\\":\\"([^\\"]+)\\",\\"installs\\":(\d+)/g,
    /"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)","installs":(\d+)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      items.push({
        source: m[1],
        skillId: m[2],
        name: m[3],
        installs: Number(m[4]) || 0,
      })
    }
    if (items.length > 0) break
  }
  if (items.length === 0) return []

  const seen = new Set<string>()
  const entries: LeaderboardEntry[] = []
  for (const it of items) {
    const entry = publicSearchLikeToEntry(it.source, it.skillId, it.name, it.installs)
    const key = `${entry.owner}/${entry.repo}/${entry.skillName}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  return entries
}

function publicSearchLikeToEntry(
  source: string,
  skillId: string,
  name: string,
  installs: number,
): LeaderboardEntry {
  const parts = source.split('/').filter(Boolean)
  const skillName = name || skillId
  // domain-style sources (well-known) 形如 open.feishu.cn，路径为 /site/<domain>/<skill>
  const isDomain = parts[0] === 'site' || (parts.length === 1 && parts[0].includes('.'))
  if (isDomain) {
    const domain =
      parts[0] === 'site' ? parts.slice(1).join('/') || source.replace(/^site\//, '') : source
    const detailPath = `/site/${domain}/${skillId || skillName}`
    return {
      owner: 'site',
      repo: domain,
      skillName,
      detailPath,
      detailUrl: `${BASE}${detailPath}`,
      installs,
    }
  }
  const owner = parts[0] || 'unknown'
  const repo = parts[1] || owner
  const dir = skillId || skillName
  const detailPath = `/${owner}/${repo}/${dir}`
  return {
    owner,
    repo,
    skillName,
    detailPath,
    detailUrl: `${BASE}${detailPath}`,
    installs,
  }
}

/** 把排行榜顺序放在前面，sitemap 其余条目接在后面（去重）。 */
export function mergeLeaderboardWithCatalog(
  leaderboard: LeaderboardEntry[],
  catalog: LeaderboardEntry[],
): LeaderboardEntry[] {
  const seen = new Set<string>()
  const out: LeaderboardEntry[] = []
  const keyOf = (e: LeaderboardEntry) => `${e.owner}/${e.repo}/${e.skillName}`.toLowerCase()
  for (const e of leaderboard) {
    const k = keyOf(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  for (const e of catalog) {
    const k = keyOf(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

// ── Fetch description from skills.sh detail page ──

function extractLdDescription(html: string): string | null {
  // type 属性顺序/引号可能变化；RSC 载荷里也可能有转义后的 JSON-LD
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        if (node?.description && (node['@type'] === 'SoftwareApplication' || node['@type'] === 'WebApplication')) {
          return String(node.description).trim()
        }
      }
    } catch {
      continue
    }
  }
  // 回退：从整页文本里抠 SoftwareApplication description（含转义引号）
  const escaped = html.match(
    /\\"@type\\":\\"SoftwareApplication\\"[^]*?\\"description\\":\\"((?:[^"\\]|\\.)*)\\"/i,
  )
  if (escaped?.[1]) {
    try {
      return JSON.parse(`"${escaped[1]}"`)
    } catch {
      const t = escaped[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim()
      if (t.length > 10) return t
    }
  }
  return null
}

function extractMetaDescription(html: string): string | null {
  // content 可能在 name/property 前或后
  const patterns = [
    /<meta[^>]+(?:name|property)\s*=\s*["'](?:description|og:description|twitter:description)["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:name|property)\s*=\s*["'](?:description|og:description|twitter:description)["']/i,
  ]
  for (const metaRe of patterns) {
    const m = html.match(metaRe)
    if (!m) continue
    const desc = decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim()
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
  // 详情页标题下的说明段落
  const afterH1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
  if (afterH1) {
    const text = stripTags(afterH1[1]).trim()
    if (text && text.length > 10) return text
  }
  return null
}

export async function fetchSkillDescriptionFromSh(skill: Skill): Promise<string | null> {
  const detailUrl = skill.sourceUrl || (skill.repo ? `${BASE}/${skill.repo}/${skill.path}` : '')
  if (!detailUrl) return null
  try {
    const html = await fetchText(detailUrl)
    const desc = extractLdDescription(html) || extractMetaDescription(html) || extractSummaryText(html)
    return desc ? desc.replace(/\s+/g, ' ').trim() : null
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

// ── Search（与官网一致：GET /api/search?q=…&limit=100）──

export interface PublicSearchResult {
  id?: string
  name: string
  source: string
  installs: number
  skillId?: string
}

/** 官网 SearchInput 使用的搜索接口。 */
export async function searchSkillsSh(q: string): Promise<PublicSearchResult[]> {
  if (!q || q.length < 1) return []
  const url = `${BASE}/api/search?q=${encodeURIComponent(q)}&limit=100`
  const body = JSON.parse(await fetchText(url, { Accept: 'application/json' }))
  return Array.isArray(body?.skills) ? body.skills : []
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


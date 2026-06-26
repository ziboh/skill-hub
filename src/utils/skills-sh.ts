import type { Skill } from '../types'
import { parseFrontmatter } from './frontmatter'
import { fetchGitHubFile, fetchGitHubRepoTree } from './github'

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
}

// ── Error ──

class SkillsShError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'SkillsShError'
  }
}

// ── HTTP helper ──

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { 'User-Agent': 'skill-hub' } })
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
  return input.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
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
    const owner = parts[0]
    const repo = parts[1]
    const anchorText = m[2]
    const h3Match = anchorText.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    const skillName = h3Match ? decodeHtmlEntities(stripTags(h3Match[1])).trim() : (stripTags(decodeHtmlEntities(anchorText)).trim() || parts[2])
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

  const filtered = entries.filter((e) => e.owner !== 'site')
  const totalCount = filtered.length
  return { entries: filtered, totalCount }
}

// ── Fetch skill detail from GitHub SKILL.md ──

export async function fetchSkillDetailFromSkill(skill: Skill): Promise<SkillDetailRaw | null> {
  if (!skill.repo) return null
  const parts = skill.repo.split('/')
  if (parts.length < 2) return null
  const [owner, repo] = parts
  const skillPath = skill.path || skill.name.toLowerCase().replace(/\s+/g, '-')
  const token = undefined

  try {
    const tree = await fetchGitHubRepoTree(owner, repo, 'main', token)
    const skillFiles = tree.filter(item =>
      item.type === 'blob' && /SKILL\.md$/i.test(item.path)
    )

    const normalizedName = skillPath.toLowerCase().replace(/[^a-z0-9]/g, '')
    let bestMatch = skillFiles[0]?.path || null
    let bestScore = 0

    for (const file of skillFiles) {
      const dir = file.path.replace(/\/SKILL\.md$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (dir === normalizedName) { bestMatch = file.path; break }
      if (dir.includes(normalizedName) || normalizedName.includes(dir)) {
        const score = Math.min(dir.length, normalizedName.length)
        if (score > bestScore) { bestScore = score; bestMatch = file.path }
      }
    }

    if (bestMatch) {
      const content = await fetchGitHubFile(owner, repo, bestMatch)
      if (content) {
        const fm = parseFrontmatter(content)
        return { name: fm.name || skill.name, description: fm.description || '', content }
      }
    }
  } catch {}

  const pathCandidates = [
    `${skillPath}/SKILL.md`,
    `skills/${skillPath}/SKILL.md`,
    `agent-skills/${skillPath}/SKILL.md`,
    'SKILL.md',
  ]
  for (const p of pathCandidates) {
    try {
      const content = await fetchGitHubFile(owner, repo, p)
      if (content) {
        const fm = parseFrontmatter(content)
        return { name: fm.name || skill.name, description: fm.description || '', content }
      }
    } catch { continue }
  }
  return null
}

// ── Search ──

export interface PublicSearchResult {
  name: string
  source: string
  installs: number
  skillId?: string
}

export async function searchSkillsSh(q: string): Promise<PublicSearchResult[]> {
  if (!q || q.length < 1) return []
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(q)}`
  const resp = await fetch(url, { headers: { 'User-Agent': 'skill-hub', Accept: 'application/json' } })
  if (!resp.ok) throw new SkillsShError(resp.status, `search API error: ${resp.status}`)
  const body = await resp.json()
  return body.skills || []
}

// ── Converters ──

export function leaderboardEntryToSkill(e: LeaderboardEntry): Skill {
  const dirName = e.detailPath.split('/').filter(Boolean).pop() || e.skillName.toLowerCase().replace(/\s+/g, '-')
  return {
    id: `${e.owner}/${e.repo}/${dirName}`,
    name: e.skillName,
    description: '',
    author: e.owner,
    tags: [],
    format: 'generic',
    source: 'skills-sh',
    repo: `${e.owner}/${e.repo}`,
    path: dirName,
    installCount: e.installs,
  }
}

export function searchResultToSkill(s: PublicSearchResult): Skill {
  const parts = s.source.split('/')
  const owner = parts[0] || ''
  const path = s.skillId || s.name.toLowerCase().replace(/\s+/g, '-')
  return {
    id: `${s.source}/${path}`,
    name: s.name,
    description: '',
    author: owner,
    tags: [],
    format: 'generic',
    source: 'skills-sh',
    repo: s.source,
    path,
    installCount: s.installs,
  }
}

// ── GitHub download helpers ──

export function getGitHubRepo(skill: Skill): { owner: string; repo: string } | null {
  if (!skill.repo) return null
  const parts = skill.repo.split('/')
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}

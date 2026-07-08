import type { Skill } from '../types'

export interface WellKnownSkillResult {
  skillMd: string
  files: Map<string, string>
}

export function isWellKnownSkill(skill: Skill): boolean {
  if (!skill.repo) return false
  const owner = skill.repo.split('/')[0] || ''
  return owner === 'site' || owner.includes('.')
}

export function getWellKnownOrigin(skill: Skill): string | null {
  // 从 skills.sh URL 中提取实际域名
  // 格式: https://skills.sh/site/open.feishu.cn/lark-approval
  if (skill.sourceUrl) {
    try {
      const url = new URL(skill.sourceUrl)
      if (url.hostname === 'skills.sh') {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[0] === 'site' && parts[1]) {
          return `https://${parts[1]}`
        }
      }
      return url.origin
    } catch {}
  }
  if (skill.homepage) {
    try {
      return new URL(skill.homepage).origin
    } catch {}
  }
  if (skill.repo) {
    const owner = skill.repo.split('/')[0] || ''
    if (owner.includes('.') && owner !== 'site') {
      return `https://${owner}`
    }
  }
  return null
}

export function getWellKnownSkillName(skill: Skill): string {
  // 从 skills.sh URL 中提取技能名
  // 格式: https://skills.sh/site/open.feishu.cn/lark-approval
  if (skill.sourceUrl) {
    try {
      const url = new URL(skill.sourceUrl)
      if (url.hostname === 'skills.sh') {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length >= 3) {
          return parts[parts.length - 1]
        }
      }
    } catch {}
  }
  if (skill.path) return skill.path
  if (skill.repo) {
    const parts = skill.repo.split('/')
    return parts[parts.length - 1] || skill.name.toLowerCase().replace(/\s+/g, '-')
  }
  return skill.name.toLowerCase().replace(/\s+/g, '-')
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'skill-hub' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'skill-hub' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

interface WellKnownIndexV1 {
  skills: Array<{ name: string; description: string; files: string[] }>
}

interface WellKnownIndexV2 {
  $schema: string
  skills: Array<{ name: string; type: string; description: string; url: string; digest: string }>
}

export async function downloadSkillFromWebsite(skill: Skill): Promise<WellKnownSkillResult | null> {
  const origin = getWellKnownOrigin(skill)
  if (!origin) return null

  const skillName = getWellKnownSkillName(skill)

  // 1. 尝试获取 index.json (首选: /.well-known/agent-skills/index.json)
  const indexPaths = [
    '/.well-known/agent-skills/index.json',
    '/.well-known/skills/index.json',
  ]

  for (const indexPath of indexPaths) {
    const index = await fetchJson(`${origin}${indexPath}`)
    if (!index || !Array.isArray(index.skills)) continue

    // v0.2.0 格式
    if (index.$schema && index.$schema.includes('0.2.0')) {
      const entry = (index as WellKnownIndexV2).skills.find(
        (s) => s.name === skillName
      )
      if (entry) {
        const skillUrl = new URL(entry.url, `${origin}${indexPath}`).href
        const content = await fetchText(skillUrl)
        if (content) {
          return { skillMd: content, files: new Map([['SKILL.md', content]]) }
        }
      }
    }

    // v0.1.0 旧版格式 - 下载所有文件
    const entry = (index as WellKnownIndexV1).skills.find(
      (s) => s.name === skillName
    )
    if (entry) {
      const wellKnownPath = indexPath.replace('/index.json', '')
      const skillBaseUrl = `${origin}${wellKnownPath}/${entry.name}`
      const files = new Map<string, string>()

      // 并行下载所有文件
      const filePromises = entry.files.map(async (filePath) => {
        const fileUrl = `${skillBaseUrl}/${filePath}`
        const content = await fetchText(fileUrl)
        return { path: filePath, content }
      })

      const results = await Promise.all(filePromises)
      for (const result of results) {
        if (result.content) {
          files.set(result.path, result.content)
        }
      }

      const skillMd = files.get('SKILL.md')
      if (skillMd) {
        return { skillMd, files }
      }
    }
  }

  // 2. 直接尝试常见路径下载 SKILL.md
  const pathCandidates = [
    `/.well-known/agent-skills/${skillName}/SKILL.md`,
    `/.well-known/skills/${skillName}/SKILL.md`,
    `/SKILL.md`,
    `/skill.md`,
  ]

  for (const p of pathCandidates) {
    const content = await fetchText(`${origin}${p}`)
    if (content && content.includes('---')) {
      return { skillMd: content, files: new Map([['SKILL.md', content]]) }
    }
  }

  return null
}

export async function downloadDirectFromStore(skill: Skill): Promise<WellKnownSkillResult | null> {
  if (!skill.sourceUrl) return null
  try {
    const url = new URL(skill.sourceUrl)
    const origin = url.origin
    const skillName = skill.path || skill.name.toLowerCase().replace(/\s+/g, '-')

    const pathCandidates = [
      `${origin}/${skillName}/SKILL.md`,
      `${origin}/skills/${skillName}/SKILL.md`,
      `${origin}/agent-skills/${skillName}/SKILL.md`,
    ]

    for (const candidateUrl of pathCandidates) {
      const content = await fetchText(candidateUrl)
      if (content && content.includes('---')) {
        return { skillMd: content, files: new Map([['SKILL.md', content]]) }
      }
    }
  } catch {}
  return null
}

export async function fetchWellKnownIndex(url: string): Promise<Skill[]> {
  const urlsToTry: string[] = url.endsWith('.json')
    ? [url]
    : [`${url.replace(/\/+$/, '')}/.well-known/agent-skills/index.json`,
       `${url.replace(/\/+$/, '')}/.well-known/skills/index.json`]

  for (const fetchUrl of urlsToTry) {
    const data = await fetchJson(fetchUrl)
    if (!data || !Array.isArray(data.skills)) continue

    const origin = new URL(fetchUrl).origin
    const repoPrefix = origin.replace(/^https?:\/\//, '')

    // v0.2.0 格式（带 $schema）
    if (typeof data.$schema === 'string' && data.$schema.includes('0.2.0')) {
      return (data as WellKnownIndexV2).skills.map(e => ({
        id: `${repoPrefix}/${e.name}`,
        name: e.name,
        description: e.description || '',
        author: '',
        tags: [],
        source: 'well-known-index',
        repo: `${repoPrefix}/${e.name}`,
        sourceUrl: fetchUrl,
        path: e.name,
      }))
    }

    // v0.1.0 格式
    return (data as WellKnownIndexV1).skills.map(e => ({
      id: `${repoPrefix}/${e.name}`,
      name: e.name,
      description: e.description || '',
      author: '',
      tags: [],
      source: 'well-known-index' as any,
      repo: `${repoPrefix}/${e.name}`,
      sourceUrl: fetchUrl,
      path: e.name,
    }))
  }
  return []
}

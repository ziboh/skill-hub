import type { StoreSourceType } from '../types'
import { parseGitHubUrl } from './github'

export interface ValidationResult {
  valid: boolean
  message: string
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

export async function validateStoreUrl(url: string, type: StoreSourceType): Promise<ValidationResult> {
  const trimmed = url.trim()
  if (!trimmed) return { valid: false, message: 'URL 不能为空' }

  // 格式校验
  try {
    new URL(trimmed)
  } catch {
    return { valid: false, message: 'URL 格式无效' }
  }

  switch (type) {
    case 'marketplace-json': {
      if (/\.well-known\/(?:agent-skills|skills)\/index\.json$/i.test(trimmed)) {
        return { valid: false, message: '此 URL 是 Well-Known Agent Skills 索引格式，请选择「Well-Known Index」商店类型' }
      }

      const data = await fetchJson(trimmed)
      if (!data) return { valid: false, message: '无法访问 URL，请检查地址或网络' }

      const entries = Array.isArray(data) ? data : (data.skills || data.plugins || data.packages || [])
      if (!Array.isArray(entries) || entries.length === 0) {
        return { valid: false, message: 'JSON 中未找到有效的技能列表（需要数组或 skills/plugins/packages 字段）' }
      }
      return { valid: true, message: `验证通过，检测到 ${entries.length} 个技能` }
    }

    case 'well-known-index': {
      const urlsToTry: string[] = trimmed.endsWith('.json')
        ? [trimmed]
        : [`${trimmed.replace(/\/+$/, '')}/.well-known/agent-skills/index.json`,
           `${trimmed.replace(/\/+$/, '')}/.well-known/skills/index.json`]

      for (const fetchUrl of urlsToTry) {
        const data = await fetchJson(fetchUrl)
        if (data && Array.isArray(data.skills) && data.skills.length > 0) {
          return { valid: true, message: `验证通过，检测到 ${data.skills.length} 个技能` }
        }
      }
      return { valid: false, message: '未找到有效的 Well-Known 索引（检查 URL 或 /.well-known/skills/index.json）' }
    }

    case 'git-repo': {
      const info = parseGitHubUrl(trimmed)
      if (!info) return { valid: false, message: '不是有效的 GitHub 仓库地址（格式：owner/repo）' }
      return { valid: true, message: `验证通过：${info.owner}/${info.repo}` }
    }

    case 'local-dir': {
      try {
        const exists = window.services.pathExists(trimmed)
        if (!exists) return { valid: false, message: '本地路径不存在' }
        return { valid: true, message: '验证通过' }
      } catch {
        return { valid: false, message: '无法访问本地路径' }
      }
    }

    default:
      return { valid: true, message: '' }
  }
}

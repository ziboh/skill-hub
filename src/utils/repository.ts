export type RepositoryProvider = 'github' | 'gitee'

export interface RepositoryInfo {
  provider: RepositoryProvider
  owner: string
  repo: string
  defaultBranch: string
}

export function parseRepositoryUrl(url: string): RepositoryInfo | null {
  const trimmed = url.trim()
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(github\.com|gitee\.com)\/([^/]+)\/([^/]+?)(?:\/|$)/i)
  if (!match) {
    const shortMatch = trimmed.match(/^([^/]+)\/([^/]+?)$/)
    if (!shortMatch) return null
    return { provider: 'github', owner: shortMatch[1], repo: shortMatch[2].replace(/\.git$/, ''), defaultBranch: 'main' }
  }
  const provider = match[1].toLowerCase().startsWith('gitee') ? 'gitee' : 'github'
  return {
    provider,
    owner: match[2],
    repo: match[3].replace(/\.git$/, ''),
    defaultBranch: provider === 'gitee' ? 'main' : 'main',
  }
}

export function getRepositoryUrl(info: Pick<RepositoryInfo, 'provider' | 'owner' | 'repo'>): string {
  return `https://${info.provider === 'gitee' ? 'gitee.com' : 'github.com'}/${info.owner}/${info.repo}`
}

export type RepositoryProvider = 'github' | 'gitee'

export interface RepositoryInfo {
  provider: RepositoryProvider
  owner: string
  repo: string
  defaultBranch: string
}

function isValidRepositoryPart(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
}

export function parseRepositoryUrl(url: string): RepositoryInfo | null {
  const trimmed = url.trim()
  const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(github\.com|gitee\.com)\/([^/?#\s]+)\/([^/?#\s]+)(?:\/|$)/i)
  if (match) {
    const owner = match[2]
    const repo = match[3].replace(/\.git$/i, '')
    if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) return null

    const provider = match[1].toLowerCase().startsWith('gitee') ? 'gitee' : 'github'
    return {
      provider,
      owner,
      repo,
      defaultBranch: 'main',
    }
  }

  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!shortMatch) return null
  const owner = shortMatch[1]
  const repo = shortMatch[2].replace(/\.git$/i, '')
  if (/^(?:www\.)?(?:github|gitee)\.com$/i.test(owner)) return null
  if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) return null
  return {
    provider: 'github',
    owner,
    repo,
    defaultBranch: 'main',
  }
}

export function getRepositoryUrl(info: Pick<RepositoryInfo, 'provider' | 'owner' | 'repo'>): string {
  return `https://${info.provider === 'gitee' ? 'gitee.com' : 'github.com'}/${info.owner}/${info.repo}`
}

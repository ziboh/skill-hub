export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(String(value || '').trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
  } catch {
    return false
  }
}

export function isValidApiPath(value: string): boolean {
  const path = String(value || '').trim()
  return !!path && path.startsWith('/') && !/[\s\p{Cc}]/u.test(path) && !path.includes('://')
}

export function isValidRelativeRepositoryPath(value: string): boolean {
  const path = String(value || '')
    .trim()
    .replace(/\\/g, '/')
  if (!path || path === '.') return path === '.'
  if (path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.startsWith('~/')) return false
  const segments = path.split('/').filter(Boolean)
  return segments.length > 0 && !segments.some((segment) => segment === '..' || /\p{Cc}/u.test(segment))
}

export function validateGitSourceOptions(branch: string, directory: string): string | null {
  const branchValue = String(branch || '').trim()
  if (branchValue && (!/^[^\s\p{Cc}]+$/u.test(branchValue) || branchValue.includes('..') || branchValue.includes('\\'))) {
    return '分支名格式无效，请勿包含空格、.. 或反斜杠。'
  }

  const directoryValue = String(directory || '').trim()
  if (directoryValue && !isValidRelativeRepositoryPath(directoryValue)) {
    return '目录必须是仓库内的相对路径，且不能包含绝对路径或 ..。'
  }
  return null
}

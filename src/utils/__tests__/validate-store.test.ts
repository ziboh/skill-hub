import { describe, expect, test, vi } from 'vitest'
import { validateStoreUrl } from '../validate-store'

describe('validateStoreUrl', () => {
  test('accepts the short owner/repo form for Git sources', async () => {
    await expect(validateStoreUrl('acme/skills', 'git-repo')).resolves.toEqual({
      valid: true,
      message: '验证通过：GitHub / acme/skills',
    })
  })

  test('accepts an existing local directory without treating it as a URL', async () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.stat).mockReturnValue({ exists: true, isDirectory: true })

    await expect(validateStoreUrl('~/Documents/skills', 'local-dir')).resolves.toEqual({ valid: true, message: '验证通过' })
  })

  test('rejects a local file path', async () => {
    vi.mocked(window.services.pathExists).mockReturnValue(true)
    vi.mocked(window.services.stat).mockReturnValue({ exists: true, isDirectory: false })

    const result = await validateStoreUrl('/tmp/skills.json', 'local-dir')
    expect(result).toEqual({ valid: false, message: '本地路径必须是文件夹' })
  })

  test('rejects non-http remote URLs', async () => {
    const result = await validateStoreUrl('ftp://example.com/index.json', 'marketplace-json')
    expect(result).toEqual({ valid: false, message: '仅支持 HTTP 或 HTTPS URL' })
  })
})

import { beforeEach, describe, expect, test } from 'vitest'
import { storage } from '../storage'

describe('设置存储迁移', () => {
  beforeEach(() => {
    window.ztools.dbStorage.clear()
  })

  test('读取旧设置时移除已废弃及未知字段', () => {
    window.ztools.dbStorage.setItem(
      'sm_settings',
      JSON.stringify({
        themeColor: 'green',
        theme: 'dark',
        backgroundImage: 'data:image/png;base64,legacy',
        backgroundImageEnabled: true,
        backgroundOpacity: 50,
        backgroundBlur: 8,
        legacyUnknownSetting: '旧值',
      }),
    )

    const settings = storage.getSettings() as Record<string, unknown>
    const persisted = JSON.parse(window.ztools.dbStorage.getItem('sm_settings')!)

    expect(settings.themeColor).toBe('green')
    expect(settings).not.toHaveProperty('theme')
    expect(settings).not.toHaveProperty('backgroundImage')
    expect(settings).not.toHaveProperty('backgroundImageEnabled')
    expect(settings).not.toHaveProperty('backgroundOpacity')
    expect(settings).not.toHaveProperty('backgroundBlur')
    expect(settings).not.toHaveProperty('legacyUnknownSetting')
    expect(persisted).not.toHaveProperty('backgroundImage')
    expect(persisted).not.toHaveProperty('theme')
    expect(persisted).not.toHaveProperty('legacyUnknownSetting')
  })

  test('默认提供独立的 Gitee 访问令牌字段', () => {
    const settings = storage.getSettings() as Record<string, unknown>
    expect(settings.githubToken).toBe('')
    expect(settings.giteeToken).toBe('')
  })
})

import { afterEach, describe, expect, test, vi } from 'vitest'
import { dbGet, dbSet, PREFIX } from '../storage/core'

describe('storage backend', () => {
  const ztools = window.ztools

  afterEach(() => {
    localStorage.clear()
    vi.stubGlobal('ztools', ztools)
  })

  test('uses localStorage when ZTools storage is unavailable', () => {
    vi.stubGlobal('ztools', undefined)

    expect(dbSet('browser_store', { presetId: 'codex' })).toBe(true)
    expect(localStorage.getItem(PREFIX + 'browser_store')).toBe(JSON.stringify({ presetId: 'codex' }))
    expect(dbGet('browser_store')).toEqual({ presetId: 'codex' })
  })
})

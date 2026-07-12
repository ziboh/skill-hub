import { describe, test, expect, beforeEach } from 'vitest'
import {
  registerIcon,
  registerAlias,
  getIconAsset,
  resolveIconKey,
  _resetRegistryForTest,
} from '../registry'

describe('registry', () => {
  beforeEach(() => {
    _resetRegistryForTest()
  })

  test('register and get by ns:id', () => {
    registerIcon('providers', 'openai', { type: 'inline-svg', svg: '<svg id="o"/>' })
    expect(getIconAsset('providers:openai')).toEqual({ type: 'inline-svg', svg: '<svg id="o"/>' })
  })

  test('alias expands', () => {
    registerIcon('providers', 'silicon', { type: 'src', src: '/s.svg' })
    registerAlias('siliconcloud', 'providers:silicon')
    expect(resolveIconKey('siliconcloud')).toBe('providers:silicon')
    expect(getIconAsset('siliconcloud')).toEqual({ type: 'src', src: '/s.svg' })
  })

  test('bare key lookup order providers then platforms then store', () => {
    registerIcon('platforms', 'claude', { type: 'src', src: '/c.png' })
    registerIcon('providers', 'claude', { type: 'inline-svg', svg: '<svg/>' })
    expect(resolveIconKey('claude')).toBe('providers:claude')

    _resetRegistryForTest()
    registerIcon('platforms', 'codex', { type: 'src', src: '/x.png' })
    expect(resolveIconKey('codex')).toBe('platforms:codex')
  })

  test('store: prefix maps to store namespace', () => {
    registerIcon('store', 'git-repo', { type: 'inline-svg', svg: '<svg g/>' })
    expect(resolveIconKey('store:git-repo')).toBe('store:git-repo')
    expect(getIconAsset('store:git-repo')?.type).toBe('inline-svg')
  })

  test('unknown key returns undefined', () => {
    expect(getIconAsset('nope')).toBeUndefined()
    expect(resolveIconKey('nope')).toBeUndefined()
  })
})

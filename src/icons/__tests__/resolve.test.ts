import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { parseIcon } from '../detect'
import { registerIcon, _resetRegistryForTest } from '../registry'
import { resolveIcon, injectSvgIds } from '../resolve'

describe('injectSvgIds', () => {
  test('prefixes ids and url(#) refs', () => {
    const raw = '<svg><defs><linearGradient id="g1"/></defs><rect fill="url(#g1)"/></svg>'
    const out = injectSvgIds(raw)
    expect(out).toMatch(/id="c\d+-g1"/)
    expect(out).toMatch(/url\(#c\d+-g1\)/)
  })
})

describe('resolveIcon', () => {
  beforeEach(() => {
    _resetRegistryForTest()
  })

  afterEach(() => {
    const w = (globalThis as any).window
    if (w?.services) delete w.services
  })

  test('empty', async () => {
    expect(await resolveIcon(parseIcon(''))).toEqual({ mode: 'empty' })
  })

  test('inline-svg', async () => {
    const r = await resolveIcon(parseIcon('<svg id="a"></svg>'))
    expect(r.mode).toBe('svg')
    if (r.mode === 'svg') expect(r.svg).toMatch(/id="c\d+-a"/)
  })

  test('src', async () => {
    expect(await resolveIcon(parseIcon('https://x/a.png'))).toEqual({
      mode: 'img',
      src: 'https://x/a.png',
    })
  })

  test('key module-svg and inline asset', async () => {
    registerIcon('providers', 'openai', {
      type: 'module-svg',
      load: async () => '<svg id="o"></svg>',
    })
    const r = await resolveIcon(parseIcon('openai'))
    expect(r.mode).toBe('svg')
  })

  test('key module-url', async () => {
    registerIcon('platforms', 'claude', {
      type: 'module-url',
      load: async () => '/assets/claude.png',
    })
    expect(await resolveIcon(parseIcon('claude'))).toEqual({
      mode: 'img',
      src: '/assets/claude.png',
    })
  })

  test('local uses readFileAsDataUri', async () => {
    const g = globalThis as any
    if (!g.window) g.window = {}
    g.window.services = {
      readFileAsDataUri: (p: string) => (p.includes('icon.png') ? 'data:image/png;base64,xx' : ''),
    }
    const r = await resolveIcon(parseIcon('C:\\tmp\\icon.png'))
    expect(r).toEqual({ mode: 'img', src: 'data:image/png;base64,xx' })
  })

  test('local svg uses readFile for inline svg', async () => {
    const g = globalThis as any
    if (!g.window) g.window = {}
    g.window.services = {
      readFile: (p: string) => (p.endsWith('.svg') ? '<svg id="x"></svg>' : ''),
      readFileAsDataUri: () => null,
    }
    const r = await resolveIcon(parseIcon('C:\\tmp\\icon.svg'))
    expect(r.mode).toBe('svg')
    if (r.mode === 'svg') expect(r.svg).toContain('<svg')
  })

  test('unknown key empty', async () => {
    expect(await resolveIcon(parseIcon('no-such-icon'))).toEqual({ mode: 'empty' })
  })
})

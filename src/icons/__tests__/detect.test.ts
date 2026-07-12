import { describe, test, expect, beforeEach } from 'vitest'
import { parseIcon, registerParseRule, unregisterParseRule, _resetParseRulesForTest } from '../detect'

describe('parseIcon', () => {
  beforeEach(() => {
    _resetParseRulesForTest()
  })

  test('empty for null/undefined/blank', () => {
    expect(parseIcon(null)).toEqual({ kind: 'empty', value: '' })
    expect(parseIcon(undefined)).toEqual({ kind: 'empty', value: '' })
    expect(parseIcon('   ')).toEqual({ kind: 'empty', value: '' })
  })

  test('inline-svg', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    expect(parseIcon(svg)).toEqual({ kind: 'inline-svg', value: svg })
    expect(parseIcon('  ' + svg)).toEqual({ kind: 'inline-svg', value: svg.trim() })
  })

  test('data-uri and urls as src', () => {
    expect(parseIcon('data:image/png;base64,xx').kind).toBe('src')
    expect(parseIcon('https://a.com/i.png')).toEqual({ kind: 'src', value: 'https://a.com/i.png' })
    expect(parseIcon('http://a.com/i.png').kind).toBe('src')
    expect(parseIcon('/app-icon.png')).toEqual({ kind: 'src', value: '/app-icon.png' })
  })

  test('windows and unc local paths', () => {
    expect(parseIcon('C:\\Users\\a\\icon.png')).toEqual({ kind: 'local', value: 'C:\\Users\\a\\icon.png' })
    expect(parseIcon('D:/icons/a.png').kind).toBe('local')
    expect(parseIcon('\\\\server\\share\\a.png').kind).toBe('local')
  })

  test('bare keys and store: prefix are key', () => {
    expect(parseIcon('openai')).toEqual({ kind: 'key', value: 'openai' })
    expect(parseIcon('store:git-repo')).toEqual({ kind: 'key', value: 'store:git-repo' })
  })

  test('custom parse rule can take priority', () => {
    registerParseRule({
      id: 'emoji',
      order: 50,
      test: (raw) => raw.startsWith('emoji:'),
      parse: (raw) => ({ kind: 'key', value: raw }),
    })
    expect(parseIcon('emoji:star')).toEqual({ kind: 'key', value: 'emoji:star' })
    unregisterParseRule('emoji')
  })
})

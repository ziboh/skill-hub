import type { IconValue, ParseRule } from './types'

const builtinRules: ParseRule[] = [
  {
    id: 'inline-svg',
    order: 100,
    test: (raw) => raw.startsWith('<svg'),
    parse: (raw) => ({ kind: 'inline-svg', value: raw }),
  },
  {
    id: 'data-uri',
    order: 200,
    test: (raw) => raw.startsWith('data:'),
    parse: (raw) => ({ kind: 'src', value: raw }),
  },
  {
    id: 'url',
    order: 300,
    test: (raw) => raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/'),
    parse: (raw) => ({ kind: 'src', value: raw }),
  },
  {
    id: 'local',
    order: 400,
    test: (raw) => /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\'),
    parse: (raw) => ({ kind: 'local', value: raw }),
  },
  {
    id: 'key',
    order: 500,
    test: () => true,
    parse: (raw) => ({ kind: 'key', value: raw }),
  },
]

let customRules: ParseRule[] = []

function allRules(): ParseRule[] {
  return [...customRules, ...builtinRules].sort((a, b) => a.order - b.order)
}

export function registerParseRule(rule: ParseRule): void {
  customRules = customRules.filter((r) => r.id !== rule.id).concat(rule)
}

export function unregisterParseRule(id: string): void {
  customRules = customRules.filter((r) => r.id !== id)
}

/** 仅测试用 */
export function _resetParseRulesForTest(): void {
  customRules = []
}

export function parseIcon(input?: string | null): IconValue {
  if (input == null) return { kind: 'empty', value: '' }
  const raw = input.trim()
  if (!raw) return { kind: 'empty', value: '' }
  for (const rule of allRules()) {
    if (rule.test(raw)) return rule.parse(raw)
  }
  return { kind: 'empty', value: '' }
}

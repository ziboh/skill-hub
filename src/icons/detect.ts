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
    // Remote URLs + Vite/public root-relative assets (e.g. /assets/xxx.png)
    // Do NOT treat real Unix home paths as browser src — those go to local below.
    test: (raw) => {
      if (raw.startsWith('http://') || raw.startsWith('https://')) return true
      if (!raw.startsWith('/')) return false
      // Real filesystem abs paths (user-imported icons on macOS/Linux)
      if (/^\/(Users|home|var|tmp|private|opt|root|etc)\b/i.test(raw)) return false
      return true
    },
    parse: (raw) => ({ kind: 'src', value: raw }),
  },
  {
    id: 'local',
    order: 400,
    // Windows drive, UNC, home-relative, Unix abs FS paths, or relative image paths
    test: (raw) =>
      /^[A-Za-z]:[\\/]/.test(raw) ||
      raw.startsWith('\\\\') ||
      raw.startsWith('~/') ||
      /^\/(Users|home|var|tmp|private|opt|root|etc)\b/i.test(raw) ||
      (/^\.{0,2}[\\/]/.test(raw) && /\.(svg|png|jpe?g|gif|ico|webp)$/i.test(raw)),
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

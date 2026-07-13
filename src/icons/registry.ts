import type { IconAsset } from './types'

const assets = new Map<string, IconAsset>()
const aliases = new Map<string, string>()

const BARE_LOOKUP_NS = ['providers', 'platforms', 'store'] as const

export function registerIcon(ns: string, id: string, asset: IconAsset): void {
  assets.set(`${ns}:${id}`, asset)
}

export function registerAlias(from: string, to: string): void {
  aliases.set(from, to)
}

export function resolveIconKey(key: string): string | undefined {
  let cur = key
  const seen = new Set<string>()
  while (aliases.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    cur = aliases.get(cur)!
  }
  if (assets.has(cur)) return cur
  if (cur.includes(':')) {
    return assets.has(cur) ? cur : undefined
  }
  for (const ns of BARE_LOOKUP_NS) {
    const full = `${ns}:${cur}`
    if (assets.has(full)) return full
  }
  return undefined
}

export function getIconAsset(key: string): IconAsset | undefined {
  const resolved = resolveIconKey(key)
  if (!resolved) return undefined
  return assets.get(resolved)
}

/** List registered icon keys, optionally filtered by namespace (`providers`, `platforms`, `store`). */
export function listRegisteredIconKeys(ns?: string): string[] {
  const keys: string[] = []
  for (const key of assets.keys()) {
    if (!ns) {
      keys.push(key)
      continue
    }
    if (key.startsWith(`${ns}:`)) keys.push(key)
  }
  return keys.sort((a, b) => a.localeCompare(b))
}

/** Bare ids under a namespace (e.g. platforms → cursor, claude). */
export function listRegisteredIconIds(ns: string): string[] {
  const prefix = `${ns}:`
  return listRegisteredIconKeys(ns).map((k) => k.slice(prefix.length))
}

export function _resetRegistryForTest(): void {
  assets.clear()
  aliases.clear()
}

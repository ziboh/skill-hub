import skillsShIcon from '../assets/providers/vercel.svg?raw'
import claudeIcon from '../assets/platforms/claude.svg?inline'
import codexIcon from '../assets/platforms/codex.svg?inline'
import { parseIcon, getIconAsset, resolveIconKey } from '../icons'
import {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from '../icons/store-default-svgs'

export { ICON_GITHUB, ICON_MARKETPLACE, ICON_WELL_KNOWN, ICON_FOLDER, ICON_STORE }

/** 供 source-info 等直接当 img src 使用 */
export const STORE_ICONS: Record<string, string> = {
  'skills-sh': skillsShIcon,
  claude: claudeIcon,
  codex: codexIcon,
}

export type StoreId = keyof typeof STORE_ICONS

export const STORE_TYPE_DEFAULT_ICONS: Record<string, string> = {
  'git-repo': ICON_GITHUB,
  github: ICON_GITHUB,
  'marketplace-json': ICON_MARKETPLACE,
  'well-known-index': ICON_WELL_KNOWN,
  'local-dir': ICON_FOLDER,
}

export function getDefaultStoreIcon(type: string): string {
  return STORE_TYPE_DEFAULT_ICONS[type] ? `store:${type}` : 'store:git-repo'
}

export function getStoreIconFromSource(source: { type: string; icon?: string }): string {
  if (source.icon) return source.icon
  return getDefaultStoreIcon(source.type)
}

/** @deprecated 使用 parseIcon / AppIcon，勿在业务 template 分支渲染 */
export type IconRenderType = 'svg' | 'url' | 'data-uri' | 'local-path' | 'provider-icon' | 'store-icon'

/** @deprecated 使用 parseIcon(icon).kind */
export function getIconRenderType(icon?: string): IconRenderType {
  const k = parseIcon(icon).kind
  if (k === 'inline-svg' || k === 'empty') return 'svg'
  if (k === 'src') {
    if (icon!.startsWith('data:')) return 'data-uri'
    return 'url'
  }
  if (k === 'local') return 'local-path'
  if (icon?.startsWith('store:') || resolveIconKey(icon!)?.startsWith('store:')) return 'store-icon'
  if (getIconAsset(icon!) || resolveIconKey(icon!)) return 'provider-icon'
  return 'local-path'
}

/** @deprecated 使用 AppIcon / resolveIconKey */
export function isProviderIcon(name: string): boolean {
  if (!name) return false
  const p = parseIcon(name)
  if (p.kind !== 'key') return false
  const full = resolveIconKey(p.value)
  return !!full && (full.startsWith('providers:') || full.startsWith('platforms:'))
}

/** @deprecated 使用 AppIcon / getIconAsset */
export function isStoreIconKey(name: string): boolean {
  if (!name?.startsWith('store:')) return false
  if (getIconAsset(name)) return true
  const key = name.slice(6)
  return key in STORE_ICONS || key in STORE_TYPE_DEFAULT_ICONS
}

/** @deprecated 使用 AppIcon；module 资产无法同步返回 */
export function resolveStoreIcon(name: string): string | undefined {
  if (!name?.startsWith('store:')) return undefined
  const asset = getIconAsset(name)
  if (asset) {
    if (asset.type === 'inline-svg') return asset.svg
    if (asset.type === 'src') return asset.src
    return undefined
  }
  const key = name.slice(6)
  return STORE_ICONS[key] || STORE_TYPE_DEFAULT_ICONS[key]
}

import skillsShIcon from '../assets/platforms/skills-sh-favicon.ico'
import claudeIcon from '../assets/platforms/claude.png'
import codexIcon from '../assets/platforms/codex.png'
import { AVAILABLE_ICONS } from './ai-providers'
export {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from '../icons/store-default-svgs'
import {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from '../icons/store-default-svgs'

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
  switch (type) {
    case 'git-repo':
    case 'github':
      return ICON_GITHUB
    case 'marketplace-json':
      return ICON_MARKETPLACE
    case 'well-known-index':
      return ICON_WELL_KNOWN
    case 'local-dir':
      return ICON_FOLDER
    default:
      return ICON_STORE
  }
}

export function getStoreIconFromSource(source: { type: string; icon?: string }): string {
  if (source.icon) return source.icon
  return getDefaultStoreIcon(source.type)
}

export type IconRenderType = 'svg' | 'url' | 'data-uri' | 'local-path' | 'provider-icon' | 'store-icon'

export function isProviderIcon(name: string): boolean {
  return AVAILABLE_ICONS.includes(name)
}

export function isStoreIconKey(name: string): boolean {
  if (!name.startsWith('store:')) return false
  const key = name.slice(6)
  return key in STORE_ICONS || key in STORE_TYPE_DEFAULT_ICONS
}

export function resolveStoreIcon(name: string): string | undefined {
  if (!name.startsWith('store:')) return undefined
  const key = name.slice(6)
  return STORE_ICONS[key] || STORE_TYPE_DEFAULT_ICONS[key]
}

export function getIconRenderType(icon?: string): IconRenderType {
  if (!icon) return 'svg'
  if (icon.startsWith('<svg')) return 'svg'
  if (icon.startsWith('data:')) return 'data-uri'
  if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/')) return 'url'
  if (isStoreIconKey(icon)) return 'store-icon'
  if (isProviderIcon(icon)) return 'provider-icon'
  return 'local-path'
}

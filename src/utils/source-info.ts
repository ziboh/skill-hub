import type { Skill } from '../types'
import {
  STORE_ICONS,
  ICON_FOLDER,
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  getStoreIconFromSource,
} from '../data/store-icons'
import { storage } from './storage'

export interface SourceInfo {
  label: string
  icon: string
  color: string
  bg: string
}

export function getSourceInfo(skill: Skill): SourceInfo {
  if (skill.storeSourceId) {
    if (skill.storeSourceId === 'skills-sh') {
      return { label: 'skills.sh', icon: STORE_ICONS['skills-sh'], color: '#16a34a', bg: '#dcfce7' }
    }
    if (skill.storeSourceId === 'claude') {
      return { label: 'Claude Code', icon: STORE_ICONS.claude, color: '#c2785c', bg: '#fef3c7' }
    }
    if (skill.storeSourceId === 'codex') {
      return { label: 'Codex', icon: STORE_ICONS.codex, color: '#2563eb', bg: '#dbeafe' }
    }
    if (skill.storeSourceId.startsWith('agent:')) {
      return { label: '本地', icon: ICON_FOLDER, color: '#8b5cf6', bg: '#ede9fe' }
    }
    const customStore = storage.getStoreSources().find((s) => s.id === skill.storeSourceId)
    if (customStore) {
      return { label: customStore.name, icon: getStoreIconFromSource(customStore), color: '#16a34a', bg: '#dcfce7' }
    }
    return { label: '商店', icon: STORE_ICONS['skills-sh'], color: '#16a34a', bg: '#dcfce7' }
  }
  if (skill.source === 'skills-sh') {
    return { label: 'skills.sh', icon: STORE_ICONS['skills-sh'], color: '#16a34a', bg: '#dcfce7' }
  }
  if (skill.source === 'marketplace-json') {
    return { label: 'Marketplace', icon: ICON_MARKETPLACE, color: '#8b5cf6', bg: '#ede9fe' }
  }
  if (skill.source === 'well-known-index') {
    return { label: 'Well-Known', icon: ICON_WELL_KNOWN, color: '#0ea5e9', bg: '#e0f2fe' }
  }
  if (skill.repo) {
    if (skill.repo === 'anthropics/skills') {
      return { label: 'Claude Code', icon: STORE_ICONS.claude, color: '#c2785c', bg: '#fef3c7' }
    }
    if (skill.repo === 'openai/skills') {
      return { label: 'Codex', icon: STORE_ICONS.codex, color: '#2563eb', bg: '#dbeafe' }
    }
    return { label: 'GitHub', icon: ICON_GITHUB, color: '#6b7280', bg: '#f3f4f6' }
  }
  if (skill.source === 'local') {
    return { label: '本地', icon: ICON_FOLDER, color: '#8b5cf6', bg: '#ede9fe' }
  }
  return { label: '本地', icon: ICON_FOLDER, color: '#8b5cf6', bg: '#ede9fe' }
}

import type { MySkillsSortMode, Skill } from '../types'

export const MY_SKILLS_SORT_OPTIONS: { value: MySkillsSortMode; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'name-asc', label: '名称 A→Z' },
  { value: 'name-desc', label: '名称 Z→A' },
  { value: 'recent-desc', label: '最近下载' },
  { value: 'recent-asc', label: '最早下载' },
]

function compareName(a: Skill, b: Skill): number {
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
}

function timeMs(s: Skill): number {
  if (!s.downloadedAt) return Number.NaN
  const t = Date.parse(s.downloadedAt)
  return Number.isFinite(t) ? t : Number.NaN
}

export function sortSkills(list: Skill[], mode: MySkillsSortMode): Skill[] {
  if (mode === 'default' || !list.length) return list

  const sorted = list.slice()
  if (mode === 'name-asc') {
    sorted.sort(compareName)
    return sorted
  }
  if (mode === 'name-desc') {
    sorted.sort((a, b) => compareName(b, a))
    return sorted
  }

  const desc = mode === 'recent-desc'
  sorted.sort((a, b) => {
    const ta = timeMs(a)
    const tb = timeMs(b)
    const aMissing = Number.isNaN(ta)
    const bMissing = Number.isNaN(tb)
    if (aMissing && bMissing) return compareName(a, b)
    if (aMissing) return 1
    if (bMissing) return -1
    const diff = desc ? tb - ta : ta - tb
    return diff !== 0 ? diff : compareName(a, b)
  })
  return sorted
}

export function getSortLabel(mode: MySkillsSortMode): string {
  return MY_SKILLS_SORT_OPTIONS.find((o) => o.value === mode)?.label || '默认'
}

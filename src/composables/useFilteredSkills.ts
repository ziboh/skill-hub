import { computed } from 'vue'
import type { MySkillsSortMode, Skill } from '../types'
import { SKILL_CATEGORIES, ALL_CATEGORIES, inferCategory, CATEGORY_ICONS, type SkillCategory } from '../data/skill-categories'
import { sortSkills } from '../utils/skill-sort'

export { SKILL_CATEGORIES, CATEGORY_ICONS, type SkillCategory }

export function filterSkillsBySource(skills: Skill[], source: string, getSourceLabel: (skill: Skill) => string): Skill[] {
  return source ? skills.filter((skill) => getSourceLabel(skill) === source) : skills
}

function matchCategoryFromTag(tag: string): SkillCategory | null {
  const t = tag.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (ALL_CATEGORIES.includes(lower as SkillCategory)) return lower as SkillCategory
  for (const cat of ALL_CATEGORIES) {
    const meta = SKILL_CATEGORIES[cat]
    if (meta.label === t || meta.labelEn.toLowerCase() === lower) return cat
  }
  return null
}

function getSkillCategory(skill: Skill): SkillCategory {
  if (skill.userTags?.[0]) {
    const fromUser = matchCategoryFromTag(skill.userTags[0])
    if (fromUser) return fromUser
  }
  for (const tag of skill.tags || []) {
    const fromTag = matchCategoryFromTag(tag)
    if (fromTag) return fromTag
  }
  return inferCategory(skill.name, skill.description || '')
}

export function useFilteredSkills(opts: {
  downloadedSkills: () => Skill[]
  filterSource: () => string
  filterCategory: () => string
  filterTag: () => string
  distributedSkillIds: () => Set<string>
  getSourceLabel: (skill: Skill) => string
  sortMode?: () => MySkillsSortMode
}) {
  function applyBaseFilters(list: Skill[]) {
    list = filterSkillsBySource(list, opts.filterSource(), opts.getSourceLabel)
    switch (opts.filterCategory()) {
      case 'favorites':
        list = list.filter((s) => s.isFavorited)
        break
      case 'distributed':
        list = list.filter((s) => opts.distributedSkillIds().has(s.id))
        break
      case 'pending':
        list = list.filter((s) => !opts.distributedSkillIds().has(s.id))
        break
    }
    return list
  }

  const baseFilteredSkills = computed(() => applyBaseFilters(opts.downloadedSkills()))

  const filteredSkills = computed(() => {
    let list = baseFilteredSkills.value
    if (opts.filterTag()) list = list.filter((s) => getSkillCategory(s) === opts.filterTag())
    const mode = opts.sortMode?.() || 'default'
    return sortSkills(list, mode)
  })

  const filteredBaseCount = computed(() => baseFilteredSkills.value.length)

  const allUserTags = computed(() => {
    const counts = new Map<SkillCategory, number>()
    for (const s of baseFilteredSkills.value) {
      const cat = getSkillCategory(s)
      counts.set(cat, (counts.get(cat) || 0) + 1)
    }
    return ALL_CATEGORIES.map((cat) => ({
      id: cat,
      label: SKILL_CATEGORIES[cat].label,
      icon: CATEGORY_ICONS[cat],
      count: counts.get(cat) || 0,
    }))
  })

  return {
    filteredSkills,
    filteredBaseCount,
    allUserTags,
    getSkillCategory,
  }
}

import { computed } from 'vue'
import type { Skill } from '../types'
import { SKILL_CATEGORIES, ALL_CATEGORIES, inferCategory, CATEGORY_ICONS, type SkillCategory } from '../data/skill-categories'

export { SKILL_CATEGORIES, CATEGORY_ICONS, type SkillCategory }

function getSkillCategory(skill: Skill): SkillCategory {
  return (skill.userTags?.[0] as SkillCategory) || inferCategory(skill.name, skill.description || '')
}

export function useFilteredSkills(opts: {
  downloadedSkills: () => Skill[]
  filterSource: () => string
  filterCategory: () => string
  filterTag: () => string
  distributedSkillIds: () => Set<string>
  getSourceLabel: (skill: Skill) => string
}) {
  function applyBaseFilters(list: Skill[]) {
    if (opts.filterSource()) list = list.filter((s) => opts.getSourceLabel(s) === opts.filterSource())
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
    return list
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

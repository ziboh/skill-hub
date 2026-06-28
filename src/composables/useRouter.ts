import { ref, computed } from 'vue'
import type { Skill, SkillScanResult } from '../types'

export type RouteName = 'my' | 'store' | 'detail' | 'agent-skills' | 'agent-skill-detail' | 'project-skills' | 'sources' | 'settings' | 'records'

export type DetailContext = 'my' | 'store' | 'project' | 'agent'

export interface NavigateParams {
  sub?: string
  skill?: Skill | SkillScanResult
  platformId?: string
  context?: DetailContext
  anchor?: string
  duplicateSkills?: SkillScanResult[]
}

export function useRouter() {
  const route = ref<RouteName>('my')
  const subRoute = ref('')
  const selectedSkill = ref<Skill | null>(null)
  const detailContext = ref<DetailContext>('my')
  const selectedAgentSkill = ref<SkillScanResult | null>(null)
  const selectedAgentPlatformId = ref('')
  const selectedDuplicateSkills = ref<SkillScanResult[] | null>(null)
  const settingsAnchor = ref('')
  const storeSubId = ref('claude')

  const activeRoute = computed(() => {
    if (route.value === 'sources') return 'store' as RouteName
    if (route.value === 'detail') {
      if (detailContext.value === 'store') return 'store' as RouteName
      if (detailContext.value === 'project') return 'project-skills' as RouteName
      if (detailContext.value === 'agent') return 'agent-skills' as RouteName
      return 'my' as RouteName
    }
    if (route.value === 'agent-skill-detail') {
      if (detailContext.value === 'project') return 'project-skills' as RouteName
      return 'agent-skills' as RouteName
    }
    return route.value
  })

  const isSettings = computed(() => route.value === 'settings')
  const isFullHeight = computed(() => (['settings', 'detail', 'agent-skill-detail'] as RouteName[]).includes(route.value))
  const isMySkills = computed(() => route.value === 'my')

  function navigate(code: RouteName, params?: NavigateParams) {
    route.value = code
    settingsAnchor.value = ''
    if (params) {
      subRoute.value = params.sub || ''
      if (params.skill && 'id' in params.skill) selectedSkill.value = params.skill
      if (params.sub) storeSubId.value = params.sub
      if ('platformId' in params) selectedAgentPlatformId.value = params.platformId || ''
      if (params.context) detailContext.value = params.context
      if (params.anchor) settingsAnchor.value = params.anchor
      if (code === 'agent-skill-detail' && params.skill) {
        selectedAgentSkill.value = params.skill as SkillScanResult
      }
      if (params.duplicateSkills) {
        selectedDuplicateSkills.value = params.duplicateSkills
      } else {
        selectedDuplicateSkills.value = null
      }
    }
  }

  return {
    route,
    subRoute,
    selectedSkill,
    detailContext,
    selectedAgentSkill,
    selectedAgentPlatformId,
    selectedDuplicateSkills,
    settingsAnchor,
    storeSubId,
    activeRoute,
    isSettings,
    isFullHeight,
    isMySkills,
    navigate,
  }
}

import type { InjectionKey, Ref } from 'vue'
import type { RegisteredProject, SkillScanResult, PlatformInfo } from './types'
import type { RouteName } from './composables/useRouter'

export const KeyShowToast: InjectionKey<(msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void> = Symbol('showToast')
export const KeyRefreshCounts: InjectionKey<() => void> = Symbol('refreshCounts')
export const KeyRefreshMySkills: InjectionKey<() => void> = Symbol('refreshMySkills')
export const KeyOpenImportModal: InjectionKey<() => void> = Symbol('openImportModal')
export const KeyCurrentRoute: InjectionKey<Ref<RouteName>> = Symbol('currentRoute')
export const KeyRefreshKey: InjectionKey<Ref<number>> = Symbol('refreshKey')
export const KeyTriggerRefresh: InjectionKey<() => void> = Symbol('triggerRefresh')
export const KeyFilterCategory: InjectionKey<Ref<string>> = Symbol('filterCategory')
export const KeyFilterSource: InjectionKey<Ref<string>> = Symbol('filterSource')

export const KeySelectedProject: InjectionKey<Ref<RegisteredProject | null>> = Symbol('selectedProject')
export const KeySelectedProjectSkill: InjectionKey<Ref<SkillScanResult | null>> = Symbol('selectedProjectSkill')
export const KeySelectProjectSkill: InjectionKey<(skill: SkillScanResult) => void> = Symbol('selectProjectSkill')
export const KeySelectProject: InjectionKey<(project: RegisteredProject) => void> = Symbol('selectProject')
export const KeyRegisteredProjects: InjectionKey<Ref<RegisteredProject[]>> = Symbol('registeredProjects')
export const KeyOpenAddProjectModal: InjectionKey<() => void> = Symbol('openAddProjectModal')
export const KeyNavigateToProjectSkills: InjectionKey<() => void> = Symbol('navigateToProjectSkills')
export const KeyScanProject: InjectionKey<(project: RegisteredProject) => void> = Symbol('scanProject')
export const KeyProjectScanning: InjectionKey<Ref<boolean>> = Symbol('projectScanning')

export const KeyDetectedPlatforms: InjectionKey<Ref<PlatformInfo[]>> = Symbol('detectedPlatforms')
export const KeyPlatformSkillCounts: InjectionKey<Ref<Record<string, number>>> = Symbol('platformSkillCounts')
export const KeyAgentSkills: InjectionKey<Ref<Record<string, SkillScanResult[]>>> = Symbol('agentSkills')
export const KeyUpdateAgentPlatformSkills: InjectionKey<(platformId: string, skills: SkillScanResult[]) => void> = Symbol('updateAgentPlatformSkills')

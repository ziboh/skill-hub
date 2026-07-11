import { describe, test, expect } from 'vitest'
import { useRouter } from '../useRouter'

describe('useRouter', () => {
  test('defaults route to my', () => {
    const { route } = useRouter()
    expect(route.value).toBe('my')
  })

  test('isMySkills is true when route is my', () => {
    const { isMySkills, route } = useRouter()
    expect(isMySkills.value).toBe(true)
    route.value = 'store'
    expect(isMySkills.value).toBe(false)
  })

  test('isSettings is true when route is settings', () => {
    const { isSettings, navigate } = useRouter()
    expect(isSettings.value).toBe(false)
    navigate('settings')
    expect(isSettings.value).toBe(true)
  })

  test('isFullHeight includes settings and detail routes', () => {
    const { isFullHeight, navigate } = useRouter()
    expect(isFullHeight.value).toBe(false)
    navigate('settings')
    expect(isFullHeight.value).toBe(true)
    navigate('detail')
    expect(isFullHeight.value).toBe(true)
  })

  test('navigate sets route and clears settings anchor', () => {
    const { route, settingsAnchor, navigate } = useRouter()
    navigate('store')
    expect(route.value).toBe('store')
    expect(settingsAnchor.value).toBe('')
  })

  test('navigate sets subRoute from params', () => {
    const { subRoute, navigate } = useRouter()
    navigate('store', { sub: 'test-sub' })
    expect(subRoute.value).toBe('test-sub')
  })

  test('navigate sets storeSubId from sub param', () => {
    const { storeSubId, navigate } = useRouter()
    navigate('store', { sub: 'claude' })
    expect(storeSubId.value).toBe('claude')
  })

  test('navigate sets settings anchor', () => {
    const { settingsAnchor, navigate } = useRouter()
    navigate('settings', { anchor: 'general' })
    expect(settingsAnchor.value).toBe('general')
  })

  test('navigate sets detailContext', () => {
    const { detailContext, navigate } = useRouter()
    navigate('detail', { context: 'store' })
    expect(detailContext.value).toBe('store')
  })

  test('activeRoute returns store for sources route', () => {
    const { activeRoute, navigate } = useRouter()
    navigate('sources')
    expect(activeRoute.value).toBe('store')
  })

  test('activeRoute remaps detail based on context', () => {
    const { activeRoute, navigate } = useRouter()
    navigate('detail', { context: 'store' })
    expect(activeRoute.value).toBe('store')
    navigate('detail', { context: 'my' })
    expect(activeRoute.value).toBe('my')
    navigate('detail', { context: 'project' })
    expect(activeRoute.value).toBe('project-skills')
    navigate('detail', { context: 'agent' })
    expect(activeRoute.value).toBe('agent-skills')
  })

  test('activeRoute returns agent-skills for agent-skill-detail', () => {
    const { activeRoute, navigate } = useRouter()
    navigate('agent-skill-detail')
    expect(activeRoute.value).toBe('agent-skills')
  })

  test('navigate sets selectedAgentSkill for agent-skill-detail', () => {
    const { selectedAgentSkill, navigate } = useRouter()
    const skill = { dir: '/test', name: 'test-skill', manifest: { name: 'Test' } }
    navigate('agent-skill-detail', { skill })
    expect(selectedAgentSkill.value).toBeTruthy()
  })

  test('navigate sets duplicateSkills', () => {
    const { selectedDuplicateSkills, navigate } = useRouter()
    const duplicates = [
      { dir: '/a', name: 'a' },
      { dir: '/b', name: 'b' },
    ]
    navigate('detail', { duplicateSkills: duplicates as any })
    expect(selectedDuplicateSkills.value).toHaveLength(2)
  })

  test('navigate sets duplicateSkills to null when explicitly omitted in params', () => {
    const { selectedDuplicateSkills, navigate } = useRouter()
    navigate('detail', { duplicateSkills: [] as any })
    expect(selectedDuplicateSkills.value).toEqual([])
    navigate('detail', { duplicateSkills: undefined as any })
    expect(selectedDuplicateSkills.value).toBeNull()
  })
})

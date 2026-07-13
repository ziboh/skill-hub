export type SkillLifecycleHookName = 'beforeInstall' | 'afterInstall' | 'beforeUninstall' | 'afterUninstall'

export type LifecycleOperation = 'install' | 'uninstall'
export type LifecyclePhase = 'before' | 'after'

export interface SkillLifecycleResult {
  ok: boolean
  operation: LifecycleOperation
  skillId: string
  platformId: string
  targetPath: string
  error?: string
  rollbackError?: string
  warnings?: string[]
}

export interface SkillLifecycleContext {
  operation: LifecycleOperation
  phase: LifecyclePhase
  skillId: string
  skillName: string
  platformId: string
  targetPath: string
  sourceDir?: string
  mode?: 'copy' | 'symlink'
  scope?: 'global' | 'project'
  result?: SkillLifecycleResult
}

export type SkillLifecycleHook = (context: SkillLifecycleContext) => void

const hooks = new Map<SkillLifecycleHookName, SkillLifecycleHook[]>([
  ['beforeInstall', []],
  ['afterInstall', []],
  ['beforeUninstall', []],
  ['afterUninstall', []],
])

export function registerSkillLifecycleHook(name: SkillLifecycleHookName, hook: SkillLifecycleHook): () => void {
  const registered = hooks.get(name)
  if (!registered) throw new Error(`未知的生命周期钩子：${name}`)
  registered.push(hook)
  return () => {
    const index = registered.indexOf(hook)
    if (index >= 0) registered.splice(index, 1)
  }
}

export function runSkillLifecycleHooks(name: SkillLifecycleHookName, context: SkillLifecycleContext, stopOnError = false): string[] {
  const registered = hooks.get(name) || []
  const errors: string[] = []
  for (const hook of [...registered]) {
    try {
      hook(context)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      if (stopOnError) break
    }
  }
  return errors
}

/** Test-only reset helper; production callers should use the unregister function returned by registerSkillLifecycleHook. */
export function clearSkillLifecycleHooks(): void {
  for (const registered of hooks.values()) registered.splice(0, registered.length)
}

export function formatSkillLifecycleWarnings(operation: LifecycleOperation, warnings?: string[]): string {
  if (!warnings?.length) return ''
  const label = operation === 'install' ? '安装' : '卸载'
  return `${label}已完成，但生命周期钩子有警告：${warnings.join('；')}`
}

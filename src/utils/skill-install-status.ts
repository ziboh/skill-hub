import { storage } from './storage'
import { safeRemovePath } from './fs-ops'
import { skillMatchesInstalled, type ScanSkillLike } from './skill-identity'
import { runSkillLifecycleHooks, type SkillLifecycleContext, type SkillLifecycleResult } from './skill-lifecycle'

export type { ScanSkillLike }

export interface UninstallPathOptions {
  targetPath: string
  skillId: string
  skillName?: string
  platformId: string
  scope?: 'global' | 'project'
}

export interface UninstallPathResult {
  ok: boolean
  error?: string
  warnings?: string[]
}

/** @deprecated prefer skillMatchesInstalled from skill-identity */
export function skillMatchesFolder(skill: ScanSkillLike, skillFolder: string, skillName: string): boolean {
  return skillMatchesInstalled(skill, skillFolder, skillName)
}

export function findPhysicallyInstalledPlatforms(opts: {
  platforms: { id: string; basePath: string }[]
  skillFolder: string
  skillName: string
}): Set<string> {
  const result = new Set<string>()
  for (const p of opts.platforms) {
    if (!p.basePath) continue
    if (!window.services.pathExists(p.basePath)) continue
    try {
      const existing = window.services.scanForSkillFiles([p.basePath])
      if (existing.some((s) => skillMatchesFolder(s, opts.skillFolder, opts.skillName))) {
        result.add(p.id)
      }
    } catch (e) {
      console.warn('[skill-install-status] scan failed for', p.basePath, e)
    }
  }
  return result
}

function toLifecycleResult(opts: UninstallPathOptions, result: UninstallPathResult): SkillLifecycleResult {
  return {
    ok: result.ok,
    operation: 'uninstall',
    skillId: opts.skillId,
    platformId: opts.platformId,
    targetPath: opts.targetPath,
    error: result.error,
    warnings: result.warnings,
  }
}

function recordUninstallFailure(opts: UninstallPathOptions, error: string, details?: string): void {
  storage.addFailureRecord({
    type: 'distribution',
    skillId: opts.skillId,
    skillName: opts.skillName || opts.skillId,
    error,
    details,
  })
}

function finalizeUninstall(opts: UninstallPathOptions, result: UninstallPathResult): UninstallPathResult {
  const context: SkillLifecycleContext = {
    operation: 'uninstall',
    phase: 'after',
    skillId: opts.skillId,
    skillName: opts.skillName || opts.skillId,
    platformId: opts.platformId,
    targetPath: opts.targetPath,
    scope: opts.scope,
    result: toLifecycleResult(opts, result),
  }
  const warnings = runSkillLifecycleHooks('afterUninstall', context)
  if (!warnings.length) return result

  result.warnings = [...(result.warnings || []), ...warnings]
  recordUninstallFailure(opts, '卸载后生命周期钩子执行失败', warnings.join('；'))
  return result
}

function failUninstall(opts: UninstallPathOptions, error: string, details?: string): UninstallPathResult {
  recordUninstallFailure(opts, error, details)
  return finalizeUninstall(opts, { ok: false, error })
}

export function uninstallPathAndRecord(opts: UninstallPathOptions): UninstallPathResult {
  const beforeErrors = runSkillLifecycleHooks(
    'beforeUninstall',
    {
      operation: 'uninstall',
      phase: 'before',
      skillId: opts.skillId,
      skillName: opts.skillName || opts.skillId,
      platformId: opts.platformId,
      targetPath: opts.targetPath,
      scope: opts.scope,
    },
    true,
  )
  if (beforeErrors.length) {
    return failUninstall(opts, `卸载前生命周期钩子失败：${beforeErrors.join('；')}`, '卸载前钩子阻止了删除')
  }

  try {
    const special = window.services.uninstallPlatformSkill?.({
      platformId: opts.platformId,
      targetDir: opts.targetPath,
    })
    if (!special?.handled && opts.targetPath) {
      const rm = safeRemovePath(opts.targetPath)
      if (!rm.ok) {
        return failUninstall(opts, rm.error || '请检查文件权限')
      }
    }
    storage.removeDistributeRecord(opts.skillId, opts.platformId, opts.scope)
    return finalizeUninstall(opts, { ok: true })
  } catch (e) {
    return failUninstall(opts, e instanceof Error ? e.message : String(e))
  }
}

export function toastUninstallError(error?: string): string {
  return `卸载失败: ${error || '请检查文件权限'}`
}

export function toastSourceMissing(skillName: string): string {
  return `「${skillName}」的源文件不存在，无法分发`
}

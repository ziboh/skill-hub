import { detectPlatforms, getPlatformPath } from '../data/platforms'
import { storage } from './storage'
import { normalizePath } from './path'
import { getSkillsRepoDir } from './skill-path'
import { runSkillLifecycleHooks, type SkillLifecycleContext, type SkillLifecycleResult } from './skill-lifecycle'
import type { Skill, InstallMode, PlatformInfo, DistributeRecord } from '../types'

export type DeployScope = 'global' | 'project'

export interface DeployTargetOptions {
  skill: Skill
  sourceDir: string
  targetDir: string
  platformId: string
  mode: InstallMode
  scope: DeployScope
  /** When true, verify SKILL.md exists after install (project path). Default false. */
  verifySkillMd?: boolean
  /** Skip if distribute record already exists for same skill+platformId+scope */
  skipIfRecorded?: boolean
}

export interface DeployTargetResult {
  ok: boolean
  skipped?: boolean
  targetDir: string
  platformId: string
  message: string
  error?: string
  warnings?: string[]
}

/** Platforms that are detected, enabled, and have a path (configs already merged in detectPlatforms). */
export function getDeployPlatforms(): PlatformInfo[] {
  return detectPlatforms().filter(
    (p) => p.detected && p.enabled !== false && (p.defaultPath || p.customPath || p.projectPath || p.customProjectPath),
  )
}

/** Folder name under platform/project skills dir. */
export function getSkillFolderName(skill: Pick<Skill, 'name' | 'path'>): string {
  if (skill.path && skill.path !== '.') {
    const p = normalizePath(skill.path)
    // Absolute path = local source dir → use skill name as folder
    if (/^[a-zA-Z]:\//.test(p) || p.startsWith('/')) {
      return skill.name
    }
    // Relative path = repo path (e.g. skills/foo) → last segment
    return p.split('/').pop() || skill.name
  }
  return skill.name
}

/** Prefer skills-repo copy; fall back to skill.path if present on disk. */
export function resolveSkillSourceDir(skill: Skill): string | null {
  try {
    const repoDir = getSkillsRepoDir(skill.id)
    if (window.services.pathExists(repoDir)) return repoDir
  } catch {
    // invalid skill id
  }
  const localPath = skill.path
  if (localPath && localPath !== '.' && window.services.pathExists(localPath)) return localPath
  return null
}

export function hasSkillMd(dir: string): boolean {
  if (!dir || !window.services.pathExists(dir)) return false
  const files = window.services.readDir(dir)
  return files.some((f) => f.name === 'SKILL.md' || f.name === 'skill.md')
}

function toLifecycleResult(result: DeployTargetResult, skillId: string): SkillLifecycleResult {
  return {
    ok: result.ok,
    operation: 'install',
    skillId,
    platformId: result.platformId,
    targetPath: result.targetDir,
    error: result.error,
    warnings: result.warnings,
  }
}

function recordDeployFailure(skill: Skill, error: string, details?: string): void {
  storage.addFailureRecord({
    type: 'distribution',
    skillId: skill.id,
    skillName: skill.name,
    error,
    details,
  })
}

function finalizeInstall(opts: DeployTargetOptions, result: DeployTargetResult): DeployTargetResult {
  const context: SkillLifecycleContext = {
    operation: 'install',
    phase: 'after',
    skillId: opts.skill.id,
    skillName: opts.skill.name,
    platformId: opts.platformId,
    targetPath: result.targetDir,
    sourceDir: opts.sourceDir,
    mode: opts.mode,
    scope: opts.scope,
    result: toLifecycleResult(result, opts.skill.id),
  }
  const warnings = runSkillLifecycleHooks('afterInstall', context)
  if (!warnings.length) return result

  result.warnings = [...(result.warnings || []), ...warnings]
  result.message = `${result.message}（生命周期钩子警告：${warnings.join('；')}）`
  recordDeployFailure(opts.skill, '安装后生命周期钩子执行失败', warnings.join('；'))
  return result
}

function failInstall(opts: DeployTargetOptions, targetDir: string, error: string, details?: string): DeployTargetResult {
  recordDeployFailure(opts.skill, error, details)
  return finalizeInstall(opts, {
    ok: false,
    targetDir,
    platformId: opts.platformId,
    message: error,
    error,
  })
}

export function getGlobalPlatformBase(platform: PlatformInfo): string {
  return getPlatformPath(platform, 'global') || getPlatformPath(platform, 'project') || ''
}

export function makeProjectPlatformKey(projectId: string, agentPath: string): string {
  return `project:${projectId}/${agentPath}`
}

export function getProjectTargetDir(projectRoot: string, agentPath: string, skillFolder: string): string {
  return window.services.pathJoin(projectRoot, agentPath, skillFolder)
}

/**
 * Install skill into targetDir (symlink or copy) and save distribute record.
 * Single source of truth for global + project + batch deploy.
 */
export function deploySkillToTarget(opts: DeployTargetOptions): DeployTargetResult {
  const { skill, sourceDir, targetDir, platformId, mode, scope } = opts
  let installedTargetDir = targetDir

  if (opts.skipIfRecorded) {
    const exists = storage.getDistributeRecords().some((r) => r.skillId === skill.id && r.platformId === platformId && r.scope === scope)
    if (exists) {
      return { ok: true, skipped: true, targetDir, platformId, message: '已存在，跳过' }
    }
  }

  if (!sourceDir || !window.services.pathExists(sourceDir)) {
    const error = '源文件不存在'
    return failInstall(opts, targetDir, error)
  }

  if (!hasSkillMd(sourceDir)) {
    const error = '源目录中未找到 SKILL.md'
    return failInstall(opts, targetDir, error)
  }

  const beforeErrors = runSkillLifecycleHooks(
    'beforeInstall',
    {
      operation: 'install',
      phase: 'before',
      skillId: skill.id,
      skillName: skill.name,
      platformId,
      targetPath: targetDir,
      sourceDir,
      mode,
      scope,
    },
    true,
  )
  if (beforeErrors.length) {
    return failInstall(opts, targetDir, `安装前生命周期钩子失败：${beforeErrors.join('；')}`, '安装前钩子阻止了分发')
  }

  try {
    const platformResult = window.services.deployPlatformSkill?.({
      platformId,
      sourceDir,
      targetDir,
      mode,
      skillName: skill.name,
    })
    if (platformResult?.handled) {
      installedTargetDir = platformResult.targetDir || targetDir
    } else {
      // Do not mkdir(targetDir): empty dest blocks Windows rename and causes EIO.
      // copyFile / createSymlink already create the parent directory.
      if (mode === 'symlink') {
        window.services.createSymlink(sourceDir, targetDir)
      } else {
        window.services.copyFile(sourceDir, targetDir)
      }
    }

    if (opts.verifySkillMd && !hasSkillMd(installedTargetDir)) {
      const error = `目标目录为空，拷贝未生效 → ${installedTargetDir}`
      return failInstall(opts, installedTargetDir, error, `分发到 ${platformId} 失败`)
    }

    const record: DistributeRecord = {
      skillId: skill.id,
      platformId,
      mode,
      scope,
      targetPath: installedTargetDir,
      sourceDir,
      distributedAt: new Date().toISOString(),
    }
    storage.saveDistributeRecord(record)

    const message = mode === 'symlink' ? '已链接' : '已复制'
    return finalizeInstall(opts, { ok: true, targetDir: installedTargetDir, platformId, message })
  } catch (err) {
    const error = err instanceof Error ? err.message : '未知错误'
    return failInstall(opts, installedTargetDir, error, `分发到 ${platformId} 失败`)
  }
}

/** Deploy one skill to one global platform. */
export function deploySkillToGlobalPlatform(
  skill: Skill,
  platform: PlatformInfo,
  mode: InstallMode,
  sourceDir?: string | null,
): DeployTargetResult {
  const src = sourceDir ?? resolveSkillSourceDir(skill)
  const base = getGlobalPlatformBase(platform)
  if (!base) {
    return {
      ok: false,
      targetDir: '',
      platformId: platform.id,
      message: '未配置路径',
      error: '未配置路径',
    }
  }
  if (!src) {
    const error = '源文件不存在'
    storage.addFailureRecord({ type: 'distribution', skillId: skill.id, skillName: skill.name, error })
    return { ok: false, targetDir: '', platformId: platform.id, message: error, error }
  }
  const skillFolder = getSkillFolderName(skill)
  const targetDir = window.services.pathJoin(base, skillFolder)
  return deploySkillToTarget({
    skill,
    sourceDir: src,
    targetDir,
    platformId: platform.id,
    mode,
    scope: 'global',
  })
}

/** Deploy one skill into project agent path. */
export function deploySkillToProjectPath(
  skill: Skill,
  project: { id: string; rootDir: string; name?: string },
  agentPath: string,
  mode: InstallMode,
  opts?: { sourceDir?: string | null; skipIfRecorded?: boolean; verifySkillMd?: boolean },
): DeployTargetResult {
  const src = opts?.sourceDir ?? resolveSkillSourceDir(skill)
  if (!src) {
    const error = '源文件不存在'
    storage.addFailureRecord({ type: 'distribution', skillId: skill.id, skillName: skill.name, error })
    return {
      ok: false,
      targetDir: '',
      platformId: makeProjectPlatformKey(project.id, agentPath),
      message: error,
      error,
    }
  }
  const skillFolder = getSkillFolderName(skill)
  const targetDir = getProjectTargetDir(project.rootDir, agentPath, skillFolder)
  return deploySkillToTarget({
    skill,
    sourceDir: src,
    targetDir,
    platformId: makeProjectPlatformKey(project.id, agentPath),
    mode,
    scope: 'project',
    skipIfRecorded: opts?.skipIfRecorded,
    verifySkillMd: opts?.verifySkillMd ?? true,
  })
}

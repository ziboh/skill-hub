import { detectPlatforms, getPlatformPath } from '../data/platforms'
import { storage } from './storage'
import { normalizePath } from './path'
import { getSkillsRepoDir } from './skill-path'
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
}

/** Platforms that are detected and have a path, merged with saved configs. */
export function getDeployPlatforms(): PlatformInfo[] {
  const saved = storage.getPlatformConfigs()
  return detectPlatforms()
    .filter((p) => p.detected && (p.defaultPath || p.projectPath))
    .map((p) => {
      const cfg = saved.find((s) => s.id === p.id)
      return cfg ? { ...p, customPath: cfg.customPath, customProjectPath: cfg.customProjectPath } : p
    })
}

/** Folder name under platform/project skills dir. */
export function getSkillFolderName(skill: Pick<Skill, 'name' | 'path'>): string {
  if (skill.path && skill.path !== '.') {
    return normalizePath(skill.path).split('/').pop() || skill.name
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

  if (opts.skipIfRecorded) {
    const exists = storage.getDistributeRecords().some((r) => r.skillId === skill.id && r.platformId === platformId && r.scope === scope)
    if (exists) {
      return { ok: true, skipped: true, targetDir, platformId, message: '已存在，跳过' }
    }
  }

  if (!sourceDir || !window.services.pathExists(sourceDir)) {
    const error = '源文件不存在'
    storage.addFailureRecord({
      type: 'distribution',
      skillId: skill.id,
      skillName: skill.name,
      error,
    })
    return { ok: false, targetDir, platformId, message: error, error }
  }

  if (!hasSkillMd(sourceDir)) {
    const error = '源目录中未找到 SKILL.md'
    storage.addFailureRecord({
      type: 'distribution',
      skillId: skill.id,
      skillName: skill.name,
      error,
    })
    return { ok: false, targetDir, platformId, message: error, error }
  }

  try {
    window.services.mkdir(targetDir)
    if (mode === 'symlink') {
      window.services.createSymlink(sourceDir, targetDir)
    } else {
      window.services.copyFile(sourceDir, targetDir)
    }

    if (opts.verifySkillMd && !hasSkillMd(targetDir)) {
      const error = `目标目录为空，拷贝未生效 → ${targetDir}`
      storage.addFailureRecord({
        type: 'distribution',
        skillId: skill.id,
        skillName: skill.name,
        error,
        details: `分发到 ${platformId} 失败`,
      })
      return { ok: false, targetDir, platformId, message: error, error }
    }

    const record: DistributeRecord = {
      skillId: skill.id,
      platformId,
      mode,
      scope,
      targetPath: targetDir,
      sourceDir,
      distributedAt: new Date().toISOString(),
    }
    storage.saveDistributeRecord(record)

    const message = mode === 'symlink' ? '已链接' : '已复制'
    return { ok: true, targetDir, platformId, message }
  } catch (err) {
    const error = err instanceof Error ? err.message : '未知错误'
    storage.addFailureRecord({
      type: 'distribution',
      skillId: skill.id,
      skillName: skill.name,
      error,
      details: `分发到 ${platformId} 失败`,
    })
    return { ok: false, targetDir, platformId, message: error, error }
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

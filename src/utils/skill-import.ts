import type { Skill, SkillScanResult, SkillSource } from '../types'
import { storage } from './storage'
import { getSkillsRepoDir } from './skill-path'

export interface FinalizeImportedSkillOptions {
  skill: Skill
  targetDir: string
  sourceType: SkillSource
  /** Original source location (local dir / agent dir / github location string) */
  location: string
  sessionSource?: string
  storeSourceId?: string
  forceStoreSourceId?: boolean
}

export interface ImportScanResultToMySkillsOptions {
  skill: SkillScanResult
  /** Session download record source label */
  sessionSource: 'agent' | 'project'
  /** Override source dir; defaults to skill.dir */
  location?: string
  storeSourceId?: string
}

/**
 * Copy a scanned local skill (agent/project) into skills-repo and register as my skill.
 * Agent and project share the same pipeline: sourceType is always 'local'.
 */
export function importScanResultToMySkills(opts: ImportScanResultToMySkillsOptions): Skill {
  const { skill, sessionSource } = opts
  const id = skill.manifest?.name || skill.name
  if (!id) throw new Error('skill id is required')

  const sourceDir = opts.location || skill.dir || ''
  if (!sourceDir) throw new Error('skill source directory is required')

  const targetDir = getSkillsRepoDir(id)
  window.services.copyFile(sourceDir, targetDir)

  const manifest = skill.manifest || { name: id, description: '', author: '', tags: [], language: 'en' }
  const draft: Skill = {
    id,
    name: manifest.name || skill.name || id,
    description: manifest.description || '',
    author: manifest.author || '',
    tags: manifest.tags || [],
    source: 'local',
    path: skill.dir || sourceDir,
  }
  if (opts.storeSourceId !== undefined) draft.storeSourceId = opts.storeSourceId

  return finalizeImportedSkill({
    skill: draft,
    targetDir,
    sourceType: 'local',
    location: sourceDir,
    sessionSource,
    storeSourceId: opts.storeSourceId,
  })
}

/**
 * After files are copied into skills-repo, re-parse SKILL.md, keep source path,
 * and persist to downloaded skills list.
 *
 * skill.path semantics:
 * - GitHub/store: relative path in repo (e.g. skills/foo) — do not overwrite
 * - Local/Agent/Project: original source directory on disk
 */
export function finalizeImportedSkill(opts: FinalizeImportedSkillOptions): Skill {
  const { skill, targetDir, location } = opts
  const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(targetDir, f)))

  let tags = skill.tags || []
  if (skillFile) {
    const parsed = window.services.parseSkillFile(window.services.pathJoin(targetDir, skillFile))
    if (parsed?.manifest) {
      if (parsed.manifest.name) skill.name = parsed.manifest.name
      if (parsed.manifest.description) skill.description = parsed.manifest.description
      if (parsed.manifest.author) skill.author = parsed.manifest.author
      if (Array.isArray(parsed.manifest.tags) && parsed.manifest.tags.length) {
        tags = parsed.manifest.tags
      }
      skill.tags = tags
    }
  }

  if (skill.repo && skill.name) {
    skill.canonicalId = `${skill.repo}/${skill.name}`
  }

  // path = source path, never skills-repo targetDir
  // - relative (repo path): keep as-is
  // - absolute missing: use location if absolute, else keep existing
  if (!skill.path || skill.path === '.') {
    if (location && (isAbsolutePath(location) || !skill.repo)) {
      skill.path = location
    }
  } else if (isAbsolutePath(skill.path) && isSkillsRepoPath(skill.path, targetDir)) {
    // fix accidental skills-repo path from older versions
    skill.path = isAbsolutePath(location) ? location : skill.name
  }

  if (opts.storeSourceId !== undefined) skill.storeSourceId = opts.storeSourceId
  delete (skill as any).readme

  storage.saveDownloadedSkills([{ ...skill }], { forceStoreSourceId: opts.forceStoreSourceId })
  storage.addDownloadedId(skill.id)
  storage.addSessionDownload(skill.id, skill.name, opts.sessionSource || opts.sourceType)
  return skill
}

function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')
}

function isSkillsRepoPath(path: string, targetDir: string): boolean {
  const n = path.replace(/\\/g, '/').toLowerCase()
  const t = targetDir.replace(/\\/g, '/').toLowerCase()
  return n === t || n.includes('/skills-repo/')
}

export function resolveImportSourceType(source?: SkillSource): SkillSource {
  if (!source) return 'local'
  if (source === 'skills-sh') return 'skills-sh'
  if (source === 'marketplace-json') return 'marketplace-json'
  if (source === 'well-known-index') return 'well-known-index'
  if (source === 'gitee') return 'gitee'
  if (source === 'git-repo' || source === 'github') return 'github'
  if (source === 'local-dir') return 'local'
  return 'local'
}

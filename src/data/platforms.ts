import type { PlatformInfo } from '../types'
import { storage } from '../utils/storage'

type OsKey = 'darwin' | 'win32' | 'linux'

function joinPath(base: string, relative: string): string {
  if (!relative.trim()) return base
  const sep = base.includes('\\') ? '\\' : '/'
  const normBase = base.replace(/[\\/]+$/, '').replace(/[\\/]/g, sep)
  const normRel = relative
    .trim()
    .split(/[\\/]+/)
    .filter(Boolean)
    .join(sep)
  return normRel ? `${normBase}${sep}${normRel}` : normBase
}

function getOsKey(): OsKey {
  const svc = typeof window !== 'undefined' ? window.services : null
  if (svc?.isWindows()) return 'win32'
  if (typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')) return 'darwin'
  return 'linux'
}

function resolveRootDir(platform: { rootDir?: { darwin: string; win32: string; linux: string } }): string {
  if (!platform.rootDir) return ''
  return platform.rootDir[getOsKey()] || platform.rootDir.linux
}

function _resolveSkillsPath(platform: { rootDir?: { darwin: string; win32: string; linux: string }; skillsRelativePath?: string }): string {
  const root = resolveRootDir(platform)
  if (!root || !platform.skillsRelativePath) return ''
  return joinPath(root, platform.skillsRelativePath)
}

export const defaultPlatforms: PlatformInfo[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    rootDir: { darwin: '~/.claude', win32: '~/.claude', linux: '~/.claude' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.claude/skills/',
    projectPath: '.claude/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    rootDir: { darwin: '~/.copilot', win32: '~/.copilot', linux: '~/.copilot' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.copilot/skills/',
    projectPath: '.copilot/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    rootDir: { darwin: '~/.cursor', win32: '~/.cursor', linux: '~/.cursor' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.cursor/skills/',
    projectPath: '.cursor/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    rootDir: {
      darwin: '~/Library/Application Support/CherryStudio',
      win32: '~/AppData/Roaming/CherryStudio',
      linux: '~/.config/CherryStudio',
    },
    skillsRelativePath: 'Data/Skills',
    defaultPath: '~/.config/CherryStudio/Data/Skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    rootDir: { darwin: '~/.codeium/windsurf', win32: '~/.codeium/windsurf', linux: '~/.codeium/windsurf' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.codeium/windsurf/skills/',
    projectPath: '.codeium/windsurf/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'kiro',
    name: 'Kiro',
    rootDir: { darwin: '~/.kiro', win32: '~/.kiro', linux: '~/.kiro' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.kiro/skills/',
    projectPath: '.kiro/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    rootDir: { darwin: '~/.gemini', win32: '~/.gemini', linux: '~/.gemini' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.gemini/skills/',
    projectPath: '.gemini/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    rootDir: { darwin: '~/.gemini/antigravity', win32: '~/.gemini/antigravity', linux: '~/.gemini/antigravity' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.gemini/antigravity/skills/',
    projectPath: '.gemini/antigravity/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'trae',
    name: 'Trae',
    rootDir: { darwin: '~/.trae', win32: '~/.trae', linux: '~/.trae' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.trae/skills/',
    projectPath: '.trae/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'trae-cn',
    name: 'Trae CN',
    rootDir: { darwin: '~/.trae-cn', win32: '~/.trae-cn', linux: '~/.trae-cn' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.trae-cn/skills/',
    projectPath: '.trae-cn/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    rootDir: { darwin: '~/.config/opencode', win32: '~/.config/opencode', linux: '~/.config/opencode' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.config/opencode/skills/',
    projectPath: '.opencode/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'mimo',
    name: 'MiMo Code',
    rootDir: { darwin: '~/.config/mimocode', win32: '~/.config/mimocode', linux: '~/.config/mimocode' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.config/mimocode/skills/',
    projectPath: '.mimocode/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'cline',
    name: 'Cline',
    rootDir: { darwin: '~/.cline', win32: '~/.cline', linux: '~/.cline' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.cline/skills/',
    projectPath: '.cline/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    rootDir: { darwin: '~/.codex', win32: '~/.codex', linux: '~/.codex' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.codex/skills/',
    projectPath: '.codex/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'kilo',
    name: 'Kilo Code',
    rootDir: { darwin: '~/.kilo', win32: '~/.kilo', linux: '~/.kilo' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.kilo/skills/',
    projectPath: '.kilo/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    rootDir: { darwin: '~/.openclaw', win32: '~/.openclaw', linux: '~/.openclaw' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.openclaw/skills/',
    projectPath: '.openclaw/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'qoder',
    name: 'Qoder',
    rootDir: { darwin: '~/.qoder', win32: '~/.qoder', linux: '~/.qoder' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.qoder/skills/',
    projectPath: '.qoder/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    rootDir: { darwin: '~/.hermes', win32: '~/.hermes', linux: '~/.hermes' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.hermes/skills/',
    projectPath: '.hermes/skills/',
    enabled: true,
    detected: false,
  },
  {
    id: 'codebuddy',
    name: 'CodeBuddy',
    rootDir: { darwin: '~/.codebuddy', win32: '~/.codebuddy', linux: '~/.codebuddy' },
    skillsRelativePath: 'skills',
    defaultPath: '~/.codebuddy/skills/',
    projectPath: '.codebuddy/skills/',
    enabled: true,
    detected: false,
  },
]

const builtinIdSet = new Set(defaultPlatforms.map((p) => p.id))

export function isBuiltinPlatformId(id: string): boolean {
  return builtinIdSet.has(id)
}

/** Merge saved config onto a platform definition (enabled / paths / icon / name for custom). */
export function mergePlatformConfig(base: PlatformInfo, cfg?: PlatformInfo | null): PlatformInfo {
  if (!cfg) return { ...base }
  return {
    ...base,
    customPath: cfg.customPath ?? base.customPath,
    customProjectPath: cfg.customProjectPath ?? base.customProjectPath,
    enabled: cfg.enabled !== undefined ? cfg.enabled : base.enabled,
    icon: cfg.icon !== undefined ? cfg.icon : base.icon,
    // Custom platforms store full definition in config
    name: base.isCustom || cfg.isCustom ? cfg.name || base.name : base.name,
    defaultPath: base.isCustom || cfg.isCustom ? cfg.defaultPath || base.defaultPath : base.defaultPath,
    projectPath: base.isCustom || cfg.isCustom ? cfg.projectPath ?? base.projectPath : base.projectPath,
    isCustom: base.isCustom || cfg.isCustom,
  }
}

/**
 * Builtin defaults + user custom platforms from storage, with saved overrides applied.
 * Does not run path detection (detected stays as on definition / false).
 */
export function getAllPlatformDefinitions(): PlatformInfo[] {
  let saved: PlatformInfo[] = []
  try {
    saved = storage.getPlatformConfigs() || []
  } catch {
    saved = []
  }
  const savedById = new Map(saved.map((c) => [c.id, c]))
  const builtins = defaultPlatforms.map((p) => mergePlatformConfig(p, savedById.get(p.id)))
  const customs = saved
    .filter((c) => c.isCustom || !builtinIdSet.has(c.id))
    .filter((c) => !builtinIdSet.has(c.id))
    .map((c) =>
      mergePlatformConfig(
        {
          id: c.id,
          name: c.name || c.id,
          defaultPath: c.defaultPath || '',
          projectPath: c.projectPath,
          customPath: c.customPath,
          customProjectPath: c.customProjectPath,
          enabled: c.enabled !== false,
          detected: false,
          isCustom: true,
          icon: c.icon,
        },
        c,
      ),
    )
  return [...builtins, ...customs]
}

function detectOne(p: PlatformInfo, svc: NonNullable<typeof window.services>): boolean {
  if (p.rootDir) {
    const rootExpanded = resolveRootDir(p).replace(/^~/, svc.homeDir())
    return svc.pathExists(rootExpanded)
  }
  const checkPath = p.customPath || p.defaultPath || p.projectPath || ''
  if (!checkPath) return false
  return svc.pathExists(checkPath.replace(/^~/, svc.homeDir()))
}

export function detectPlatforms(): PlatformInfo[] {
  const defs = getAllPlatformDefinitions()
  const svc = typeof window !== 'undefined' ? window.services : null
  if (!svc) return defs.map((p) => ({ ...p, detected: false }))
  return defs.map((p) => ({ ...p, detected: detectOne(p, svc) }))
}

export function getPlatformPath(platform: PlatformInfo, mode: 'global' | 'project' = 'global'): string {
  const svc = typeof window !== 'undefined' ? window.services : null
  // Prefer explicit customPath for global even when rootDir exists
  if (mode === 'global' && platform.customPath) {
    return platform.customPath.replace(/^~/, svc ? svc.homeDir() : '~')
  }
  if (mode === 'global' && platform.rootDir && platform.skillsRelativePath) {
    const root = resolveRootDir(platform).replace(/^~/, svc ? svc.homeDir() : '~')
    return joinPath(root, platform.skillsRelativePath)
  }
  const base = mode === 'global' ? platform.customPath || platform.defaultPath : platform.customProjectPath || platform.projectPath
  return base ? base.replace(/^~/, svc ? svc.homeDir() : '~') : ''
}

/** Icon key for ProviderIcon: custom icon field, else platform id (registry resolves bare id → platforms:*). */
export function platformDisplayIcon(platform: Pick<PlatformInfo, 'id' | 'icon'>): string {
  if (platform.icon) return platform.icon
  // 非内置平台 ID 都是用户自定义的，不保证存在于图标注册表中。
  // 这里也覆盖 custom- 前缀加入前创建的历史自定义平台。
  if (!isBuiltinPlatformId(platform.id)) return '_generic'
  return platform.id
}

export function getDefaultPlatformOrder(): string[] {
  return getAllPlatformDefinitions().map((p) => p.id)
}

/** id → name map including custom platforms. */
export function getPlatformNameMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of getAllPlatformDefinitions()) map[p.id] = p.name
  return map
}

export function findPlatformById(id: string): PlatformInfo | undefined {
  return getAllPlatformDefinitions().find((p) => p.id === id)
}

export function createCustomPlatformId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'platform'
  const rand = Math.random().toString(36).slice(2, 8)
  let id = `custom-${slug}-${rand}`
  const existing = new Set(getAllPlatformDefinitions().map((p) => p.id))
  while (existing.has(id)) {
    id = `custom-${slug}-${Math.random().toString(36).slice(2, 8)}`
  }
  return id
}

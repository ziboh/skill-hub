export type SkillSource = 'builtin' | 'github' | 'skills-sh' | 'local' | 'marketplace-json' | 'well-known-index' | 'git-repo' | 'local-dir'
export type StoreSourceType = 'marketplace-json' | 'well-known-index' | 'git-repo' | 'local-dir'
export type InstallMode = 'symlink' | 'copy'

export interface Skill {
  id: string
  name: string
  description: string
  shortDescription?: string
  author: string
  tags: string[]
  source: SkillSource
  sourceUrl?: string
  repo?: string
  path?: string
  homepage?: string
  readme?: string
  category?: string
  installCount?: number
  iconUrl?: string
  userTags?: string[]
  storeSourceId?: string
  canonicalId?: string
  branch?: string
  installUrl?: string
}

export interface SkillSourceLocation {
  type: SkillSource
  location: string
  platformId?: string
  projectId?: string
  installedAt: string
}

export interface SkillIdentity {
  canonicalId: string
  name: string
  description: string
  author: string
  tags: string[]
  sources: SkillSourceLocation[]
  primarySource?: SkillSourceLocation
  createdAt: string
  updatedAt: string
}

export interface PlatformInfo {
  id: string
  name: string
  rootDir?: { darwin: string; win32: string; linux: string }
  skillsRelativePath?: string
  defaultPath: string
  projectPath?: string
  rulesPath?: string
  customPath?: string
  customProjectPath?: string
  enabled: boolean
  detected: boolean
  notes?: string
}

export interface InstallRecord {
  skillId: string
  platformId: string
  mode: InstallMode
  scope?: 'global' | 'project'
  targetPath: string
  sourceDir: string
  installedAt: string
  updatedAt?: string
}

export interface StoreSource {
  id: string
  type: SkillSource
  name: string
  url?: string
  branch?: string
  directory?: string
  enabled: boolean
  icon?: string
}

export type ThemeMode = 'light' | 'dark' | 'auto'
export type FontSize = 'small' | 'medium' | 'large'
export type MotionPreference = 'off' | 'reduced' | 'standard'

export interface MorandiTheme {
  id: string
  name: string
  hue: number
  saturation: number
}

export const MORANDI_THEMES: MorandiTheme[] = [
  { id: 'royal-blue', name: '皇家蓝', hue: 220, saturation: 70 },
  { id: 'blue', name: '雾霾蓝', hue: 210, saturation: 35 },
  { id: 'purple', name: '烟熏紫', hue: 260, saturation: 30 },
  { id: 'green', name: '豆沙绿', hue: 150, saturation: 30 },
  { id: 'orange', name: '杏色橙', hue: 25, saturation: 40 },
  { id: 'teal', name: '青碧色', hue: 175, saturation: 30 },
]

export const FONT_SIZES: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
}

export interface AppSettings {
  defaultInstallMode: InstallMode
  githubToken: string
  theme: 'auto' | 'light' | 'dark'
  themeMode: ThemeMode
  themeColor: string
  fontSize: FontSize
  motionPreference: MotionPreference
  compactMode: boolean
  aiModels: ModelConfig[]
  translationModelId: string
  autoTranslate: boolean
  translationTimeout: number
  resumeTranslation: boolean
  showDataManagement: boolean
  translationExtraBody?: Record<string, any>
}

export interface SkillManifest {
  name: string
  description: string
  author: string
  tags: string[]
  language: string
}

// === skills.sh API types ===
export interface V1Skill {
  id: string
  slug: string
  name: string
  source: string
  installs: number
  sourceType: 'github' | 'well-known'
  installUrl: string | null
  url: string
  isDuplicate?: boolean
  // hot view
  installsYesterday?: number
  change?: number
}

export interface SkillDetailFile {
  path: string
  contents: string
}

export interface V1SkillDetail {
  id: string
  source: string
  slug: string
  installs: number
  hash: string | null
  files: SkillDetailFile[] | null
}

export interface AuditEntry {
  provider: string
  slug: string
  status: 'pass' | 'warn' | 'fail'
  summary: string
  auditedAt: string
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  categories?: string[]
}

export interface SkillAuditResult {
  id: string
  source: string
  slug: string
  audits: AuditEntry[]
}

export interface CuratedOwner {
  owner: string
  totalInstalls: number
  featuredRepo: string
  featuredSkill: string
  skills: V1Skill[]
}

export interface CuratedResponse {
  data: CuratedOwner[]
  totalOwners: number
  totalSkills: number
  generatedAt: string
}

export interface PaginationInfo {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface SkillsListResponse {
  data: V1Skill[]
  pagination: PaginationInfo
}

export interface SearchResponse {
  data: V1Skill[]
  query: string
  searchType: 'fuzzy' | 'semantic'
  count: number
  durationMs: number
}

export interface ApiError {
  error: string
  message: string
}

export interface ApiKeyEntry {
  id: string
  key: string
  enabled: boolean
}

export interface ModelConfig {
  id: string
  name: string
  provider: string
  baseUrl: string
  apiPath: string
  apiKeys: ApiKeyEntry[]
  model: string
  isDefault: boolean
  isBuiltin: boolean
  enabled: boolean
  translationModelId?: string
  icon?: string
  models?: Array<{ id: string; name: string; enabled: boolean; owned_by?: string; capabilities?: string[] }>
  extraBody?: Record<string, any>
}

export interface TranslationResult {
  sourceLang: string
  targetLang: string
  sourceContent: string
  translatedContent: string
  sidecarPath?: string
}

export interface RegisteredProject {
  id: string
  name: string
  rootDir: string
  scanPaths: string[]
  skills: SkillScanResult[]
  createdAt: string
}

export interface SkillScanResult {
  name: string
  dir: string
  skillFile: string
  content: string
  isSymlink?: boolean
  manifest: {
    name: string
    description: string
    author: string
    tags: string[]
    language: string
  }
}

export type FailureType = 'translation' | 'download' | 'distribution'

export type ErrorCategory = 'network' | 'auth' | 'api' | 'response' | 'config' | 'unknown'

export interface FailureRecord {
  id: string
  type: FailureType
  skillId: string
  skillName: string
  error: string
  details?: string
  timestamp: number
  metadata?: Record<string, any>
  errorCategory?: ErrorCategory
  model?: string
  provider?: string
  endpoint?: string
  statusCode?: number
  requestId?: string
  duration?: number
}

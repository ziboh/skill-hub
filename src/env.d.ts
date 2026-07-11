/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

interface StatResult {
  exists: boolean
  isDirectory?: boolean
  isFile?: boolean
  isSymlink?: boolean
  size?: number
  mtime?: string
}

interface SkillScanResult {
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

interface Services {
  hashContent: (content: string) => string
  readFile: (file: string) => string | null
  expandPath: (p: string) => string
  homeDir: () => string
  isWindows: () => boolean
  isMacOS: () => boolean
  pathJoin: (...parts: string[]) => string
  /** Join under base; throws if result escapes base (.. / absolute). */
  safeJoin: (base: string, ...parts: string[]) => string
  /** Replace dynamic allowed write roots (projects/platforms). Bootstrap roots always kept. */
  setAllowedWriteRoots: (paths: string[]) => void
  getAllowedWriteRoots: () => string[]
  isPathWritable: (filePath: string) => boolean
  /** Copy sourceDir over targetDir via staging; keeps old target until success. */
  atomicReplaceDir: (sourceDir: string, targetDir: string) => void
  /** Write relative file map under staging then swap into targetDir. */
  atomicWriteDir: (targetDir: string, files: Map<string, string> | Record<string, string> | Iterable<[string, string]>) => void
  pathExists: (p: string) => boolean
  mkdir: (dir: string) => void
  openFolder: (dir: string) => void
  readDir: (dir: string) => DirEntry[]
  readFileText: (filePath: string) => string | null
  writeFile: (filePath: string, content: string) => void
  removeFile: (filePath: string) => void
  removeEmptyAncestors: (filePath: string) => void
  copyFile: (src: string, dest: string) => void
  stat: (p: string) => StatResult

  createSymlink: (target: string, linkPath: string) => string

  downloadFile: (url: string, token?: string) => Promise<any>
  extractBufferZip: (buffer: ArrayBuffer, dest: string) => string

  scanForSkills: (rootDir: string) => SkillScanResult[]
  scanForSkillFiles: (dirs: string[]) => SkillScanResult[]
  parseSkillFile: (filePath: string) => { content: string; manifest: SkillScanResult['manifest'] } | null

  updateSkillFromGitHub: (repo: string, skillPath: string, targetDir: string, token?: string, branch?: string) => Promise<boolean>

  getLatestCommitSha: (repo: string, branch?: string, token?: string) => Promise<string | null>
  getRemoteSkillTree: (repo: string, skillPath: string, branch?: string, token?: string) => Promise<{ path: string; size: number }[] | null>
  saveSkillMeta: (skillDir: string, meta: { commitSha: string | null; checkedAt: string; files: { path: string; size: number }[] }) => void
  loadSkillMeta: (skillDir: string) => { commitSha: string | null; checkedAt: string; files: { path: string; size: number }[] } | null
  buildLocalFileManifest: (skillDir: string) => { path: string; size: number }[]
  checkSkillUpdateFull: (
    repo: string,
    skillPath: string,
    token?: string,
    branch?: string,
    skillId?: string,
  ) => Promise<{ hasUpdate: boolean; changedFiles: string[] } | null>
  saveSkillMetaAfterDownload: (repo: string, branch: string, token: string | undefined, targetDir: string) => Promise<void>

  getStateDir: () => string

  saveIconFile: (sourceFilePath: string) => string
  readFileAsDataUri: (filePath: string) => string | null
}

declare global {
  interface Window {
    services: Services
    ztools: ZToolsApi
  }
}

export {}

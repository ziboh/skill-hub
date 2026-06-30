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
    format: string
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
  pathExists: (p: string) => boolean
  mkdir: (dir: string) => void
  openFolder: (dir: string) => void
  readDir: (dir: string) => DirEntry[]
  readFileText: (filePath: string) => string | null
  writeFile: (filePath: string, content: string) => void
  removeFile: (filePath: string) => void
  copyFile: (src: string, dest: string) => void
  stat: (p: string) => StatResult

  createSymlink: (target: string, linkPath: string) => string

  downloadFile: (url: string, token?: string) => Promise<Buffer>
  fetchGitHubText: (url: string, token?: string) => Promise<string>

  extractBufferZip: (buffer: ArrayBuffer, dest: string) => string

  scanForSkills: (rootDir: string) => SkillScanResult[]
  scanForSkillFiles: (dirs: string[]) => SkillScanResult[]
  parseSkillFile: (filePath: string) => { content: string; manifest: SkillScanResult['manifest'] } | null

  checkSkillUpdate: (repo: string, skillPath: string, token?: string, branch?: string) => Promise<string>
  updateSkillFromGitHub: (repo: string, skillPath: string, targetDir: string, token?: string, branch?: string) => Promise<boolean>

  getStateDir: () => string
}

declare global {
  interface Window {
    services: Services
    ztools: ZToolsApi
  }
}

export {}

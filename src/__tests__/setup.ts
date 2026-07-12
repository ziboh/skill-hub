import { vi } from 'vitest'

const store = new Map<string, string>()

vi.stubGlobal('ztools', {
  dbStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => {
      store.set(key, val)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  },
  getPath: () => '/mock/path',
  showOpenDialog: vi.fn(),
})

if (!window.matchMedia) {
  window.matchMedia = () =>
    ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      media: '',
      onchange: null,
    }) as any
}

vi.stubGlobal('services', {
  hashContent: vi.fn((content: string) => content),
  scanForSkillFiles: vi.fn(() => []),
  pathJoin: vi.fn((...parts: string[]) => parts.join('/')),
  safeJoin: vi.fn((base: string, ...parts: string[]) => {
    const joined = [base, ...parts].filter(Boolean).join('/')
    if (parts.some((p) => String(p).includes('..') || String(p).startsWith('/'))) {
      throw new Error(`Path escapes base directory: "${parts.join('/')}"`)
    }
    return joined
  }),
  atomicReplaceDir: vi.fn(() => {}),
  atomicWriteDir: vi.fn(() => {}),
  setAllowedWriteRoots: vi.fn(() => {}),
  getAllowedWriteRoots: vi.fn(() => ['/mock/path']),
  isPathWritable: vi.fn(() => true),
  readDir: vi.fn(() => []),
  readFile: vi.fn(() => null),
  readFileText: vi.fn(() => ''),
  writeFile: vi.fn(() => {}),
  removeFile: vi.fn(() => {}),
  removeEmptyAncestors: vi.fn(() => {}),
  copyFile: vi.fn(() => {}),
  createSymlink: vi.fn((target: string, linkPath: string) => linkPath),
  pathExists: vi.fn(() => false),
  mkdir: vi.fn(() => {}),
  stat: vi.fn(async () => ({ isDirectory: () => false })),
  expandPath: vi.fn((p: string) => p),
  homeDir: vi.fn(() => '/home/user'),
  isWindows: vi.fn(() => false),
  isMacOS: vi.fn(() => true),
  downloadFile: vi.fn(async () => new ArrayBuffer(0)),
  extractBufferZip: vi.fn(() => '/mock/extract'),
  scanForSkills: vi.fn(() => []),
  parseSkillFile: vi.fn(() => null),
  updateSkillFromGitHub: vi.fn(async () => false),
  getLatestCommitSha: vi.fn(async () => null),
  getRemoteSkillTree: vi.fn(async () => null),
  saveSkillMeta: vi.fn(() => {}),
  loadSkillMeta: vi.fn(() => null),
  buildLocalFileManifest: vi.fn(() => []),
  checkSkillUpdateFull: vi.fn(async () => ({ hasUpdate: false, changedFiles: [] })),
  saveSkillMetaAfterDownload: vi.fn(async () => {}),
  getStateDir: vi.fn(() => '/mock/state'),
  saveIconFile: vi.fn(() => '/mock/icon.png'),
  writeSvgFile: vi.fn(() => '/mock/icon.svg'),
  listIconFiles: vi.fn(() => []),
  readFileAsDataUri: vi.fn(() => null),
  openFolder: vi.fn(() => {}),
})

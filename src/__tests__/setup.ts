import { vi } from 'vitest'

const store = new Map<string, string>()

vi.stubGlobal('ztools', {
  dbStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => { store.set(key, val) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
  },
  getPath: () => '/mock/path',
  showOpenDialog: vi.fn(),
})

if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false, media: '', onchange: null, } as any)
}

vi.stubGlobal('services', {
  scanForSkillFiles: vi.fn(() => []),
  pathJoin: vi.fn((...parts: string[]) => parts.join('/')),
  readDir: vi.fn(() => []),
  readFile: vi.fn(() => null),
  readFileText: vi.fn(() => ''),
  writeFile: vi.fn(() => {}),
  removeFile: vi.fn(() => {}),
  copyFile: vi.fn(() => {}),
  pathExists: vi.fn(() => false),
  mkdir: vi.fn(() => {}),
  stat: vi.fn(async () => ({ isDirectory: () => false })),
  expandPath: vi.fn((p: string) => p),
  homeDir: vi.fn(() => '/home/user'),
  isWindows: vi.fn(() => false),
  isMacOS: vi.fn(() => true),
  downloadFile: vi.fn(async () => {}),
  downloadFileTo: vi.fn(async () => {}),
  fetchGitHubText: vi.fn(async () => null),
  extractBufferZip: vi.fn(async () => []),
  scanForSkills: vi.fn(async () => []),
  parseSkillFile: vi.fn(() => null),
  checkSkillUpdate: vi.fn(() => ({ hasUpdate: false })),
  updateSkillFromGitHub: vi.fn(async () => {}),
  fetchGitHubJSON: vi.fn(async () => ({})),
  getLatestCommitSha: vi.fn(async () => null),
  getRemoteSkillTree: vi.fn(async () => null),
  saveSkillMeta: vi.fn(() => {}),
  loadSkillMeta: vi.fn(() => null),
  buildLocalFileManifest: vi.fn(() => []),
  checkSkillUpdateFull: vi.fn(async () => ({ hasUpdate: false, changedFiles: [] })),
  saveSkillMetaAfterDownload: vi.fn(async () => {}),
  getStateDir: vi.fn(() => '/mock/state'),
})

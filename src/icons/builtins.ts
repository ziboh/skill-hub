import { registerIcon, registerAlias } from './registry'
import {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from './store-default-svgs'
import {
  ICON_OPENAI,
  ICON_GITHUB as SKILL_ICON_GITHUB,
  ICON_GITHUB_ACTIONS,
  ICON_PLAYWRIGHT,
  ICON_HTML5,
  ICON_DOCKER,
  ICON_JUPYTER,
  ICON_LINEAR,
  ICON_NOTION,
  ICON_SENTRY,
  ICON_VERCEL,
  ICON_NETLIFY,
  ICON_CLOUDFLARE,
  ICON_FIGMA,
  ICON_LOCK,
  ICON_SHEETS,
} from './skill-builtin-assets'
import skillsShIcon from '../assets/platforms/skills-sh-favicon.ico'
import claudeIcon from '../assets/platforms/claude.png'
import codexIcon from '../assets/platforms/codex.png'

const providerModules = import.meta.glob<string>('/src/assets/providers/*.svg', {
  query: '?raw',
  import: 'default',
})

const platformSvgModules = import.meta.glob<string>('/src/assets/platforms/*.svg', {
  query: '?raw',
  import: 'default',
})

const platformPngModules = import.meta.glob<string>('/src/assets/platforms/*.{png,ico}', {
  import: 'default',
})

function basename(path: string): string {
  const file = path.split('/').pop() || ''
  return file.replace(/\.(svg|png|ico)$/i, '')
}

async function loadIconModule(loader?: () => Promise<unknown>): Promise<string> {
  if (!loader) return ''
  const mod = await loader()
  return ((mod as { default?: string })?.default ?? mod) as string
}

for (const path of Object.keys(providerModules)) {
  const id = basename(path)
  registerIcon('providers', id, {
    type: 'module-svg',
    load: () => loadIconModule(providerModules[path]),
  })
}

for (const path of Object.keys(platformSvgModules)) {
  const id = basename(path)
  registerIcon('platforms', id, {
    type: 'module-svg',
    load: () => loadIconModule(platformSvgModules[path]),
  })
}

for (const path of Object.keys(platformPngModules)) {
  const id = basename(path)
  registerIcon('platforms', id, {
    type: 'module-url',
    load: () => loadIconModule(platformPngModules[path]),
  })
}

// Explicit store/platform presets (stable ids used by STORE_ICONS)
registerIcon('platforms', 'skills-sh', { type: 'src', src: skillsShIcon })
registerIcon('platforms', 'claude', { type: 'src', src: claudeIcon })
registerIcon('platforms', 'codex', { type: 'src', src: codexIcon })

registerIcon('store', 'skills-sh', { type: 'src', src: skillsShIcon })
registerIcon('store', 'claude', { type: 'src', src: claudeIcon })
registerIcon('store', 'codex', { type: 'src', src: codexIcon })

const storeDefaults: Record<string, string> = {
  'git-repo': ICON_GITHUB,
  github: ICON_GITHUB,
  'marketplace-json': ICON_MARKETPLACE,
  'well-known-index': ICON_WELL_KNOWN,
  'local-dir': ICON_FOLDER,
  store: ICON_STORE,
}

for (const [id, svg] of Object.entries(storeDefaults)) {
  registerIcon('store', id, { type: 'inline-svg', svg })
}

// Aliases match ProviderIcon ICON_ALIAS; namespaces follow actual asset locations
registerAlias('_generic', 'platforms:generic')
registerAlias('siliconcloud', 'providers:silicon')
registerAlias('chatglm', 'providers:zhipu')
registerAlias('kilo', 'platforms:kilo-light')
registerAlias('codebuddy', 'platforms:codebuddy-light')
registerAlias('trae-cn', 'platforms:trae')
registerAlias('skills-sh', 'platforms:skills-sh')

// Skill builtin icons (namespace skill:slug) — lookup still returns data-uri
const skillBuiltinIcons: Record<string, string> = {
  openai: ICON_OPENAI,
  github: SKILL_ICON_GITHUB,
  'github-actions': ICON_GITHUB_ACTIONS,
  playwright: ICON_PLAYWRIGHT,
  html5: ICON_HTML5,
  docker: ICON_DOCKER,
  jupyter: ICON_JUPYTER,
  linear: ICON_LINEAR,
  notion: ICON_NOTION,
  sentry: ICON_SENTRY,
  vercel: ICON_VERCEL,
  netlify: ICON_NETLIFY,
  cloudflare: ICON_CLOUDFLARE,
  figma: ICON_FIGMA,
  lock: ICON_LOCK,
  sheets: ICON_SHEETS,
  // skill slugs used by registries
  spreadsheet: ICON_SHEETS,
  yeet: SKILL_ICON_GITHUB,
  'gh-fix-ci': ICON_GITHUB_ACTIONS,
  'gh-address-comments': SKILL_ICON_GITHUB,
  'develop-web-game': ICON_HTML5,
  screenshot: ICON_OPENAI,
  'docker-compose': ICON_DOCKER,
  imagegen: ICON_OPENAI,
  transcribe: ICON_OPENAI,
  'jupyter-notebook': ICON_JUPYTER,
  'notion-knowledge-capture': ICON_NOTION,
  'vercel-deploy': ICON_VERCEL,
  'netlify-deploy': ICON_NETLIFY,
  'cloudflare-deploy': ICON_CLOUDFLARE,
  'security-best-practices': ICON_LOCK,
  'webapp-testing': SKILL_ICON_GITHUB,
  pptx: ICON_OPENAI,
  pdf: ICON_OPENAI,
  docx: ICON_OPENAI,
  xlsx: ICON_OPENAI,
  'pptx-generator': ICON_OPENAI,
  'mcp-builder': ICON_OPENAI,
  'skill-creator': ICON_OPENAI,
}

for (const [id, src] of Object.entries(skillBuiltinIcons)) {
  registerIcon('skill', id, { type: 'src', src })
}

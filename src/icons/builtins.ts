import { registerIcon, registerAlias } from './registry'
import {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from './store-default-svgs'
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

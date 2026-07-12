# 统一图标系统实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 或本会话内联执行。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 落地可扩展的图标内核（parse → registry → resolve → AppIcon），消灭重复类型探测与页面手写渲染分支，并整理 store/skill 图标数据层。

**架构：** `src/icons/*` 为唯一探测/注册/解析层；`AppIcon` 为唯一渲染入口（`ProviderIcon` re-export）；`store-icons` / `source-info` 先委托再删旧 API；业务页统一 `<AppIcon :icon="..." />`。

**技术栈：** Vue 3、TypeScript（strict: false）、vitest + happy-dom + @vue/test-utils、Vite `import.meta.glob`

**规格：** `docs/superpowers/specs/2026-07-13-icon-system-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| 创建 `src/icons/types.ts` | `IconKind` / `IconValue` / `IconAsset` / `ResolvedIcon` / `ParseRule` |
| 创建 `src/icons/detect.ts` | 解析规则链 + `parseIcon` / `registerParseRule` |
| 创建 `src/icons/registry.ts` | `registerIcon` / `registerAlias` / `getIconAsset` / 裸 key 查找 |
| 创建 `src/icons/resolve.ts` | `resolveIcon` + SVG id 注入 |
| 创建 `src/icons/builtins.ts` | 启动时注册 providers/platforms/store 资源与别名 |
| 创建 `src/icons/index.ts` | 对外导出 |
| 创建 `src/icons/__tests__/detect.test.ts` | parse 规则测试 |
| 创建 `src/icons/__tests__/registry.test.ts` | 注册表/别名测试 |
| 创建 `src/icons/__tests__/resolve.test.ts` | resolve 行为测试 |
| 创建 `src/components/AppIcon.vue` | 唯一渲染组件 |
| 修改 `src/components/ProviderIcon.vue` | re-export AppIcon |
| 修改 `src/components/__tests__/ProviderIcon.test.ts` | 适配 AppIcon 行为（可迁为 AppIcon.test） |
| 修改 `src/data/store-icons.ts` | 委托 `icons/*`，保留兼容导出 |
| 修改 `src/utils/source-info.ts` | `isSvgIcon`/`isImageUrl` 委托 parseIcon |
| 修改页面/组件（见任务 6–7） | 删除手写 v-if 链 |
| 修改 `src/data/skill-icons.ts` | 元数据与图标登记分离（任务 8） |

---

### 任务 1：类型 + parseIcon（TDD）

**文件：**
- 创建：`src/icons/types.ts`
- 创建：`src/icons/detect.ts`
- 创建：`src/icons/__tests__/detect.test.ts`
- 创建：`src/icons/index.ts`（先只 re-export detect/types）

- [x] **步骤 1：写失败测试**

```ts
// src/icons/__tests__/detect.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import { parseIcon, registerParseRule, unregisterParseRule, _resetParseRulesForTest } from '../detect'

describe('parseIcon', () => {
  beforeEach(() => {
    _resetParseRulesForTest()
  })

  test('empty for null/undefined/blank', () => {
    expect(parseIcon(null)).toEqual({ kind: 'empty', value: '' })
    expect(parseIcon(undefined)).toEqual({ kind: 'empty', value: '' })
    expect(parseIcon('   ')).toEqual({ kind: 'empty', value: '' })
  })

  test('inline-svg', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    expect(parseIcon(svg)).toEqual({ kind: 'inline-svg', value: svg })
    expect(parseIcon('  ' + svg)).toEqual({ kind: 'inline-svg', value: svg.trim() })
  })

  test('data-uri and urls as src', () => {
    expect(parseIcon('data:image/png;base64,xx').kind).toBe('src')
    expect(parseIcon('https://a.com/i.png')).toEqual({ kind: 'src', value: 'https://a.com/i.png' })
    expect(parseIcon('http://a.com/i.png').kind).toBe('src')
    expect(parseIcon('/app-icon.png')).toEqual({ kind: 'src', value: '/app-icon.png' })
  })

  test('windows and unc local paths', () => {
    expect(parseIcon('C:\\Users\\a\\icon.png')).toEqual({ kind: 'local', value: 'C:\\Users\\a\\icon.png' })
    expect(parseIcon('D:/icons/a.png').kind).toBe('local')
    expect(parseIcon('\\\\server\\share\\a.png').kind).toBe('local')
  })

  test('bare keys and store: prefix are key', () => {
    expect(parseIcon('openai')).toEqual({ kind: 'key', value: 'openai' })
    expect(parseIcon('store:git-repo')).toEqual({ kind: 'key', value: 'store:git-repo' })
  })

  test('custom parse rule can take priority', () => {
    registerParseRule({
      id: 'emoji',
      order: 50,
      test: (raw) => raw.startsWith('emoji:'),
      parse: (raw) => ({ kind: 'key', value: raw }),
    })
    expect(parseIcon('emoji:star')).toEqual({ kind: 'key', value: 'emoji:star' })
    unregisterParseRule('emoji')
  })
})
```

- [x] **步骤 2：运行测试确认失败**

```bash
pnpm test src/icons/__tests__/detect.test.ts
```

预期：FAIL（模块不存在）

- [x] **步骤 3：实现 types + detect**

```ts
// src/icons/types.ts
export type IconKind = 'key' | 'inline-svg' | 'src' | 'local' | 'empty'

export interface IconValue {
  kind: IconKind
  value: string
}

export type IconAsset =
  | { type: 'module-svg'; load: () => Promise<string> }
  | { type: 'module-url'; load: () => Promise<string> }
  | { type: 'inline-svg'; svg: string }
  | { type: 'src'; src: string }

export type ResolvedIcon =
  | { mode: 'svg'; svg: string }
  | { mode: 'img'; src: string }
  | { mode: 'empty' }

export type ParseRule = {
  id: string
  order: number
  test: (raw: string) => boolean
  parse: (raw: string) => IconValue
}
```

```ts
// src/icons/detect.ts
import type { IconValue, ParseRule } from './types'

const builtinRules: ParseRule[] = [
  {
    id: 'inline-svg',
    order: 100,
    test: (raw) => raw.startsWith('<svg'),
    parse: (raw) => ({ kind: 'inline-svg', value: raw }),
  },
  {
    id: 'data-uri',
    order: 200,
    test: (raw) => raw.startsWith('data:'),
    parse: (raw) => ({ kind: 'src', value: raw }),
  },
  {
    id: 'url',
    order: 300,
    test: (raw) => raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/'),
    parse: (raw) => ({ kind: 'src', value: raw }),
  },
  {
    id: 'local',
    order: 400,
    test: (raw) => /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\'),
    parse: (raw) => ({ kind: 'local', value: raw }),
  },
  {
    id: 'key',
    order: 500,
    test: () => true,
    parse: (raw) => ({ kind: 'key', value: raw }),
  },
]

let customRules: ParseRule[] = []

function allRules(): ParseRule[] {
  return [...customRules, ...builtinRules].sort((a, b) => a.order - b.order)
}

export function registerParseRule(rule: ParseRule): void {
  customRules = customRules.filter((r) => r.id !== rule.id).concat(rule)
}

export function unregisterParseRule(id: string): void {
  customRules = customRules.filter((r) => r.id !== id)
}

/** 仅测试用 */
export function _resetParseRulesForTest(): void {
  customRules = []
}

export function parseIcon(input?: string | null): IconValue {
  if (input == null) return { kind: 'empty', value: '' }
  const raw = input.trim()
  if (!raw) return { kind: 'empty', value: '' }
  for (const rule of allRules()) {
    if (rule.test(raw)) return rule.parse(raw)
  }
  return { kind: 'empty', value: '' }
}
```

```ts
// src/icons/index.ts
export type { IconKind, IconValue, IconAsset, ResolvedIcon, ParseRule } from './types'
export { parseIcon, registerParseRule, unregisterParseRule } from './detect'
```

- [x] **步骤 4：运行测试确认通过**

```bash
pnpm test src/icons/__tests__/detect.test.ts
```

预期：PASS

- [x] **步骤 5：Commit**

```bash
git add src/icons
git commit -m "feat(icons): add parseIcon and parse rule chain"
```

---

### 任务 2：registry（TDD）

**文件：**
- 创建：`src/icons/registry.ts`
- 创建：`src/icons/__tests__/registry.test.ts`
- 修改：`src/icons/index.ts`

- [x] **步骤 1：写失败测试**

```ts
// src/icons/__tests__/registry.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import {
  registerIcon,
  registerAlias,
  getIconAsset,
  resolveIconKey,
  _resetRegistryForTest,
} from '../registry'

describe('registry', () => {
  beforeEach(() => {
    _resetRegistryForTest()
  })

  test('register and get by ns:id', () => {
    registerIcon('providers', 'openai', { type: 'inline-svg', svg: '<svg id="o"/>' })
    expect(getIconAsset('providers:openai')).toEqual({ type: 'inline-svg', svg: '<svg id="o"/>' })
  })

  test('alias expands', () => {
    registerIcon('providers', 'silicon', { type: 'src', src: '/s.svg' })
    registerAlias('siliconcloud', 'providers:silicon')
    expect(resolveIconKey('siliconcloud')).toBe('providers:silicon')
    expect(getIconAsset('siliconcloud')).toEqual({ type: 'src', src: '/s.svg' })
  })

  test('bare key lookup order providers then platforms then store', () => {
    registerIcon('platforms', 'claude', { type: 'src', src: '/c.png' })
    registerIcon('providers', 'claude', { type: 'inline-svg', svg: '<svg/>' })
    expect(resolveIconKey('claude')).toBe('providers:claude')

    _resetRegistryForTest()
    registerIcon('platforms', 'codex', { type: 'src', src: '/x.png' })
    expect(resolveIconKey('codex')).toBe('platforms:codex')
  })

  test('store: prefix maps to store namespace', () => {
    registerIcon('store', 'git-repo', { type: 'inline-svg', svg: '<svg g/>' })
    expect(resolveIconKey('store:git-repo')).toBe('store:git-repo')
    expect(getIconAsset('store:git-repo')?.type).toBe('inline-svg')
  })

  test('unknown key returns undefined', () => {
    expect(getIconAsset('nope')).toBeUndefined()
    expect(resolveIconKey('nope')).toBeUndefined()
  })
})
```

- [x] **步骤 2：运行确认失败**

```bash
pnpm test src/icons/__tests__/registry.test.ts
```

- [x] **步骤 3：实现 registry**

```ts
// src/icons/registry.ts
import type { IconAsset } from './types'

const assets = new Map<string, IconAsset>()
const aliases = new Map<string, string>()

const BARE_LOOKUP_NS = ['providers', 'platforms', 'store'] as const

export function registerIcon(ns: string, id: string, asset: IconAsset): void {
  assets.set(`${ns}:${id}`, asset)
}

export function registerAlias(from: string, to: string): void {
  aliases.set(from, to)
}

export function resolveIconKey(key: string): string | undefined {
  let cur = key
  const seen = new Set<string>()
  while (aliases.has(cur) && !seen.has(cur)) {
    seen.add(cur)
    cur = aliases.get(cur)!
  }
  if (assets.has(cur)) return cur
  if (cur.includes(':')) {
    return assets.has(cur) ? cur : undefined
  }
  for (const ns of BARE_LOOKUP_NS) {
    const full = `${ns}:${cur}`
    if (assets.has(full)) return full
  }
  // store:xxx already full if user passed store:id — handled by includes(':')
  // also accept raw "store:id" form when registered as store:id
  if (key.startsWith('store:')) {
    const full = key // ns:id already
    if (assets.has(full)) return full
  }
  return undefined
}

export function getIconAsset(key: string): IconAsset | undefined {
  const resolved = resolveIconKey(key)
  if (!resolved) return undefined
  return assets.get(resolved)
}

export function _resetRegistryForTest(): void {
  assets.clear()
  aliases.clear()
}
```

注意：`store:git-repo` 的完整 key 就是 `store:git-repo`（ns=`store`, id=`git-repo`），`registerIcon('store', 'git-repo', ...)` 写入 `store:git-repo`。裸 `git-repo` 会在 store 命名空间命中。

- [x] **步骤 4：测试通过 + 导出 index + Commit**

```bash
pnpm test src/icons/__tests__/registry.test.ts
git add src/icons
git commit -m "feat(icons): add icon registry and aliases"
```

---

### 任务 3：resolveIcon（TDD）

**文件：**
- 创建：`src/icons/resolve.ts`
- 创建：`src/icons/__tests__/resolve.test.ts`
- 修改：`src/icons/index.ts`

- [x] **步骤 1：写失败测试**

```ts
// src/icons/__tests__/resolve.test.ts
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { parseIcon } from '../detect'
import { registerIcon, _resetRegistryForTest } from '../registry'
import { resolveIcon, injectSvgIds } from '../resolve'

describe('injectSvgIds', () => {
  test('prefixes ids and url(#) refs', () => {
    const raw = '<svg><defs><linearGradient id="g1"/></defs><rect fill="url(#g1)"/></svg>'
    const out = injectSvgIds(raw)
    expect(out).toMatch(/id="c\d+-g1"/)
    expect(out).toMatch(/url\(#c\d+-g1\)/)
  })
})

describe('resolveIcon', () => {
  beforeEach(() => {
    _resetRegistryForTest()
  })

  test('empty', async () => {
    expect(await resolveIcon(parseIcon(''))).toEqual({ mode: 'empty' })
  })

  test('inline-svg', async () => {
    const r = await resolveIcon(parseIcon('<svg id="a"></svg>'))
    expect(r.mode).toBe('svg')
    if (r.mode === 'svg') expect(r.svg).toMatch(/id="c\d+-a"/)
  })

  test('src', async () => {
    expect(await resolveIcon(parseIcon('https://x/a.png'))).toEqual({
      mode: 'img',
      src: 'https://x/a.png',
    })
  })

  test('key module-svg and inline asset', async () => {
    registerIcon('providers', 'openai', {
      type: 'module-svg',
      load: async () => '<svg id="o"></svg>',
    })
    const r = await resolveIcon(parseIcon('openai'))
    expect(r.mode).toBe('svg')
  })

  test('key module-url', async () => {
    registerIcon('platforms', 'claude', {
      type: 'module-url',
      load: async () => '/assets/claude.png',
    })
    expect(await resolveIcon(parseIcon('claude'))).toEqual({
      mode: 'img',
      src: '/assets/claude.png',
    })
  })

  test('local uses readFileAsDataUri', async () => {
    vi.stubGlobal('window', {
      services: {
        readFileAsDataUri: (p: string) => (p.includes('icon.png') ? 'data:image/png;base64,xx' : ''),
      },
    })
    const r = await resolveIcon(parseIcon('C:\\tmp\\icon.png'))
    expect(r).toEqual({ mode: 'img', src: 'data:image/png;base64,xx' })
    vi.unstubAllGlobals()
  })

  test('unknown key empty', async () => {
    expect(await resolveIcon(parseIcon('no-such-icon'))).toEqual({ mode: 'empty' })
  })
})
```

- [x] **步骤 2：实现 resolve.ts**

```ts
// src/icons/resolve.ts
import type { IconValue, ResolvedIcon } from './types'
import { getIconAsset } from './registry'

let uidCounter = 0

export function injectSvgIds(raw: string): string {
  const uid = `c${++uidCounter}`
  return raw
    .replace(/\sid="([^"]+)"/g, ` id="${uid}-$1"`)
    .replace(/url\(#/g, `url(#${uid}-`)
    .replace(/xlink:href="#/g, `xlink:href="#${uid}-`)
    .replace(/\shref="#/g, ` href="#${uid}-`)
}

export async function resolveIcon(value: IconValue): Promise<ResolvedIcon> {
  if (value.kind === 'empty') return { mode: 'empty' }
  if (value.kind === 'inline-svg') return { mode: 'svg', svg: injectSvgIds(value.value) }
  if (value.kind === 'src') return { mode: 'img', src: value.value }
  if (value.kind === 'local') {
    try {
      const dataUri = (window as any)?.services?.readFileAsDataUri?.(value.value)
      if (dataUri) return { mode: 'img', src: dataUri }
    } catch {
      /* ignore */
    }
    return { mode: 'empty' }
  }
  // key
  const asset = getIconAsset(value.value)
  if (!asset) return { mode: 'empty' }
  try {
    if (asset.type === 'inline-svg') return { mode: 'svg', svg: injectSvgIds(asset.svg) }
    if (asset.type === 'src') return { mode: 'img', src: asset.src }
    if (asset.type === 'module-svg') {
      const svg = await asset.load()
      return svg ? { mode: 'svg', svg: injectSvgIds(svg) } : { mode: 'empty' }
    }
    if (asset.type === 'module-url') {
      const src = await asset.load()
      return src ? { mode: 'img', src } : { mode: 'empty' }
    }
  } catch {
    return { mode: 'empty' }
  }
  return { mode: 'empty' }
}
```

- [x] **步骤 3：测试通过 + Commit**

```bash
pnpm test src/icons/__tests__/resolve.test.ts
git add src/icons
git commit -m "feat(icons): add resolveIcon and svg id injection"
```

---

### 任务 4：builtins 注册内置资源

**文件：**
- 创建：`src/icons/builtins.ts`
- 修改：`src/icons/index.ts`（side-effect import builtins）
- 修改：`src/data/store-icons.ts`（先只抽 SVG 常量供 builtins 使用，避免循环依赖）

- [x] **步骤 1：抽出商店默认 SVG 常量到可被 builtins 导入的位置**

在 `src/icons/store-default-svgs.ts` 放入现 `store-icons.ts` 中的 `ICON_GITHUB`、`ICON_MARKETPLACE`、`ICON_WELL_KNOWN`、`ICON_FOLDER`、`ICON_STORE` 字符串（原样剪切）。

`store-icons.ts` 改为从该文件 re-export，保持现有 import 不破。

- [x] **步骤 2：实现 builtins.ts**

```ts
// src/icons/builtins.ts
import { registerIcon, registerAlias } from './registry'
import {
  ICON_GITHUB,
  ICON_MARKETPLACE,
  ICON_WELL_KNOWN,
  ICON_FOLDER,
  ICON_STORE,
} from './store-default-svgs'

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

for (const path of Object.keys(providerModules)) {
  const id = basename(path)
  registerIcon('providers', id, {
    type: 'module-svg',
    load: async () => {
      const mod = await providerModules[path]!()
      return (mod as any).default ?? mod
    },
  })
}

for (const path of Object.keys(platformSvgModules)) {
  const id = basename(path)
  registerIcon('platforms', id, {
    type: 'module-svg',
    load: async () => {
      const mod = await platformSvgModules[path]!()
      return (mod as any).default ?? mod
    },
  })
}

for (const path of Object.keys(platformPngModules)) {
  const id = basename(path)
  registerIcon('platforms', id, {
    type: 'module-url',
    load: async () => {
      const mod = await platformPngModules[path]!()
      return (mod as any).default ?? mod
    },
  })
}

// store type defaults
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

// 与现 ProviderIcon ICON_ALIAS 一致
registerAlias('_generic', 'providers:generic')
registerAlias('siliconcloud', 'providers:silicon')
registerAlias('chatglm', 'providers:zhipu')
registerAlias('kilo', 'providers:kilo-light')
registerAlias('codebuddy', 'providers:codebuddy-light')
registerAlias('trae-cn', 'platforms:trae')

// 平台 png 也注册为可被 store: 风格使用时：skills-sh / claude / codex 已在 platforms glob
// 额外：store 预设名映射（可选）
registerAlias('skills-sh', 'platforms:skills-sh-favicon') // 若文件名不同，按实际 assets 文件名调整
```

**重要：** 打开 `src/assets/platforms/` 核对真实文件名：

- `skills-sh-favicon.ico` → id 可能是 `skills-sh-favicon`
- `claude.png` → `claude`
- `codex.png` → `codex`

`registerAlias('skills-sh', 'platforms:skills-sh-favicon')` 等按实际 basename 写。若 ico 未进 `*.{png,ico}` glob，确认 Vite 能处理 ico 的 `import: 'default'`（与现 `store-icons` 的 `import skillsShIcon from '...ico'` 一致即可）。

现 `STORE_ICONS` 使用：

```ts
import skillsShIcon from '../assets/platforms/skills-sh-favicon.ico'
import claudeIcon from '../assets/platforms/claude.png'
import codexIcon from '../assets/platforms/codex.png'
```

builtins 中对这三项可**显式** register（比 glob 更稳）：

```ts
import skillsShIcon from '../assets/platforms/skills-sh-favicon.ico'
import claudeIcon from '../assets/platforms/claude.png'
import codexIcon from '../assets/platforms/codex.png'

registerIcon('platforms', 'skills-sh', { type: 'src', src: skillsShIcon })
registerIcon('platforms', 'claude', { type: 'src', src: claudeIcon })
registerIcon('platforms', 'codex', { type: 'src', src: codexIcon })
// 若 glob 已注册 skills-sh-favicon，可保留双 id 或只保留 skills-sh 别名
```

- [x] **步骤 3：index 侧载 builtins**

```ts
// src/icons/index.ts
import './builtins'
export type { IconKind, IconValue, IconAsset, ResolvedIcon, ParseRule } from './types'
export { parseIcon, registerParseRule, unregisterParseRule } from './detect'
export { registerIcon, registerAlias, getIconAsset, resolveIconKey } from './registry'
export { resolveIcon, injectSvgIds } from './resolve'
```

- [x] **步骤 4：手测/单测 — 已知 key 可 resolve**

在 `resolve.test.ts` 增加可选集成测（import `../builtins` 后 `resolveIcon(parseIcon('openai'))` mode 为 svg）。若 vitest 下 glob 慢，可跳过集成测，仅 dev 手测。

- [x] **步骤 5：Commit**

```bash
git add src/icons src/data/store-icons.ts
git commit -m "feat(icons): register builtin provider/platform/store assets"
```

---

### 任务 5：AppIcon 组件 + ProviderIcon re-export

**文件：**
- 创建：`src/components/AppIcon.vue`
- 重写：`src/components/ProviderIcon.vue` → re-export
- 修改：`src/components/__tests__/ProviderIcon.test.ts`（异步 resolve 需 `await flushPromises`）

- [x] **步骤 1：实现 AppIcon.vue**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseIcon, resolveIcon, type IconValue, type ResolvedIcon } from '../icons'

const props = withDefaults(
  defineProps<{
    icon?: string | IconValue
    size?: number
    variant?: 'avatar' | 'mono'
    fallback?: string
  }>(),
  {
    size: 20,
    variant: 'avatar',
    fallback: '⚙',
  },
)

const resolved = ref<ResolvedIcon>({ mode: 'empty' })
let seq = 0

watch(
  () => props.icon,
  async (icon) => {
    const my = ++seq
    const value =
      icon && typeof icon === 'object' && 'kind' in icon
        ? (icon as IconValue)
        : parseIcon(icon as string | undefined)
    const next = await resolveIcon(value)
    if (my === seq) resolved.value = next
  },
  { immediate: true },
)
</script>

<template>
  <!-- avatar -->
  <span
    v-if="variant === 'avatar'"
    class="pi-avatar"
    :style="{ width: size + 'px', height: size + 'px', minWidth: size + 'px' }"
  >
    <span v-if="resolved.mode === 'svg'" v-html="resolved.svg" class="pi-avatar-icon" />
    <img v-else-if="resolved.mode === 'img'" :src="resolved.src" class="pi-avatar-img" />
    <span v-else class="pi-fallback">{{ fallback }}</span>
  </span>
  <!-- mono -->
  <span
    v-else-if="resolved.mode === 'svg'"
    v-html="resolved.svg"
    class="pi-mono"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <img
    v-else-if="resolved.mode === 'img'"
    :src="resolved.src"
    class="pi-mono-img"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span v-else class="pi-fallback-mono">{{ fallback }}</span>
</template>

<style scoped>
/* 从现 ProviderIcon.vue 原样迁移 .pi-avatar / .pi-mono / dark mode 规则 */
/* 注意：store 内联 SVG 不再需要 pi-store-icon 特殊 scale；若视觉回退再加 kind 标记 */
</style>
```

样式：完整复制现 `ProviderIcon.vue` 的 `<style scoped>`（含 dark mode）。`pi-store-icon` 的 `transform: none` 若默认 `scale(1.5)` 导致商店 SVG 过大，可在 resolve 时不处理，改为 avatar 内对「来自 store 的 svg」不加 scale——第一期可对所有 avatar svg 使用 `transform: none` 或 `scale(1)` 若全量视觉可接受；**更稳妥**：保持 `scale(1.5)` 仅对 provider 资产，store 注册的 inline-svg 在 AppIcon 用 class `pi-avatar-icon--raw`。实现时：`ResolvedIcon` 可选加 `meta?: { raw?: boolean }`，store defaults 设 `raw: true`。为减少范围，**第一期**对 avatar svg 统一 `transform: scale(1)` 或 `none`，手测 provider 圆标是否偏小；若偏小再恢复 1.5 并加 raw 标记。

- [x] **步骤 2：ProviderIcon re-export**

```vue
<script lang="ts">
export { default } from './AppIcon.vue'
</script>
```

若 Vite/Vue 对纯 re-export SFC 不友好，改用：

```ts
// ProviderIcon.vue 整文件替换为：
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
// 透传所有 props — 或直接：
</script>
<template>
  <AppIcon v-bind="$attrs" />
</template>
```

最稳：`ProviderIcon.vue` 内容改为与 AppIcon 相同的 wrapper：

```vue
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{
  icon?: string
  size?: number
  variant?: 'avatar' | 'mono'
  fallback?: string
}>()
</script>
<template>
  <AppIcon v-bind="props" />
</template>
```

- [x] **步骤 3：更新测试（异步）**

```ts
import { flushPromises } from '@vue/test-utils'
// ...
test('with known icon renders avatar-icon', async () => {
  const wrapper = mount(ProviderIcon, { props: { icon: 'openai' } })
  await flushPromises()
  expect(wrapper.find('.pi-avatar-icon').exists()).toBe(true)
})
```

所有依赖异步 load 的 case 加 `await flushPromises()`。

- [x] **步骤 4：跑测试**

```bash
pnpm test src/components/__tests__/ProviderIcon.test.ts src/icons
```

- [x] **步骤 5：Commit**

```bash
git commit -m "feat(icons): add AppIcon and re-export ProviderIcon"
```

---

### 任务 6：store-icons / source-info 委托内核

**文件：**
- 修改：`src/data/store-icons.ts`
- 修改：`src/utils/source-info.ts`

- [x] **步骤 1：重写 store-icons 兼容层**

保留导出符号，实现改为：

```ts
import { parseIcon, getIconAsset, resolveIconKey } from '../icons'
import { ICON_GITHUB, ICON_MARKETPLACE, ICON_WELL_KNOWN, ICON_FOLDER, ICON_STORE } from '../icons/store-default-svgs'
// STORE_ICONS：仍导出 Record，值为 asset url 或 key
// 为兼容 source-info 直接当 img src 用，保留 import 的 platforms 图作为值

export { ICON_GITHUB, ICON_MARKETPLACE, ICON_WELL_KNOWN, ICON_FOLDER, ICON_STORE }

export function getDefaultStoreIcon(type: string): string {
  // 推荐返回 key，AppIcon 可解析；但 source-info 仍可能当 SVG 字符串用
  // 兼容策略：继续返回 inline SVG 字符串（与旧行为一致），直到页面迁完
  const map: Record<string, string> = {
    'git-repo': ICON_GITHUB,
    github: ICON_GITHUB,
    'marketplace-json': ICON_MARKETPLACE,
    'well-known-index': ICON_WELL_KNOWN,
    'local-dir': ICON_FOLDER,
  }
  return map[type] || ICON_STORE
}

export function getStoreIconFromSource(source: { type: string; icon?: string }): string {
  if (source.icon) return source.icon
  return getDefaultStoreIcon(source.type)
}

export type IconRenderType = 'svg' | 'url' | 'data-uri' | 'local-path' | 'provider-icon' | 'store-icon'

export function getIconRenderType(icon?: string): IconRenderType {
  const k = parseIcon(icon).kind
  if (k === 'inline-svg' || k === 'empty') return 'svg'
  if (k === 'src') {
    if (icon!.startsWith('data:')) return 'data-uri'
    return 'url'
  }
  if (k === 'local') return 'local-path'
  // key
  if (icon?.startsWith('store:') || resolveIconKey(icon!)?.startsWith('store:')) return 'store-icon'
  if (getIconAsset(icon!) || resolveIconKey(icon!)) return 'provider-icon'
  return 'local-path'
}

export function isProviderIcon(name: string): boolean {
  if (!name || name.includes('/') || name.startsWith('<') || name.startsWith('data:')) return false
  const full = resolveIconKey(name)
  return !!full && (full.startsWith('providers:') || full.startsWith('platforms:'))
}

export function isStoreIconKey(name: string): boolean {
  return !!name?.startsWith('store:') && !!getIconAsset(name)
}

export function resolveStoreIcon(name: string): string | undefined {
  if (!name?.startsWith('store:')) return undefined
  const asset = getIconAsset(name)
  if (!asset) return undefined
  if (asset.type === 'inline-svg') return asset.svg
  if (asset.type === 'src') return asset.src
  return undefined // module 类型异步，兼容层无法同步返回；调用方应改用 AppIcon
}
```

**注意：** `resolveStoreIcon` 对 module 资产无法同步返回——检查调用方（Sources、StoreIconPicker）。迁移页面到 AppIcon 后删除这些调用。

- [x] **步骤 2：source-info 委托**

```ts
import { parseIcon } from '../icons'

export function isSvgIcon(val: string | undefined | null): boolean {
  return parseIcon(val).kind === 'inline-svg'
}

export function isImageUrl(val: string | undefined | null): boolean {
  const p = parseIcon(val)
  // 旧行为：http 或含 /，且非 svg/data/provider/store
  // 简化：kind === 'src' 且不是 data: 时为 true；或兼容旧逻辑
  if (!val) return false
  if (p.kind !== 'src') return false
  return !val.startsWith('data:')
}
```

`getSourceInfo` 返回的 `icon` 字段保持现有字符串（STORE_ICONS url / SVG），调用方改为 AppIcon 后可逐步改为 key。

- [x] **步骤 3：跑现有相关测试**

```bash
pnpm test
```

- [x] **步骤 4：Commit**

```bash
git commit -m "refactor(icons): delegate store-icons and source-info to icons core"
```

---

### 任务 7：页面去掉手写渲染分支

按文件逐个改，每改 1–2 个文件可 commit 一次。

**原则：** 凡 `isSvgIcon` / `isImageUrl` / `getIconRenderType` / 多分支 `v-html`+`img` 渲染 icon 处 → `<AppIcon :icon="..." :size="N" variant="..." />`。

#### 7.1 Sources

**文件：** `src/views/Sources/index.vue`

- [x] 删除对 `getIconRenderType` / `resolveStoreIcon` 的 template 分支（约 301–319 行）
- [x] 列表项图标改为：

```vue
<AppIcon :icon="s.icon || getDefaultStoreIcon(s.type)" :size="18" />
```

注意：`getDefaultStoreIcon` 仍返回 SVG 字符串时 AppIcon 可 parse 为 inline-svg；若改为 key `store:git-repo` 亦可。
- [x] empty 图标可用 `<AppIcon icon="store:store" />` 或保留 v-html ICON_STORE
- [x] local-path 预加载逻辑（`readFileAsDataUri` 缓存）若仅为显示，可删，交给 AppIcon resolve

#### 7.2 MySkills

**文件：** `src/views/MySkills/index.vue`

- [x] source tab / dropdown 中：

```vue
<AppIcon :icon="src.icon" :size="16" />
```

删除 `isProviderIcon` / `isImageUrl` / `isSvgIcon` 分支。

#### 7.3 SkillCard / SkillDetailBase / SkillDetailModal

- [x] avatar 与 source tag 图标统一 AppIcon
- [x] 删除 `isSvgIcon` / `isImageUrl` import（若不再需要）

#### 7.4 StoreFilters / Records

- [x] 同样替换为 AppIcon
- [x] `StoreFilters` 的 `isSvgIcon` prop 可删除，父组件 `useStoreSkills.isSvgIcon` 不再传

#### 7.5 StoreIconPicker

- [x] 预览区统一 `<AppIcon :icon="modelValue || defaultIcon" :size="..." />`
- [x] `currentIconType` 仅用于 tab UI 时可改为 `parseIcon(modelValue).kind`
- [x] 删除同步 `resolveStoreIcon` 预览分支

#### 7.6 useStoreSkills

**文件：** `src/composables/useStoreSkills.ts`

- [x] `getSourceIcon`：返回原始 icon 字符串（key/url/svg），不在此 resolve
- [x] 删除或简化 `isSvgIcon` 导出；SkillStore 不再依赖
- [x] local-path 预读缓存：若仅服务 UI，删除，交给 AppIcon

- [x] **每完成一组页面：**

```bash
pnpm test
# 手测：Sources 列表、MySkills 源筛选、Skill 卡片、商店筛选、设置里图标选择器
git commit -m "refactor(icons): use AppIcon in <页面名>"
```

---

### 任务 8：skill-icons 整理

**文件：**
- 创建：`src/icons/skill-builtin-assets.ts`（搬 base64 常量）
- 修改：`src/data/skill-icons.ts`
- 修改：`src/icons/builtins.ts`（register skill namespace）

- [x] **步骤 1：** 将 `ICON_OPENAI`、`ICON_GITHUB` 等 data-uri 常量移到 `src/icons/skill-builtin-assets.ts` 导出

- [x] **步骤 2：** 在 builtins 或 skill-icons 初始化时：

```ts
import * as skillAssets from './skill-builtin-assets'
// 对每个 slug
registerIcon('skill', 'playwright', { type: 'src', src: skillAssets.ICON_PLAYWRIGHT })
```

或 `lookupBuiltinIcon` 改为返回 `skill:playwright`：

```ts
export function lookupBuiltinIcon(repo: string, slug: string): string | undefined {
  if (repo.includes('openai/skills') && OPENAI_SKILL_REGISTRY[slug]) {
    return `skill:${slug}` // 或仍返回 data-uri 保持兼容
  }
  // ...
}
```

**兼容优先：** 第一期 `lookupBuiltinIcon` **继续返回 data-uri 字符串**（行为零变化），仅把常量文件搬走并 `registerIcon` 方便后续切 key。第二期再改返回 `skill:{slug}`。

- [x] **步骤 3：** Commit

```bash
git commit -m "refactor(icons): extract skill builtin icon assets"
```

---

### 任务 9：清理与验收

- [x] **步骤 1：全局搜索残留**

```bash
# 在仓库根目录
rg "getIconRenderType|detectIconType|isSvgIcon|isImageUrl|isProviderIcon|isStoreIconKey|resolveStoreIcon" src
```

预期：仅 `store-icons` 兼容导出、测试、或注释中出现；**业务 template 无分支**。

- [x] **步骤 2：删除确定无用的兼容函数**（若调用点已清零）

可删：页面侧对 `getIconRenderType` 的使用。保留 `store-icons` 导出一版 deprecated 注释一两个版本。

- [x] **步骤 3：全量测试 + 类型检查**

```bash
pnpm test
pnpm build
```

预期：test 全绿；`vue-tsc` + vite build 成功。

- [x] **步骤 4：手测清单**

| 场景 | 预期 |
|------|------|
| 设置 → AI 模型图标 | provider 圆标正常 |
| 部署弹窗平台列表 | mono 图标正常 |
| Sources 列表 | 默认 SVG / 自定义 URL / 本地文件 / store: 均显示 |
| StoreIconPicker | 库选/上传/URL 预览正常 |
| Skill 卡片来源 tag | 图标不裂 |
| 暗色主题 | 黑填色 SVG 仍可见 |

- [x] **步骤 5：最终 Commit**

```bash
git commit -m "chore(icons): cleanup legacy icon helpers and verify build"
```

---

## 自检（对照规格）

| 规格章节 | 对应任务 |
|----------|----------|
| §4 类型模型 | 任务 1 |
| §5 parse 可扩展 | 任务 1 |
| §6 registry/resolve 可扩展 | 任务 2–3 |
| §6 内置 namespace | 任务 4 |
| §7 AppIcon | 任务 5 |
| §8 数据整理 | 任务 4、6、8 |
| §9 页面迁移 | 任务 7 |
| §10 错误处理 | 任务 3 resolve 分支 |
| §11 测试 | 任务 1–3、5、9 |
| §12 非目标 | 未纳入计划 |

**类型名一致性：** `IconValue` / `IconKind` / `ResolvedIcon` / `IconAsset` / `parseIcon` / `resolveIcon` / `registerIcon` / `registerAlias` / `registerParseRule` 全文统一。

**无占位符：** 各任务含可运行测试代码与实现要点；`skills-sh` 文件名需实现时对照 `src/assets/platforms/` 实际 basename。

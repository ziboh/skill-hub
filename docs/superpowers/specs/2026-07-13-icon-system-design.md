# 统一图标系统（Icon System）设计

日期：2026-07-13  
状态：待用户审查  
范围：解析层 + 渲染组件 + 数据/资源整理（全量理顺）

## 1. 背景与问题

当前图标能力分散、重复、难扩展：

1. **类型探测重复 3 份**：`store-icons.getIconRenderType`、`ProviderIcon.detectIconType`、`source-info.isSvgIcon/isImageUrl`，规则不完全一致（例如 local-path 判定）。
2. **渲染分支散落在页面**：Sources / MySkills / SkillCard / StoreFilters / Records 等手写 `v-if` 链，未统一走 `ProviderIcon`。
3. **数据形态混杂**：注册表 key（`openai`）、`store:` 前缀、内联 SVG 字符串、data URI、URL、本机路径、Vite asset import、`skill-icons` 内超长 base64。
4. **职责纠缠**：`store-icons.ts` 既放资源又放解析；`ProviderIcon` 既 detect 又 load 又 render。

目标：**不是做图标资源管理后台**，而是设计可扩展的代码结构——新格式只挂规则/注册表，业务页面与组件 API 尽量不变。

## 2. 设计目标

- **单一语义模型**：`IconValue` + 唯一 `parseIcon`。
- **单一渲染入口**：`AppIcon`（`ProviderIcon` 兼容 re-export）。
- **可扩展**：解析规则、注册表 namespace、resolver 均可 `register*`。
- **持久化兼容**：存盘的 `icon` 字符串格式不改；读时再 parse。
- **YAGNI**：第一期只覆盖现有格式；不做 CDN、远程图标包、插件运行时。

## 3. 架构总览

```
string (存储/业务)
    │
    ▼
parseIcon  ──►  IconValue
    │              │
    │              ▼
    │         resolveIcon  ──►  ResolvedIcon
    │              │              │
    │              │              ▼
    │              │           AppIcon（只渲染）
    │              │
    └──── registry / aliases / loaders
```

| 模块 | 职责 | 不做什么 |
|------|------|----------|
| `src/icons/types.ts` | `IconValue` / `ResolvedIcon` / `IconAsset` | 无 IO |
| `src/icons/detect.ts` | 解析规则链 + `parseIcon` | 不查 registry、不读盘 |
| `src/icons/registry.ts` | namespace 注册、别名、内置资源登记 | 不渲染 |
| `src/icons/resolve.ts` | `IconValue` → `ResolvedIcon` | 不写业务 UI |
| `src/components/AppIcon.vue` | 渲染 `ResolvedIcon` | 不内联 detect 规则 |
| `src/data/store-icons.ts` 等 | 迁移期 thin re-export | 逐步清空逻辑 |

## 4. 类型模型

```ts
export type IconKind =
  | 'key'          // 注册表键：openai、claude、store:git-repo
  | 'inline-svg'   // 以 <svg 开头的字符串
  | 'src'          // http(s)、data:、以 / 开头的静态 URL
  | 'local'        // 本机路径（用户导入）
  | 'empty'

export interface IconValue {
  kind: IconKind
  /** key: id；src/local: 路径或 URI；inline-svg: 完整 svg 文本 */
  value: string
}

export type IconAsset =
  | { type: 'module-svg'; load: () => Promise<string> }
  | { type: 'module-url'; load: () => Promise<string> }  // png / ico 等
  | { type: 'inline-svg'; svg: string }
  | { type: 'src'; src: string }

export type ResolvedIcon =
  | { mode: 'svg'; svg: string }   // 已做 id 唯一化
  | { mode: 'img'; src: string }
  | { mode: 'empty' }
```

业务层可继续传 `string`；需要结构化时可直接传 `IconValue`。

## 5. 解析层（可扩展）

### 5.1 默认规则顺序（内置）

| 顺序 | 条件 | kind |
|------|------|------|
| 1 | `null` / `undefined` / 仅空白 | `empty` |
| 2 | 以 `<svg` 开头（trim 后） | `inline-svg` |
| 3 | 以 `data:` 开头 | `src` |
| 4 | 以 `http://` / `https://` / `/` 开头 | `src` |
| 5 | Windows 盘符 `^[A-Za-z]:[\\/]` 或 UNC `^\\\\` | `local` |
| 6 | 其余 | `key` |

说明：

- `store:xxx` **不**单独 kind，归入 `key`（namespace 在 resolve/registry 处理）。
- 不在 parse 阶段区分「是否真是 provider」——未知 key 在 resolve 时回落 `empty`。

### 5.2 扩展 API

```ts
type ParseRule = {
  id: string
  /** 数字越小越先匹配；内置规则占用 100–600，自定义建议 10–90 或 700+ */
  order: number
  test: (raw: string) => boolean
  parse: (raw: string) => IconValue
}

registerParseRule(rule: ParseRule): void
unregisterParseRule(id: string): void
parseIcon(input?: string | null): IconValue
```

扩展新格式（如 `emoji:xxx`、`lucide:home`）只需加 `ParseRule` + 对应 resolver，无需改页面。

### 5.3 废弃的重复 API

| 旧 API | 去向 |
|--------|------|
| `getIconRenderType` | → `parseIcon(x).kind` 映射 |
| `ProviderIcon.detectIconType` | 删除 |
| `isSvgIcon` / `isImageUrl` | 实现改为基于 `parseIcon`，迁移后删除 |

## 6. Registry + Resolve（可扩展）

### 6.1 Namespace 约定

| Namespace | 用途 | 示例 key |
|-----------|------|----------|
| `providers` | AI 厂商 SVG（`assets/providers`） | `openai` → `providers:openai` |
| `platforms` | 编辑器/平台图（svg/png） | `claude`、`codex` |
| `store` | 商店源类型默认图标 | `store:git-repo` |
| `skill` | 内置 skill 图标（可选） | `skill:playwright` |

无冒号的裸 key 查找顺序（可配置）：

1. `providers:{id}`
2. `platforms:{id}`
3. `store:{id}`
4. 未命中 → resolve 为 `empty`（或由调用方 fallback）

### 6.2 注册 API

```ts
registerIcon(ns: string, id: string, asset: IconAsset): void
registerAlias(from: string, to: string): void
// 例：registerAlias('siliconcloud', 'providers:silicon')
//     registerAlias('_generic', 'providers:generic')

getIconAsset(key: string): IconAsset | undefined
```

内置初始化：

- `import.meta.glob` 扫描 `assets/providers/*.svg`、`assets/platforms/*.{svg,png,ico}` 写入 registry。
- 商店类型默认 SVG（原 `ICON_GITHUB` 等）注册为 `store:git-repo` 等。
- 现有 `ICON_ALIAS` 迁入 `registerAlias`。
- `skill-icons` 中 base64 逐步登记为 `skill:{slug}` 或 `src` 型 asset；`lookupBuiltinIcon` 返回可被 `parseIcon` 的 string。

### 6.3 resolveIcon

```ts
async function resolveIcon(value: IconValue): Promise<ResolvedIcon>
```

| IconValue.kind | 行为 |
|----------------|------|
| `empty` | `{ mode: 'empty' }` |
| `inline-svg` | inject 唯一 id → `{ mode: 'svg', svg }` |
| `src` | `{ mode: 'img', src: value }` |
| `local` | `window.services.readFileAsDataUri` → img；失败 empty |
| `key` | 别名展开 → registry → 按 `IconAsset.type` 加载 |

`IconAsset` 映射：

- `module-svg` / `inline-svg` → svg 模式（均 inject id）
- `module-url` / `src` → img 模式

### 6.4 扩展新资源类型

1. 扩展 `IconAsset` 联合类型（如 `type: 'sprite'`）。
2. 在 `resolveIcon` 增加对应分支。
3. `registerIcon` 登记资源。

组件与业务 API 不变。

## 7. AppIcon 组件

### 7.1 API

```vue
<AppIcon
  :icon="string | IconValue"
  :size="20"
  variant="avatar | mono"
  :fallback="'⚙'"
/>
```

- `icon` 为 string 时内部 `parseIcon`。
- 内部状态：单一 `resolved: ResolvedIcon`（watch icon 异步 resolve）。
- 模板仅三种分支：`svg`（v-html）/ `img` / `fallback`。
- 样式从现 `ProviderIcon` 迁移：avatar 圆底、mono 继承色、dark mode fill/stroke 修正。

### 7.2 兼容

```ts
// ProviderIcon.vue → re-export AppIcon，避免一次改完全部 import
export { default } from './AppIcon.vue'
```

### 7.3 调用约定

| 场景 | 推荐 |
|------|------|
| Provider / 平台 | `<AppIcon :icon="p.id" variant="mono" />` |
| 商店源 | `:icon="source.icon || storeDefaultKey(type)"` |
| 用户本地导入 | `:icon="savedPath"`（local） |
| Skill 头像 | `:icon="skill.iconUrl"` |
| 内联 SVG 常量 | 优先改为 registry key；过渡期可直接传 SVG 字符串 |

## 8. 数据与文件整理

### 8.1 目标目录

```
src/icons/
  types.ts
  detect.ts
  registry.ts
  resolve.ts
  builtins.ts      # 内置 register 调用（providers/platforms/store）
  index.ts         # 对外导出
src/components/
  AppIcon.vue
  ProviderIcon.vue # re-export
src/data/
  store-icons.ts   # thin re-export / 废弃标记
  skill-icons.ts   # 仅 skill 元数据 + lookup，图标指向 key/src
  ai-providers.ts  # AVAILABLE_ICONS 可改为从 registry 派生或保留列表供 picker
src/assets/
  providers/       # 不变
  platforms/       # 不变
```

### 8.2 skill-icons

- 超长 base64 常量迁出到 `src/icons/assets/skill-builtin.ts`（或按 brand 拆文件），经 `registerIcon('skill', slug, { type: 'src', src })` 登记。
- `OPENAI_SKILL_REGISTRY` 等只保留 `slug / category / author / iconKey`（或 icon string）。
- `lookupBuiltinIcon(repo, slug)` 返回 `skill:{slug}` 或 data-uri 字符串，由 `AppIcon` 统一渲染。

### 8.3 store-icons

迁移后：

- `getDefaultStoreIcon(type)` → 返回 `store:{type}` 或解析后的 string（文档标明推荐返回 key）。
- `getStoreIconFromSource` → `source.icon || getDefaultStoreIcon(type)`。
- `getIconRenderType` / `isProviderIcon` / `isStoreIconKey` / `resolveStoreIcon` → 委托 `icons/*`，随后删除。

### 8.4 StoreIconPicker

- 选中值仍为 string：`providers` key、`store:` key、local path、data-uri。
- 预览统一 `<AppIcon :icon="modelValue" />`。
- `saveIconFile` 仍由 preload 负责；保存路径作为 `local` 存入设置。

## 9. 页面迁移策略

### 9.1 必须删除手写分支的位置

- `views/Sources/index.vue` — `getIconRenderType` 多分支
- `views/MySkills/index.vue` — `isProviderIcon` / `isImageUrl` / `isSvgIcon`
- `components/SkillCard.vue`、`SkillDetailBase.vue`、`SkillDetailModal.vue`
- `components/StoreFilters.vue`
- `views/Records/index.vue`
- `composables/useStoreSkills.ts` 中的 `isSvgIcon` 与 local-path 特判（local 交给 resolve）

### 9.2 迁移顺序

1. 落地 `src/icons/*` + 单测（parse / resolve / registry）。
2. 实现 `AppIcon`，`ProviderIcon` re-export。
3. 改最乱页面：Sources → MySkills → Skill 相关组件。
4. `source-info` / `store-icons` 改为委托，再删旧 API。
5. 整理 `skill-icons` base64 与 registry 登记。
6. 全量搜索确认无残留重复 detect。

### 9.3 兼容原则

- **不改** localStorage / 设置 JSON 中已有 icon 字段含义。
- 允许分 PR；每一 PR 须保持 UI 行为不变（视觉回归以关键路径手测为准）。

## 10. 错误处理

| 情况 | 行为 |
|------|------|
| 空 icon | `empty` → 显示 fallback |
| 未知 key | resolve → `empty` + fallback |
| local 读盘失败 | `empty` + fallback，不抛到 UI |
| registry 模块 load 失败 | `empty` + fallback |
| 非法 SVG 字符串 | 仍按 inline-svg 尝试；渲染失败由浏览器忽略，显示 fallback 可选（第一期不强制 sanitize） |

不在此设计中引入完整 SVG sanitizer（保持与现 `v-html` 行为一致；图标来源均为受信配置/本地用户选择）。

## 11. 测试

| 层级 | 内容 |
|------|------|
| 单测 `parseIcon` | 空、svg、data-uri、http、`/`、Windows 路径、UNC、裸 key、`store:x` |
| 单测 `registerParseRule` | 自定义规则优先匹配 |
| 单测 registry | alias、裸 key 查找顺序、namespace |
| 单测 `resolveIcon` | inline / src / key→svg / key→png / local mock |
| 组件测 `AppIcon` | 各 kind 渲染分支、fallback、size/variant |
| 迁移后 | 删除或改写依赖旧 helper 的测试 mock |

## 12. 非目标

- 图标在线管理 / 用户图标库 UI 大改
- 远程图标 CDN 协议
- 强制把所有 emoji 分类图标（`skill-categories`）纳入同一系统（可后续用 parse rule）
- 修改 ZTools preload 的 `saveIconFile` 契约（仅消费其返回路径）

## 13. 成功标准

1. 全仓库仅一处图标类型探测实现（`parseIcon` 规则链）。
2. 业务 Vue 文件中不再出现 `isSvgIcon` / `isImageUrl` / `getIconRenderType` 的渲染分支。
3. 新增一种图标格式只需：`registerParseRule` 和/或 `IconAsset` + resolve 分支 + `registerIcon`，无需改业务页。
4. 现有 provider / platform / store / 本地导入 / 内联 SVG 行为与迁移前一致。

## 14. 实现备注（供后续 plan）

- 第一期实现完整 `register*` API，但 builtins 在 `builtins.ts` 启动时同步注册即可。
- `AVAILABLE_ICONS`（picker 列表）可继续维护字符串数组，或改为 `listIcons('providers')`；picker 不依赖 resolve。
- SVG id 注入逻辑（现 `injectSvg`）迁入 `resolve.ts` 共享，避免多实例 id 冲突。

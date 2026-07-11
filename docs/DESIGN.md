# Skill Hub 项目设计文档

## 1. 项目概述

**Skill Hub** 是一个 ZTools 插件，为 AI Agent 平台提供统一的 Skill（技能）管理能力。支持从多种来源浏览、下载、管理和分发 Skill 到 19 种 AI Agent 平台。

| 属性 | 值 |
|---|---|
| 名称 | Skill Hub |
| 版本 | 1.1.0 |
| 作者 | zibo |
| 协议 | MIT |
| 宿主 | ZTools 插件平台 |
| 技术栈 | Vue 3 + Vite 6 + TypeScript |
| 包管理 | pnpm |

---

## 2. 核心功能

### 2.1 Skill 商店

- 内置 Claude Code 和 OpenAI Codex 两个官方商店
- 支持 skills.sh 社区排行榜（热门、趋势、搜索）
- 支持自定义商店源（Git 仓库、marketplace JSON、本地目录）
- Skill 详情预览、标签分类、安装量排序

### 2.2 下载与本地管理

- 一键下载 Skill 到本地 `<userData>/skills-repo/<skillId>`
- 收藏管理、分类筛选（全部/收藏/已分发/待分发）
- SKILL.md 前置元数据解析（YAML frontmatter）
- SKILL.md 在线编辑器（CodeMirror 6）

### 2.3 多平台分发

- 检测本机已安装的 AI Agent 平台（自动发现 19 种）
- 支持全局分发和项目级分发
- 分发模式：复制（copy）或符号链接（symlink/junction）
- 批量同步：一次性将多个 Skill 分发到多个平台

### 2.4 项目 Skill 管理

- 注册项目目录，配置扫描路径
- 自动扫描项目中的 SKILL.md 文件
- 项目级 Skill 导入与管理

### 2.5 Agent Skill 浏览

- 按平台查看已安装的 Skill
- 平台切换、技能统计
- Skill 重复检测与去重

### 2.6 AI 翻译

- 批量将英文 SKILL.md 翻译为中文
- 支持沉浸式翻译和全文翻译两种模式
- 可配置多种 AI 模型（OpenAI、Gemini、Claude、DeepSeek 等 8 家内置 + 自定义）
- 翻译队列管理、失败重试、中断恢复

### 2.7 记录与追踪

- 下载记录、分发记录、翻译记录
- 失败记录分类追踪（网络/认证/API/配置等）
- 按时间排序、按类型筛选

---

## 3. 架构设计

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────┐
│                    ZTools 宿主                        │
│  ┌───────────────────────────────────────────────┐  │
│  │              Skill Hub (Vue SPA)               │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │  Views   │  │Components│  │ Composables │  │  │
│  │  └────┬─────┘  └────┬─────┘  └──────┬─────┘  │  │
│  │       │              │               │         │  │
│  │       └──────────────┼───────────────┘         │  │
│  │                      │                         │  │
│  │              ┌───────┴────────┐                │  │
│  │              │     Utils      │                │  │
│  │              └───────┬────────┘                │  │
│  │                      │                         │  │
│  └──────────────────────┼─────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────┴─────────────────────────┐  │
│  │           Preload Bridge (services.js)          │  │
│  │         Node.js: fs, path, crypto, zip          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │              ZTools API (window.ztools)         │  │
│  │         dbStorage, getPath, plugin lifecycle     │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
商店源 (GitHub / skills.sh / 自定义源)
    │
    ▼
下载 ──▶ <userData>/skills-repo/<skillId>/  (本地缓存)
    │
    ├─▶ 技能注册表 (skill-registry.ts)
    │
    ▼
分发 (copy / symlink) ──▶ 各 Agent 平台目录
    │                        ├── ~/.claude/skills/
    │                        ├── ~/.codex/skills/
    │                        └── ... (19 种平台)
    │
    ▼
安装记录 (install-records) ──▶ localStorage
```

### 3.3 通信机制

| 机制 | 用途 |
|---|---|
| **Provide / Inject** | 21 个类型化 InjectionKey，跨组件共享状态（路由、项目、平台、设置等） |
| **Composables 单例** | `useSettings`、`useSkillInventory`、`useDownloadQueue`、`useTranslationQueue` 使用模块级响应式状态 |
| **Preload Bridge** | `window.services` 提供 Node.js 文件系统/网络/压缩能力 |
| **ZTools API** | `window.ztools` 提供持久化存储、路径解析、插件生命周期 |

---

## 4. 目录结构

```
skill-hub/
├── public/
│   ├── preload/
│   │   ├── services.js          # Node.js 桥接层 (679 行)
│   │   └── package.json         # CommonJS 模块配置
│   ├── plugin.json              # ZTools 插件配置
│   └── app-icon.png             # 应用图标
├── src/
│   ├── main.ts                  # 入口：createApp + 样式导入
│   ├── main.css                 # 全局样式
│   ├── App.vue                  # 根组件：路由 + 布局 + 状态注入 (428 行)
│   ├── inject-keys.ts           # 21 个 InjectionKey 定义
│   ├── types.ts                 # 全局类型定义 (296 行)
│   │
│   ├── views/                   # 页面组件
│   │   ├── MySkills/            # 我的 Skill（下载管理、收藏、筛选）
│   │   ├── SkillStore/          # Skill 商店（浏览、搜索、详情）
│   │   ├── ProjectSkills/       # 项目 Skill（扫描、管理）
│   │   ├── AgentSkills/         # Agent Skill（平台扫描、浏览）
│   │   ├── Sources/             # 商店源管理
│   │   ├── Settings/            # 应用设置
│   │   └── Records/             # 操作记录
│   │
│   ├── components/              # 共享组件 (24 个)
│   │   ├── SkillCard.vue        # Skill 卡片
│   │   ├── SkillDetailBase.vue  # 详情页基础布局
│   │   ├── SkillDetailModal.vue # 详情弹窗
│   │   ├── DeployModal.vue      # 分发平台选择
│   │   ├── BatchSyncModal.vue   # 批量同步
│   │   ├── TranslatePanel.vue   # 翻译面板
│   │   ├── QuickSwitcher.vue    # 下拉切换器
│   │   ├── SkillFileEditor.vue  # CodeMirror 编辑器
│   │   ├── MarkdownRenderer.vue # Markdown 渲染
│   │   ├── AppToast.vue         # 全局通知
│   │   └── ... (更多组件)
│   │
│   ├── composables/             # Vue 组合式函数
│   │   ├── useRouter.ts         # 手动路由管理 (92 行)
│   │   ├── useSettings.ts       # 设置读写 (21 行)
│   │   ├── useTheme.ts          # 主题切换
│   │   ├── useSkillInventory.ts # Skill 库存扫描 (126 行)
│   │   ├── useProjectManager.ts # 项目管理
│   │   ├── useProjectState.ts   # 项目状态
│   │   ├── useDownloadQueue.ts  # 下载队列
│   │   ├── useTranslationQueue.ts # 翻译队列
│   │   └── useFilteredSkills.ts # 筛选逻辑
│   │
│   ├── utils/                   # 工具函数
│   │   ├── storage.ts           # localStorage 持久化 (551 行)
│   │   ├── ai.ts                # AI 聊天补全 (269 行)
│   │   ├── translate.ts         # 翻译引擎 (265 行)
│   │   ├── github.ts            # GitHub API (234 行)
│   │   ├── frontmatter.ts       # SKILL.md 解析 (149 行)
│   │   ├── skills-sh.ts         # skills.sh 客户端 (293 行)
│   │   ├── skill-registry.ts    # 技能注册表 (188 行)
│   │   ├── source-info.ts       # 来源展示信息 (88 行)
│   │   ├── theme.ts             # 主题应用 (84 行)
│   │   ├── path.ts              # 路径规范化 (8 行)
│   │   ├── color.ts             # 头像颜色 (7 行)
│   │   └── markdown.ts          # Markdown 渲染 (13 行)
│   │
│   ├── data/                    # 静态数据
│   │   ├── platforms.ts         # 19 种 Agent 平台定义 (235 行)
│   │   ├── ai-providers.ts      # 8 家 AI 提供商 + 150+ 图标 (49 行)
│   │   ├── skill-categories.ts  # 6 个分类 + 自动推断 (31 行)
│   │   ├── skill-icons.ts       # 内置图标库 (76 行)
│   │   ├── store-icons.ts       # 商店图标映射 (78 行)
│   │   └── brand-colors.ts      # 品牌色 (47 行)
│   │
│   ├── styles/                  # 样式
│   │   ├── design-tokens.css    # 设计令牌系统 (158 行)
│   │   └── app-shell.css        # 应用外壳布局
│   │
│   └── __tests__/               # 测试
│       └── setup.ts
├── docs/                        # 文档
│   ├── DESIGN.md                # 本文档
│   ├── ztools-doc/              # ZTools 文档
│   └── compose/                 # 设计文档
├── api-tests/                   # API 测试
├── package.json
├── tsconfig.json
└── vite.config.js
```

---

## 5. 关键模块详解

### 5.1 路由系统 (`useRouter`)

**无 vue-router**，手动管理路由状态。

```typescript
type RouteName = 'my' | 'store' | 'detail' | 'agent-skills' 
  | 'agent-skill-detail' | 'project-skills' | 'sources' | 'settings' | 'records'

type DetailContext = 'my' | 'store' | 'project' | 'agent'
```

路由状态通过 `provide/inject` 注入到所有子组件。`activeRoute` 计算属性将 `detail`、`agent-skill-detail`、`sources` 等子路由映射到对应的导航高亮项。

### 5.2 持久化存储 (`storage.ts`)

基于 `window.ztools.dbStorage`（ZTools 提供的 localStorage 封装），使用 `sm_` 前缀隔离数据。

| 缓存键 | 内容 |
|---|---|
| `sm_cachedSkills` | 已缓存的 Skill 列表 |
| `sm_downloadedIds` | 已下载的 Skill ID |
| `sm_installRecords` | 分发安装记录 |
| `sm_favorites` | 收藏的 Skill ID |
| `sm_settings` | 应用设置 |
| `sm_storeSources` | 自定义商店源 |
| `sm_platformConfigs` | 平台启用配置 |
| `sm_pageState` | 页面状态（如当前选中的商店） |
| `sm_failureRecords` | 失败记录 |

### 5.3 Preload 桥接层 (`services.js`)

CommonJS 模块，暴露为 `window.services`。提供 Node.js 能力：

| 类别 | 方法 |
|---|---|
| 路径 | `expandPath`, `homeDir`, `isWindows`, `pathJoin`, `pathExists`, `mkdir` |
| 文件系统 | `readFile`, `readFileText`, `writeFile`, `removeFile`, `copyFile`, `readDir`, `stat` |
| 图标 | `saveIconFile`, `readFileAsDataUri` |
| 符号链接 | `createSymlink`（Windows 使用 junction） |
| 下载 | `downloadFile` |
| 压缩 | `extractBufferZip`（AdmZip，含 zip-slip 防护） |
| Skill 扫描 | `scanForSkills`, `scanForSkillFiles`, `parseSkillFile` |
| GitHub | `checkSkillUpdateFull`, `updateSkillFromGitHub`, `getLatestCommitSha` |
| 元数据 | `saveSkillMeta`, `loadSkillMeta`, `buildLocalFileManifest` |
| 哈希 | `hashContent`（SHA-256） |

### 5.4 AI 翻译引擎 (`translate.ts`)

- **沉浸式翻译**：仅翻译 frontmatter 中的 `description` 和 `tags`，保留原文作为 sidecar
- **全文翻译**：翻译整个 SKILL.md 内容
- 使用 Unicode 范围分析检测中文内容
- 基于内容哈希的翻译缓存，避免重复翻译
- 支持 8 家内置 AI 提供商 + 自定义端点

### 5.5 平台检测 (`platforms.ts`)

支持 19 种 AI Agent 平台：

| 平台 | macOS 路径 | Windows 路径 |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `%USERPROFILE%\.claude\skills\` |
| OpenAI Codex | `~/.codex/skills/` | `%USERPROFILE%\.codex\skills\` |
| Cursor | `~/.cursor/skills/` | `%USERPROFILE%\.cursor\skills\` |
| Windsurf | `~/.windsurf/skills/` | `%USERPROFILE%\.windsurf\skills\` |
| Cherry Studio | `~/.cherrystudio/skills/` | — |
| Cline | `~/.cline/skills/` | — |
| ... | ... | ... |

通过 `window.services.pathExists()` 检测目录是否存在来判断平台是否已安装。

---

## 6. 样式系统

### 6.1 设计令牌 (`design-tokens.css`)

基于 CSS 自定义属性的完整设计系统：

- **颜色**：`--background`, `--foreground`, `--card`, `--primary` 等，支持明暗主题
- **主题色**：通过 `--theme-hue` 和 `--theme-saturation` 动态生成主色调
- **运动**：`--motion-standard` (180ms), `--motion-reduced` (110ms), `--motion-off` (0.01ms)
- **阴影**：sm/md/lg 三级，暗色模式使用紫色调阴影
- **字体**：支持 small/medium/large 三档字号
- **紧凑模式**：减少间距

### 6.2 主题预设

提供 6 种莫兰迪色系主题：皇家蓝、雾霾蓝、烟熏紫、豆沙绿、杏色橙、青碧色。

---

## 7. 构建与部署

### 7.1 开发

```bash
pnpm dev          # Vite 开发服务器 → http://localhost:5173
pnpm build        # vue-tsc 类型检查 → vite 构建 → dist/
pnpm build-zip    # 构建 + 打包 zip 到系统下载文件夹
```

### 7.2 构建配置

- **分包策略**：Vue、CodeMirror、Highlight.js 分别打包为独立 chunk
- **chunk 大小限制**：1000 KB
- **Base 路径**：`./`（相对路径，适配 ZTools 插件部署）
- **测试框架**：Vitest + happy-dom

### 7.3 部署流程

1. `pnpm build-zip` 生成 zip 包到系统下载文件夹
2. 将 zip 复制到 ZTools 插件目录
3. ZTools 加载 `dist/index.html` + `preload/services.js`

---

## 8. 第三方依赖

| 依赖 | 用途 |
|---|---|
| `vue` 3.5 | UI 框架 |
| `@codemirror/*` | SKILL.md / 源码编辑器 |
| `markdown-it` | Markdown 渲染 |
| `adm-zip` (preload) | ZIP 解压 |
| `@ztools-center/ztools-api-types` | ZTools API 类型定义 |

---

## 9. 测试

测试文件位于 `src/**/__tests__/`，覆盖：

- **Composables**: `useRouter`, `useSettings`, `useTheme`, `useProjectState`, `useProjectManager`, `useFilteredSkills`, `useDownloadQueue`, `useTranslationQueue`
- **Utils**: `frontmatter`, `path`, `color`, `theme`, `skill-registry`, `skills-sh`
- **Components**: 20+ 组件测试

运行：`pnpm test`（单次）或 `pnpm test:watch`（监听模式）

---

## 10. 设计决策

| 决策 | 原因 |
|---|---|
| 不使用 vue-router | ZTools 插件为单页嵌入式应用，路由简单，手动管理更轻量 |
| CommonJS preload | ZTools preload 脚本运行在 Node.js 环境，需 CommonJS 模块格式 |
| localStorage 持久化 | 使用 ZTools 提供的 dbStorage API，无需额外数据库 |
| 模块级单例 composables | 跨组件共享状态无需 Pinia/Vuex，减少依赖 |
| CodeMirror 6 | 支持多语言语法高亮、轻量、可扩展 |
| 提供符号链接和复制两种分发模式 | 符号链接省空间但兼容性差，复制更可靠 |

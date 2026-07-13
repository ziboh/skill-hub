# Skill Hub

ZTools 插件 — Vue 3 + Vite + TypeScript 技能商店与一键分发工具。

## 命令

```bash
pnpm dev       # Vite 开发服务器 → http://localhost:5173
pnpm build     # vue-tsc 类型检查 → vite 构建 → dist/
pnpm build-zip # 构建 + 打包 zip 到系统下载文件夹
pnpm test      # vitest 单测
pnpm lint      # eslint src/
pnpm format    # prettier 格式化 src/
```

## 架构

- **单页应用**：无 vue-router，手动管理路由状态（`useRouter` + `App.vue` 中 `route` ref）
- **侧栏布局**：左侧 rail-sidebar 导航 + 右侧内容区（`KeepAlive` 缓存页面）
- **Preload 脚本**：`public/preload/services.js` 提供 Node.js 能力（文件系统、GitHub API、zip 解压）
- **技能扫描**：通过 `window.services.scanForSkillFiles()` 扫描目录中的 SKILL.md 文件

## 目录结构

```
src/
├── views/          # 页面（MySkills, SkillStore, AgentSkills, ProjectSkills, Sources, Settings, Records）
├── components/     # 共享组件（DeployModal, AppToast, ProviderIcon, SkillCard 等）
├── composables/    # Vue 组合式函数（useSettings, useRouter, useDownloadQueue 等）
├── utils/          # 工具函数（storage, theme, github, translate 等）
├── data/           # 静态数据（platforms, store-icons, ai-providers 等）
└── types.ts        # TypeScript 类型定义
public/
├── preload/
│   └── services.js # Node.js 服务（文件操作、GitHub API、压缩包处理）
└── plugin.json     # ZTools 插件配置
```

## 关键约束

- **禁止使用浏览器内置弹窗 API**：所有需要用户确认/提示/输入的场景，必须使用项目中已有的自定义 Modal 组件（如 `DeployModal`、`SkillDetailModal`、`AddProjectModal` 等）或 `AppToast`，不得使用 `alert()`、`confirm()`、`prompt()`

- TypeScript `strict: false`，`noImplicitAny: false`（宽松模式）
- 测试：vitest + happy-dom + @vue/test-utils（`pnpm test`）
- Preload 脚本使用 CommonJS（`public/preload/package.json` 中 `"type": "commonjs"`）
- 主应用使用 ES Modules（`package.json` 中 `"type": "module"`）
- 样式使用 CSS 变量系统，支持明暗主题切换

## 开发注意

- 添加新功能需在 `src/App.vue` 的路由表与 `useRouter` 中注册
- Preload 服务通过 `window.services` 全局访问
- ZTools API 通过 `window.ztools` 全局访问
- 构建产物在 `dist/` 目录，需复制到 ZTools 插件目录测试
- **打包 zip 文件时，保存到系统下载文件夹**：是系统下载路径，而非应用默认路径

## Lint / Test 策略

- **小改动默认不跑**全量 `pnpm lint` / `pnpm test`（文案、样式、单文件局部修改等）
- **需要时再跑**：改公共逻辑、类型、路由、preload、跨模块依赖，或用户明确要求
- 用户说「跳过 lint/test」时一律跳过

## API 测试

- `api-tests/openai-api.http` — kulala.nvim 测试文件，包含 OpenAI API 多个接口
- 使用前设置环境变量 `OPENAI_API_KEY`

## ZTools 文档

- 本地副本：`docs/ztools-doc/`（9 个 markdown 文件）
- 在线地址：https://ztoolscenter.github.io/ZTools-doc/
- 包含：快速开始、目录结构、plugin.json 配置、preload.js、Node.js 能力、插件 API、发布流程

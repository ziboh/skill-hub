# Skill Hub 当前实现设计说明

> 本文是 Skill Hub 当前代码的架构基线，描述已经实现的模块、数据结构、运行流程和约束。文档不承担产品路线图职责；如果本文与代码不一致，以当前代码和测试为准，并应在同一变更中更新本文。

## 1. 项目定位

Skill Hub 是运行在 ZTools 中的 Vue 3 插件，用于发现、导入、编辑、翻译、分发和卸载 AI Agent Skill。一个 Skill 通常由一个目录和其中的 `SKILL.md` 组成，Skill Hub 将它保存在本地技能库，并按全局或项目范围同步到不同 Agent 的技能目录。

| 项目项 | 当前实现 |
| --- | --- |
| 插件名称 | Skill Hub |
| 插件版本 | `1.1.0` |
| 宿主 | ZTools |
| 前端 | Vue 3 + Vite + TypeScript |
| 包管理 | pnpm |
| 前端模块 | ES Modules |
| Preload 模块 | CommonJS |
| 持久化 | `window.ztools.dbStorage` |
| 测试 | Vitest + happy-dom + Vue Test Utils |
| 入口 | `index.html` |
| Preload | `public/preload/services.js` |

Skill Hub 不是 Agent 运行时，也不解析或执行 Skill 中的指令。它负责文件和元数据管理，并调用用户配置的 AI API 执行翻译。

## 2. 运行边界

```text
┌──────────────────────────── ZTools 宿主 ────────────────────────────┐
│                                                                     │
│  Vue SPA                                                            │
│  App.vue → views → components → composables / utils / storage       │
│                    │                                                │
│                    ├── window.ztools                                │
│                    │   路径、dbStorage、插件能力                     │
│                    │                                                │
│                    └── window.services                              │
│                        Node 文件系统、网络、扫描、压缩、平台适配      │
│                                                                     │
│  public/preload/services.js（CommonJS 桥接层）                       │
│       └── public/preload/lib/*                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.1 前端层

前端运行在浏览器上下文中，负责页面状态、交互、筛选、队列展示、Markdown 预览和编辑器。前端不直接使用 Node.js 的 `fs`、`path` 或 SQLite，只通过 `window.services` 调用受控能力。

### 2.2 ZTools API

`window.ztools` 是宿主提供的 API，当前主要用于：

- 通过 `dbStorage` 保存插件数据；
- 通过 `getPath('userData')` 获取插件数据目录；
- 使用 ZTools 插件生命周期和插件资源能力。

### 2.3 Preload 桥接层

`public/preload/services.js` 将 Node 能力组合成 `window.services`。路径校验、文件读写、压缩包解压、GitHub 请求、平台特例和用户图标文件读写均位于这一边界或其 `lib` 子模块中。Preload 使用 CommonJS，因为 ZTools 以 Node.js preload 方式加载它。

## 3. 分层架构

```text
页面路由与布局
  App.vue / views/*
        │
共享交互组件
  components/*
        │
跨页面状态与流程
  composables/*
        │
领域工具、持久化与适配
  utils/* / utils/storage/* / icons/* / data/*
        │
宿主能力
  window.ztools / window.services
        │
文件系统、网络、压缩和平台数据库
```

### 3.1 目录职责

| 目录 | 职责 | 典型内容 |
| --- | --- | --- |
| `src/views` | 页面级状态编排和布局 | 我的技能、商店、项目技能、Agent 技能、设置、记录 |
| `src/components` | 可复用 UI 和交互流程 | 卡片、详情、分发面板、Modal、编辑器、图标 |
| `src/composables` | 可跨页面复用的响应式状态和流程 | 路由、项目管理、库存、商店、下载队列、翻译队列 |
| `src/utils` | 与 Vue 无关的领域逻辑和服务封装 | frontmatter、路径、导入、分发、生命周期、翻译 |
| `src/utils/storage` | 持久化 API 的模块化实现 | 技能、平台、项目、设置、记录、缓存 |
| `src/icons` | 图标值解析、注册和异步解析 | `parseIcon`、registry、`resolveIcon` |
| `src/data` | 静态平台、分类、提供商和商店数据 | 平台定义、AI 模型、图标元数据 |
| `src/styles` | 设计令牌和页面样式 | 主题变量、通用页面、设置页、商店页 |
| `public/preload/lib` | Node 能力的细分模块 | fs、扫描、GitHub、zip、平台适配 |

依赖方向原则是：页面可以使用组件、composable 和领域工具；领域工具可以使用类型、存储和 `window.services`；Preload 不依赖 Vue，不读取前端响应式状态。业务页面不应自行复制文件、拼接平台路径或实现图标类型判断。

## 4. 功能地图

### 4.1 Skill 商店

商店页通过 `useStoreSkills` 管理当前源、搜索、分类、排行榜、分页、缓存和已下载状态。来源包括内置源以及用户配置的自定义源。

当前支持的来源语义包括：

- GitHub Skill 仓库及仓库内的 Skill 路径；
- `skills.sh` 社区搜索和排行榜；
- Marketplace JSON；
- Well-Known 索引；
- Git 仓库源；
- 本地目录源。

商店列表使用 `Skill` 元数据。只有实际下载或导入完成后，技能才进入本地技能库；仅浏览商店不会创建本地技能目录。

### 4.2 我的技能

我的技能页读取已下载技能列表，并从本地 `skills-repo` 校验和补充 `SKILL.md` 元数据。支持收藏、用户标签、分类和排序，显示分发状态，并打开详情、编辑器、翻译面板或分发面板。

### 4.3 项目技能

用户可以注册项目根目录，并为项目配置扫描路径。扫描结果以 `SkillScanResult` 表示，包含技能目录、`SKILL.md` 文件、解析后的 manifest、原始内容和符号链接状态。项目页可以查看、编辑和移除项目中的 Skill。

### 4.4 Agent 技能

Agent 技能页根据平台定义和设置扫描全局技能目录，展示已经存在的 Skill，并支持查看详情、识别重复技能和按范围卸载。扫描得到的是文件系统事实，不会自动把外部目录的所有内容写入我的技能库。

### 4.5 分发与卸载

分发支持全局和项目两种 scope，以及 `copy` 和 `symlink` 两种模式。普通平台使用通用目录操作；Cherry Studio 通过独立适配器注册其数据库记录后再完成文件操作。

卸载前会确认目标范围，并检查物理目录状态。卸载结果会同步清理 Skill Hub 的分发记录；平台特例可以额外清理平台侧注册关系。

### 4.6 翻译

翻译队列支持描述翻译和全文翻译：

- 描述翻译只处理 Skill 元数据描述；
- 全文翻译处理 `SKILL.md` 内容；
- 通过内容哈希缓存结果；
- 支持自动翻译、失败记录、队列恢复和手动清理；
- AI 模型由设置中的模型配置提供，支持多个提供商、API Key 和自定义额外请求体。

### 4.7 记录与设置

记录页展示会话下载、分发记录、翻译缓存/队列和失败记录。设置页管理安装模式、平台路径、商店源、主题、界面偏好、AI 模型和翻译行为。

## 5. 核心领域模型

### 5.1 Skill

`src/types.ts` 中的 `Skill` 是商店条目和本地技能索引共用的元数据模型。文件内容不直接嵌入 `Skill`，而是由 `id` 映射到本地技能目录。

关键字段：

| 字段 | 作用 |
| --- | --- |
| `id` | 当前来源下的技能标识，也是本地技能库目录名的输入 |
| `name` / `description` | 展示和导入时的基础元数据 |
| `author` / `tags` / `category` | 筛选、展示和分类 |
| `source` | `builtin`、`github`、`skills-sh`、`marketplace-json`、`well-known-index`、`git-repo`、`local` 或 `local-dir` |
| `repo` / `path` / `branch` | GitHub 或 Git 源定位信息 |
| `sourceUrl` / `homepage` | 网页或直接下载地址 |
| `canonicalId` | 跨来源识别时使用的规范身份字段；当前不是独立持久化注册表 |
| `storeSourceId` | 记录技能来自哪个商店源 |
| `isFavorited` / `userTags` | 用户本地状态 |
| `downloadedAt` | 进入本地技能库的时间 |

保存到 dbStorage 时，`storage` 会去除部分临时展示字段，并清理描述格式；读取时可以根据本地 `SKILL.md` 补充名称、描述、作者和标签。

### 5.2 文件扫描结果

`SkillScanResult` 表示文件系统扫描到的技能，不等同于已下载的 `Skill`。它包含：

- `dir`：技能目录；
- `skillFile`：`SKILL.md` 或 `skill.md`；
- `content`：原始文件内容；
- `manifest`：frontmatter 中的名称、描述、作者、标签、语言；
- `isSymlink`：目录是否为符号链接。

扫描服务负责遍历和读取文件，前端负责展示和交互。

### 5.3 平台与分发记录

`PlatformInfo` 描述一个 Agent 平台的全局路径、项目路径、启用状态、检测状态、图标和用户自定义路径。`defaultPlatforms` 提供内置定义，设置可以覆盖路径、启用状态和排序，也可以添加自定义平台。

`DistributeRecord` 记录 Skill Hub 已执行的分发：

```ts
interface DistributeRecord {
  skillId: string
  platformId: string
  mode: 'copy' | 'symlink'
  scope?: 'global' | 'project'
  targetPath: string
  sourceDir: string
  distributedAt: string
  updatedAt?: string
}
```

分发记录是 Skill Hub 的操作记录，不是所有平台实际状态的唯一来源。Agent 页面仍会扫描物理目录，以处理用户手动创建、移动或删除的技能。

### 5.4 其他模型

- `StoreSource`：用户配置的商店源，包含类型、地址、分支、目录、启用状态和图标。
- `RegisteredProject`：项目路径、扫描路径、注册时间和当次扫描结果。
- `AppSettings`：安装模式、主题、界面偏好、平台和 AI 翻译配置。
- `ModelConfig`：提供商、API 地址、模型、多个 Key、启用状态、图标和额外请求体。
- `FailureRecord`：下载、分发或翻译失败的错误、分类、模型、端点、状态码、请求 ID 和原始响应等诊断信息。

## 6. 页面、路由与状态

项目不使用 `vue-router`。`useRouter` 使用响应式变量保存当前路由和详情上下文，再由 `App.vue` 通过条件渲染挂载页面。

### 6.1 路由

当前路由名为：

| 路由 | 页面 |
| --- | --- |
| `my` | 我的技能 |
| `store` | Skill 商店 |
| `detail` | Skill 详情，依据 context 返回不同导航高亮 |
| `agent-skills` | Agent 技能 |
| `agent-skill-detail` | Agent 或项目扫描结果详情 |
| `project-skills` | 项目技能 |
| `sources` | 商店源管理 |
| `settings` | 设置 |
| `records` | 操作记录 |

`NavigateParams` 传递子源 ID、Skill、平台 ID、详情上下文、设置锚点和重复技能列表。`activeRoute` 将详情页和源管理页映射到侧栏的父导航项。

### 6.2 根组件编排

`App.vue` 负责：

1. 创建路由和全局主题；
2. 初始化技能库存、项目管理、翻译队列和平台扫描；
3. 通过 `provide` 注入项目、平台、Agent 技能、刷新信号、Toast 和导航能力；
4. 使用 `KeepAlive` 缓存主要页面；
5. 在应用初始化或刷新信号变化时重新扫描和更新统计。

`inject-keys.ts` 集中定义注入键，组件不应通过字符串 key 共享跨页面状态。

### 6.3 全局交互约束

项目禁止使用浏览器内置的 `alert()`、`confirm()` 和 `prompt()`。确认、输入、选择和详情均使用已有 Modal 或页面面板；轻量结果使用 `AppToast`。生命周期钩子和底层工具不直接操作 UI，而是返回错误或 warnings，由调用层决定如何展示。

## 7. 数据流与技能生命周期

### 7.1 总体数据流

```text
商店源 / 项目目录 / Agent 目录
          │
          ├── 列表与扫描 ──► Skill / SkillScanResult
          │
          └── 下载或导入
                    │
                    ▼
         <userData>/skills-repo/<skillId>
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       编辑/翻译   全局分发   项目分发
                    │         │
                    ▼         ▼
             Agent 目录   项目 Agent 目录
                    │
                    ▼
        dbStorage 中的分发/失败/翻译记录
```

### 7.2 下载和导入

`useStoreDownload` 将下载任务放入 `useDownloadQueue`。根据来源选择以下路径：

1. Well-Known 或可直接下载的 Marketplace 条目：获取文件列表并原子写入目标目录；
2. GitHub 条目：下载 zip，解压到临时目录，优先尝试已知路径（包括 `skills/` 和 `agent-skills/`）；
3. 如果无法直接定位 Skill：递归查找所有包含 `SKILL.md` 的目录，按元数据匹配；仍有多个候选时通过 `SkillPickModal` 让用户选择；
4. 使用 `atomicWriteDir` 或 `atomicReplaceDir` 写入本地技能库；
5. 通过 `finalizeImportedSkill` 保存本地索引、导入来源、会话下载记录和商店源归属；
6. 按设置决定是否将描述或全文加入翻译队列。

下载失败时更新队列状态、显示 Toast，并写入 `FailureRecord`。没有 GitHub 仓库、找不到 `SKILL.md` 或候选目录为空时，不会创建有效的本地技能索引。

### 7.3 本地技能库

技能文件位于 ZTools `userData` 下的 `skills-repo`，目录由 `getSkillsRepoDir` 生成。dbStorage 的 `sm_downloaded_skills` 保存本地技能元数据和用户状态，二者共同构成本地技能库。

应用启动和库存刷新时会：

- 清理没有对应目录的过期技能索引；
- 清理失效技能对应的分发记录；
- 从本地 `SKILL.md` 补充或修正元数据；
- 使用模块级缓存减少重复读取 dbStorage。

### 7.4 分发

普通平台的 `deploySkillToTarget` 流程为：

1. 解析 Skill 源目录并确认存在 `SKILL.md`；
2. 计算全局或项目目标路径；
3. 运行 `beforeInstall` 钩子，任意错误会阻止文件操作；
4. 调用 `window.services.deployPlatformSkill`，平台没有特例时返回 `handled: false`；
5. 通用实现按 `copy` 或 `symlink` 写入目录；Windows 的符号链接能力由 preload 处理，并使用 junction 等兼容方式；
6. 保存或更新 `DistributeRecord`；
7. 运行 `afterInstall` 钩子。后置钩子失败不会撤销已成功的主操作，只会作为 warning 返回。

### 7.5 卸载

`uninstallPathAndRecord` 负责通用卸载流程：

1. 运行 `beforeUninstall`；失败时保留目标目录和分发记录；
2. 优先调用平台卸载适配器；没有适配器时删除受控目标路径；
3. 删除对应 scope 的分发记录；
4. 运行 `afterUninstall`；后置失败作为 warning 返回。

卸载只处理明确选中的全局或项目范围。物理扫描发现的技能可能没有 Skill Hub 分发记录，界面会据此区分“已记录分发”和“仅存在于目录中的技能”。

### 7.6 生命周期钩子

`src/utils/skill-lifecycle.ts` 提供进程内的注册表：

- `beforeInstall`
- `afterInstall`
- `beforeUninstall`
- `afterUninstall`

注册按顺序执行，注册函数返回注销函数。前置钩子可以中止主操作；后置钩子收集错误并转换为 warnings。钩子上下文包含操作类型、阶段、技能、平台、目标路径、源目录、模式、scope 和主操作结果。

钩子不读取 Vue 状态、不调用浏览器弹窗、不绕过路径校验，也不直接写入分发记录。

## 8. Cherry Studio 平台适配

Cherry Studio 不是普通目录平台。除文件目录外，它还需要在自己的 SQLite 数据库中存在 Skill 注册记录，因此适配器独立位于 `public/preload/lib/cherry-studio.js`。

### 8.1 分发

`platform-deploy.js` 按平台 ID 选择适配器。Cherry Studio 适配器：

1. 根据目标 Skills 目录推导数据目录；
2. 按内置候选路径查找数据库；
3. 检测受支持的 `skills` 或 `agent_global_skill` 表及必需列；
4. 从源目录解析 `SKILL.md` 元数据并生成内容哈希；
5. 插入或更新数据库注册记录；
6. 数据库成功后再复制或链接 Skill 目录；
7. 文件操作失败时恢复旧行，或删除本次插入的新行；
8. 返回实际目标目录，供 Skill Hub 保存分发记录。

适配器使用固定表名白名单和预编译 SQL 参数。当前运行时不支持 `node:sqlite` 时直接返回明确错误，不降级为“只复制文件”。

### 8.2 卸载

Cherry Studio 卸载会识别对应 Skill 注册记录，清理 Skill 与 Agent 的关联，并删除由该注册关系启用的工作区链接；失败时尝试恢复数据库记录和关联。内置 Skill 不允许删除。早期只存在文件目录而没有数据库记录的分发结果，兼容为仅删除目标目录。

## 9. 持久化与缓存

### 9.1 存储机制

`src/utils/storage/index.ts` 将多个职责明确的 API 合并成 `storage` facade。底层通过 `dbGet` / `dbSet` 使用 `window.ztools.dbStorage`，所有键统一添加 `sm_` 前缀。模块级缓存只用于减少读取和维持当前进程内的同步视图，不替代持久化数据。

### 9.2 当前键空间

| 逻辑键 | 实际键 | 内容 |
| --- | --- | --- |
| `downloaded_skills` | `sm_downloaded_skills` | 已下载或导入的 Skill 元数据 |
| `distributed_skills` | `sm_distributed_skills` | 全局/项目分发记录 |
| `store_sources` | `sm_store_sources` | 自定义商店源 |
| `platform_configs` | `sm_platform_configs` | 平台启用和路径配置 |
| `platform_order` | `sm_platform_order` | 平台显示顺序 |
| `registered_projects` | `sm_registered_projects` | 注册项目和扫描设置 |
| `settings` | `sm_settings` | 应用和翻译设置 |
| `translations` | `sm_translations` | 按内容哈希保存的翻译缓存 |
| `failure_records` | `sm_failure_records` | 下载、分发、翻译失败记录 |
| `github_cache` | `sm_github_cache` | GitHub 技能描述、README 和仓库信息缓存 |
| `web_cache` | `sm_web_cache` | Marketplace、Well-Known 等网页源缓存 |
| `user_icons` | `sm_user_icons` | 用户导入图标条目 |

此外，当前进程内还有会话下载列表和页面状态缓存。会话下载列表用于记录本次应用运行期间的下载；页面状态用于保留商店源、记录分页等界面状态。

### 9.3 兼容迁移

读取技能列表时会迁移旧的 `sm_cached_skills` 数据，只保留其中已经下载的条目；读取收藏时也兼容旧的收藏 ID 数据。迁移后删除旧键。新增存储字段必须保持旧数据可读，涉及键名或字段语义变更时应在 storage 模块集中处理迁移。

## 10. Preload 能力

`services.js` 暴露的 API 是前端使用 Node 能力的唯一入口。具体实现拆分在 `public/preload/lib`。

| 能力 | 代表 API | 说明 |
| --- | --- | --- |
| 路径 | `expandPath`、`homeDir`、`pathJoin`、`pathExists` | 展开用户路径和拼接受控路径 |
| 文件系统 | `readFile`、`readFileText`、`writeFile`、`removeFile`、`copyFile`、`readDir`、`stat` | 文件和目录操作 |
| 前端目录写入工具 | `atomicWriteDir`、`atomicReplaceDir` | 位于 `src/utils/fs-ops.ts`，组合受控文件操作完成目录级更新 |
| Skill 扫描 | `scanForSkills`、`scanForSkillFiles`、`parseSkillFile` | 遍历 Skill 目录并解析 frontmatter |
| GitHub | `downloadFile`、GitHub JSON 请求、更新检查、提交 SHA | 下载、缓存和更新检测 |
| 压缩 | `extractBufferZip` | 解压 zip，并防止 zip-slip 路径穿越 |
| 元数据 | `saveSkillMeta`、`loadSkillMeta`、`buildLocalFileManifest` | 保存 GitHub 更新检查所需状态 |
| 哈希 | `hashContent` | 内容哈希和翻译/平台注册校验 |
| 图标文件 | `saveIconFile`、`writeSvgFile`、`listIconFiles`、`readFileAsDataUri` | 保存和读取用户图标 |
| 链接 | `createSymlink` | 创建符号链接或 Windows junction |
| 平台适配 | `deployPlatformSkill`、`uninstallPlatformSkill` | 选择平台特例处理器 |

Preload 文件系统操作会调用写入根目录校验，目录删除、写入和链接创建不能绕过这一约束。前端传入的路径不是天然可信路径。

## 11. 平台发现与路径

`src/data/platforms.ts` 保存内置平台定义，包括平台 ID、名称、全局相对路径、项目路径、规则路径、默认路径和图标。`useSkillInventory` 根据平台配置调用扫描服务，汇总检测到的平台和每个平台的技能数量。

平台路径来源按优先级组合：

1. 用户自定义全局路径或项目路径；
2. 当前操作 scope 对应的默认路径；
3. 平台定义提供的系统路径。

平台检测只表示路径是否存在或可访问，不代表该平台进程正在运行。目录扫描结果可能包含用户手动放入的 Skill、复制的 Skill 和符号链接 Skill。

## 12. 图标系统

图标系统由 `src/icons` 和 `AppIcon.vue` 统一处理，业务层仍可传入字符串以保持设置和本地数据兼容。

### 12.1 解析和注册

`parseIcon` 将字符串解析为以下语义：

- 空值；
- 内联 SVG；
- data URI、HTTP(S) 或静态资源地址；
- Windows/UNC 等本地路径；
- 注册表 key。

`registry` 保存 providers、platforms、store 和 skill 等命名空间的图标资源及别名。`resolveIcon` 将解析值转换为可渲染结果：内联 SVG、图片地址或空值。需要读取本地文件时，通过 `window.services.readFileAsDataUri` 完成。

### 12.2 渲染组件

`AppIcon` 是统一渲染入口，负责 SVG、图片和 fallback 三类分支，并处理尺寸、avatar/mono 变体和异步解析。`ProviderIcon` 保留为兼容入口，避免业务页面必须一次性改完。

用户图标文件保存到 ZTools `userData/store-icons`，dbStorage 只保存其元数据和路径，不把大文件内容写入 dbStorage。

## 13. 主题与界面系统

样式使用 CSS 自定义属性。`src/styles/design-tokens.css` 提供背景、前景、卡片、主色、阴影、圆角、间距和运动变量，并支持浅色、深色和跟随系统模式。

当前设置支持：

- 莫兰迪主题色预设；
- small / medium / large 字体大小；
- off / reduced / standard 动画偏好；
- 紧凑布局；
- 自定义背景图片；
- 页面和商店的独立样式文件。

组件应优先使用设计令牌和现有 Modal/Toast 交互，避免引入页面私有的重复颜色、弹窗行为或图标分支。

## 14. 错误处理与安全约束

### 14.1 错误路径

- 下载、分发和翻译失败写入 `FailureRecord`，并在页面层显示 Toast；
- 队列任务保存运行、成功、失败和错误信息，记录页可查看失败详情；
- 生命周期前置钩子失败会阻止主操作；后置钩子失败只生成 warning；
- Cherry Studio 文件操作失败会回滚数据库变更；回滚失败时同时返回原始错误和回滚错误；
- 图标解析失败回落到空图标或 fallback，不让单个图标阻断页面；
- 单个 Skill 扫描或元数据解析失败不会阻止其他目录继续扫描。

### 14.2 安全边界

- 文件写入、删除和链接创建必须经过 preload 的允许写入根目录校验；
- zip 解压必须防止 `../` 和目标目录外路径；
- Cherry Studio SQL 使用固定表白名单和参数绑定，不拼接用户内容；
- Skill 内容只被读取、编辑、复制、链接或翻译，不由 Skill Hub 执行；
- API Key 通过设置和请求层使用，不写入页面日志或错误展示；
- 所有需要确认的操作使用自定义 Modal，不调用浏览器内置弹窗 API。

## 15. 测试结构

测试与源代码相邻，主要覆盖以下边界：

| 层级 | 当前覆盖 |
| --- | --- |
| Composables | 路由、设置、主题、项目管理、筛选、下载队列、翻译队列、商店下载、批量选择 |
| Utils | frontmatter、路径、来源、导入、技能身份、排序、安装状态、分发、生命周期、调度、缓存 |
| Storage | storage facade、各数据模块和缓存迁移行为 |
| Icons | 类型探测、registry、别名、资源解析和组件兼容 |
| Components | Modal、分发面板、商店卡片、翻译面板、设置相关组件和 Toast |
| Preload | 路径工具、frontmatter、Cherry Studio 数据库注册/回滚等 CommonJS 模块 |

Vitest 使用 `happy-dom`，入口配置在 `vite.config.js`，全局测试设置在 `src/__tests__/setup.ts`。Preload 模块的测试通过注入依赖或 mock 文件操作，避免依赖真实用户目录和真实 Cherry Studio 数据库。

## 16. 构建、开发与部署

```bash
pnpm dev          # 启动 Vite 开发服务器
pnpm build        # vue-tsc 类型检查并构建 dist/
pnpm test         # 运行 Vitest 单测
pnpm lint         # 检查 src/
pnpm format       # 使用 Prettier 格式化 src/
pnpm build-zip    # 构建并打包到系统下载目录
```

Vite 使用相对 base 路径 `./`，以适配 ZTools 插件目录加载。Vue、CodeMirror 等依赖按 vendor chunk 拆分，chunk 警告阈值为 1000 KB。

插件发布时由 `public/plugin.json` 声明 `index.html` 和 `preload/services.js`。构建结果位于 `dist/`；打包脚本将插件产物保存为系统下载目录中的 zip 文件，部署到 ZTools 后由宿主加载入口和 preload。

## 17. 当前采用的设计决策

| 决策 | 当前原因 |
| --- | --- |
| 手动路由而非 `vue-router` | 路由数量有限，插件是嵌入式单页应用，详情上下文也需要自定义状态 |
| `provide/inject` 共享跨页面状态 | 保持页面组件可替换，避免引入全局状态库 |
| 模块级 composable 状态 | 下载和翻译队列等状态需要跨页面共享，并且已有明确的组合式 API |
| storage 按职责拆分后再聚合 | 保留 `storage` facade 的调用兼容，同时减少单文件职责和缓存耦合 |
| dbStorage 保存索引和配置，文件系统保存 Skill 内容 | Skill 内容和图标文件较大，文件系统更适合原样保存和编辑 |
| copy 与 symlink 双模式 | 复制兼容性好，链接减少重复文件并能反映源目录变化 |
| 通用分发与平台适配分离 | 普通平台不需要了解平台数据库；特殊平台可以独立回滚 |
| 生命周期钩子只返回结果和 warnings | 不把领域逻辑耦合到 Vue UI 或宿主弹窗 |
| 图标统一走 `AppIcon` | 让来源 key、SVG、URL 和本地文件由同一套解析规则处理 |
| Preload 使用 CommonJS | 与 ZTools 的 Node.js preload 加载方式一致 |

## 18. 维护约束

修改以下内容时，应同步检查本文对应章节和测试：

- 路由名、详情上下文或 `provide/inject` 入口；
- `Skill`、`PlatformInfo`、`DistributeRecord`、`AppSettings` 等公共类型；
- storage 键、迁移逻辑或本地技能目录布局；
- preload 暴露 API、写入根目录和平台适配器；
- 下载、分发、卸载、翻译和错误记录的生命周期；
- 图标解析格式、registry 命名空间或渲染入口；
- 构建脚本、插件入口或部署目录。

设计文档应记录已经存在的实现和约束，不把尚未实现的功能写成当前能力。

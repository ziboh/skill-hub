# Cherry Studio Skill 注册适配设计

## 背景

Skill Hub 当前把 Cherry Studio 当作普通文件目录平台处理：将 Skill 复制或链接到 `Data/Skills/<folder>` 后，只保存 Skill Hub 自己的分发记录。Cherry Studio 的 Skill 列表来自 SQLite 数据库中的 `skills`（新版）或 `agent_global_skill`（旧版）表，因此只有文件、没有数据库记录的 Skill 不会被识别。

本改动为 Cherry Studio 增加独立平台适配器。通用分发逻辑不感知 Cherry Studio 的数据库路径、表名和字段。

## 目标

- Cherry Studio 分发先完成数据库注册，注册成功后才复制或链接文件。
- 数据库不存在、结构不支持、运行时不支持 SQLite 或写入失败时，不修改目标 Skill 文件夹，不保存分发记录，并向用户显示明确错误。
- 文件复制或链接失败时，回滚本次数据库变更。
- Cherry Studio 特有逻辑集中在 Preload 独立模块，其他平台继续使用现有通用流程。
- 不新增浏览器内置弹窗，错误继续通过现有分发结果和 Toast 展示。

## 非目标

- 本次不实现 Cherry Studio 卸载时的数据库注销。
- 本次不自动为所有 Cherry Studio Agent 启用新 Skill；注册记录沿用 Cherry Studio 的默认未启用状态。
- 不修改其他平台的目录结构和分发语义。

## 架构

### 平台分发入口

新增 Preload 平台分发入口 `deployPlatformSkill(options)`。入口内部维护平台适配器映射：

- `cherry-studio`：交给 Cherry Studio 适配器完整处理。
- 其他平台：返回 `{ handled: false }`，由现有 `skill-deploy.ts` 执行普通复制或软链接。

渲染层只判断是否已被平台适配器处理，不引用数据库文件名、SQL 或 Cherry Studio 表结构。

### Cherry Studio 适配器

新增 `public/preload/lib/cherry-studio.js`，职责仅包括：

1. 从目标 Skills 目录推导 Cherry Studio 数据根目录。
2. 按顺序查找数据库：`Data/agents.db`、`Data/agent.db`、根目录 `cherrystudio.sqlite`。
3. 检测 `skills` 或 `agent_global_skill` 表并选择对应模式。
4. 从源目录读取 `SKILL.md`，生成名称、描述、作者、标签和 SHA-256 内容哈希。
5. 对 `folder_name` 对应记录执行插入或更新。
6. 数据库写入成功后执行文件复制或目录链接。
7. 文件操作失败时，恢复更新前的数据库行；本次为新记录时删除新行。

SQLite 通过 `node:sqlite` 的 `DatabaseSync` 延迟加载。若 ZTools 运行时没有该内置模块，适配器返回“当前 ZTools 运行时不支持 Cherry Studio 数据库注册”，不会降级成仅复制文件。

### 文件夹名称

Cherry Studio 目标文件夹按其现有约束规范化：

- `/`、`\\` 和非法字符替换为 `_`；
- 仅保留字母、数字、下划线和连字符；
- 最大长度 80；
- 适配器返回实际目标目录，Skill Hub 用该目录保存分发记录。

## 数据流

1. `deploySkillToGlobalPlatform` 计算源目录和候选目标目录。
2. `deploySkillToTarget` 调用 `window.services.deployPlatformSkill`。
3. 非 Cherry Studio 返回 `handled: false`，继续现有文件分发。
4. Cherry Studio 适配器打开受支持数据库并校验表结构。
5. 适配器保存旧行快照，并插入或更新 Skill 注册记录。
6. 注册成功后复制或链接整个 Skill 目录。
7. 文件操作成功后关闭数据库并返回实际目标目录。
8. `skill-deploy.ts` 保存 Skill Hub 分发记录。

## 错误处理

- 找不到数据库：失败，不复制文件。
- 找不到受支持表：失败，不复制文件。
- 缺少 `SKILL.md`：沿用现有源目录校验，适配器不运行。
- 数据库被占用或 SQL 失败：失败，不复制文件，并保留原数据库状态。
- 文件复制或链接失败：删除可能产生的不完整目标，恢复数据库旧行或删除新行。
- 回滚也失败：返回同时包含原始错误和回滚错误的信息，便于排查，不保存分发记录。

## 接口

Preload 暴露：

```ts
deployPlatformSkill(options: {
  platformId: string
  sourceDir: string
  targetDir: string
  mode: 'copy' | 'symlink'
  skillName: string
}): {
  handled: boolean
  targetDir?: string
}
```

不支持特殊处理的平台只返回 `{ handled: false }`。适配器错误通过异常抛出，由现有 `deploySkillToTarget` 捕获并写入失败记录。

## 测试

- 平台入口对普通平台返回 `handled: false`。
- Cherry Studio 数据库不存在时抛出错误，且不调用复制或链接。
- 新版 `skills` 表注册成功后才调用复制。
- 旧版 `agent_global_skill` 表可注册。
- 复制失败时删除新数据库行。
- 更新已有记录后复制失败时恢复原记录。
- `skill-deploy` 使用适配器返回的实际目标目录保存分发记录。
- 运行现有 `skill-deploy` 单元测试，确保普通平台行为不变。

## 安全与耦合边界

- SQL、数据库候选路径和 Cherry Studio 字段只存在于 Cherry Studio 适配器。
- 所有 SQL 值使用预编译语句参数，不拼接用户内容。
- 表名只从代码内固定白名单选择。
- 目标路径仍经过现有允许写入根目录校验。
- 不直接修改 Cherry Studio 的 Agent 启用关系。

# Skill 安装与卸载生命周期钩子设计

## 背景

Skill Hub 当前已经将安装和卸载流程集中在通用函数中，并允许 Cherry Studio 通过独立适配器处理数据库注册和注销。后续还需要在不耦合具体平台和 Vue UI 的前提下扩展安装前、安装后、卸载前、卸载后的行为。

## 目标

- 为安装和卸载提供统一的四阶段生命周期钩子：`beforeInstall`、`afterInstall`、`beforeUninstall`、`afterUninstall`。
- 让钩子同时获得成功、失败和回滚结果，便于记录、同步和后续扩展。
- `before` 钩子可以阻止实际操作；`after` 钩子失败不能反向触发文件或数据库回滚。
- 钩子层不依赖 Vue、Toast 或 Cherry Studio，普通平台和特殊平台使用同一套生命周期。
- 第一阶段只提供代码级注册接口，不执行任意用户脚本或外部命令。

## 非目标

- 不在本次设计中实现用户可配置脚本、命令或远程 Webhook。
- 不改变现有平台的安装目录、数据库注册语义和分发记录格式。
- 不让钩子直接操作 UI 或替代现有的分发结果提示。

## 术语

- **主操作**：实际的文件复制、软链接、Cherry Studio 数据库注册/注销以及 Skill Hub 分发记录更新。
- **前置钩子**：主操作前执行的钩子，可以通过抛出错误阻止主操作。
- **后置钩子**：主操作尝试结束后执行的钩子，接收最终结果，包括失败和回滚信息。
- **警告**：后置钩子自身失败产生的信息，不改变主操作的成功状态。

## 架构

新增独立的生命周期模块，例如 `src/utils/skill-lifecycle.ts`，负责：

1. 保存四类钩子的注册表。
2. 按注册顺序执行钩子。
3. 将钩子异常转换为结构化错误或警告。
4. 向安装和卸载入口提供统一的上下文和结果对象。

通用入口负责生命周期编排：

- `deploySkillToTarget` 在实际文件操作和分发记录更新前后调用安装钩子。
- `uninstallPathAndRecord` 在实际文件/数据库删除和记录删除前后调用卸载钩子。
- `public/preload/lib/cherry-studio.js` 只负责 Cherry Studio 特有的数据库逻辑，不注册 UI 或业务钩子。

钩子注册模块不主动导入页面组件。需要提示时，由现有 UI 根据主操作结果显示 Toast；钩子只返回记录信息或写入日志。

## 接口

```ts
export type LifecycleOperation = 'install' | 'uninstall'
export type LifecyclePhase = 'before' | 'after'

export interface SkillLifecycleContext {
  operation: LifecycleOperation
  phase: LifecyclePhase
  skillId: string
  skillName: string
  platformId: string
  targetPath: string
  sourceDir?: string
  mode?: 'copy' | 'symlink'
  scope?: 'global' | 'project'
  result?: SkillLifecycleResult
}

export interface SkillLifecycleResult {
  ok: boolean
  operation: LifecycleOperation
  skillId: string
  platformId: string
  targetPath: string
  error?: string
  rollbackError?: string
  warnings?: string[]
}

export type SkillLifecycleHook = (context: SkillLifecycleContext) => void

export function registerSkillLifecycleHook(
  name: 'beforeInstall' | 'afterInstall' | 'beforeUninstall' | 'afterUninstall',
  hook: SkillLifecycleHook,
): () => void
```

注册函数返回注销函数，避免测试、插件或临时适配器污染全局状态。钩子保持同步接口，以匹配当前同步的安装/卸载流程；以后增加外部脚本时，另行设计异步执行器，不直接改变本阶段主流程契约。

## 生命周期与错误处理

### 安装

1. 完成现有输入和源目录校验。
2. 执行 `beforeInstall`；任一钩子抛错则跳过主操作。
3. 执行普通平台文件操作或 Cherry Studio 适配器操作。
4. 成功后保存 Skill Hub 分发记录。
5. 无论主操作成功、失败或回滚失败，都执行一次 `afterInstall`。
6. 将主操作结果和后置钩子警告返回给调用方。

### 卸载

1. 构造卸载上下文并执行 `beforeUninstall`。
2. 任一前置钩子失败则跳过删除。
3. 执行普通平台删除或 Cherry Studio 数据库注销、关联清理和目录删除。
4. 主操作成功后删除 Skill Hub 分发记录。
5. 无论主操作成功、失败或恢复失败，都执行一次 `afterUninstall`。

### 结果规则

| 场景 | 主操作状态 | 后置钩子 | 最终状态 |
| --- | --- | --- | --- |
| 前置钩子失败 | 未执行 | 执行并收到失败结果 | 失败 |
| 主操作成功 | 成功 | 执行并收到 `ok: true` | 成功 |
| 主操作失败且回滚成功 | 失败 | 执行并收到原始错误 | 失败 |
| 主操作失败且回滚失败 | 失败 | 执行并收到双重错误 | 失败 |
| 后置钩子失败 | 成功或失败 | 收集为 warning | 不改变主操作状态 |

多个前置钩子按注册顺序执行，首个失败即停止；多个后置钩子全部执行，错误分别收集，避免一个清理钩子阻断其他清理钩子。

## 提示与记录

- 主操作成功：沿用现有成功 Toast。
- 主操作失败：沿用现有失败 Toast，并展示回滚失败信息（如果存在）。
- 后置钩子失败但主操作成功：保留成功状态，同时追加一条 warning Toast 或记录，避免用户误以为安装失败。
- 钩子本身不调用 `alert`、`confirm`、`prompt`，也不直接依赖 `KeyShowToast`。
- 钩子错误应写入现有失败/操作记录的 details 或 warnings 字段，便于诊断。

## 安全与耦合边界

- 生命周期模块不读取平台数据库、不拼接 SQL、不访问 Vue 响应式状态。
- Cherry Studio 适配器不感知钩子注册表，只返回主操作结果。
- 钩子不能绕过现有写入根目录校验和路径安全检查。
- 第一阶段禁止从配置直接执行任意命令；外部脚本能力需要单独的权限和确认设计。

## 测试

- 注册和注销钩子按注册顺序生效。
- 前置安装钩子失败时不发生文件、数据库或分发记录变更。
- 前置卸载钩子失败时不发生删除或记录清理。
- 安装成功和失败都会调用一次 `afterInstall`。
- 卸载成功和失败都会调用一次 `afterUninstall`。
- 主操作失败且回滚成功时，后置钩子能读取错误结果。
- 回滚失败和后置钩子失败分别记录，不互相覆盖。
- 普通平台、Cherry Studio 全局分发和项目分发继续保持现有行为。

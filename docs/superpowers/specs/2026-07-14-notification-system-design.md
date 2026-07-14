# 全局提示体系重构设计

- 日期：2026-07-14
- 状态：已获用户确认，待实现
- 范围：应用内非阻塞提示（Toast）及其全局调用接口

## 背景

当前项目通过 `AppToast.vue` 提供 `success`、`error`、`info`、`warning` 四种 Toast 类型，业务侧统一调用 `showToast(message, type?)`。现有实现能够满足基础提示，但存在以下问题：

1. `info` 的语义不够明确，无法区分普通通知与成功反馈。
2. Toast 只有消息文本，没有标题、持续时间和操作按钮等结构化信息。
3. 业务调用侧容易把“需要确认”的操作与“仅需告知”的结果混用。
4. 全局注入类型分散在多个文件，新增提示能力时容易出现类型不一致。

## 目标

1. 建立清晰的“通知、成功、警告、错误”四类非阻塞提示模型。
2. 为 Toast 增加可选标题、持续时间和操作按钮能力。
3. 保持现有 `showToast(message, type?)` 调用兼容，降低迁移风险。
4. 明确 Toast 与 Modal 的职责边界：需要用户作出选择或确认的场景仍使用 Modal。
5. 通过测试锁定类型、默认行为、自动关闭、手动关闭和兼容调用等行为。

## 非目标

1. 本次不替换现有确认、删除、卸载等 Modal 组件。
2. 本次不引入第三方通知组件库。
3. 本次不修改业务流程，只调整提示表达和提示基础设施。
4. 本次不使用浏览器原生 `alert`、`confirm` 或 `prompt`。

## 设计方案

### 1. 类型模型

将提示类型统一为：

```ts
type NotificationType = 'notification' | 'success' | 'warning' | 'error'
```

单条提示采用结构化数据：

```ts
interface NotificationOptions {
  type?: NotificationType
  title?: string
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}
```

`type` 默认值为 `notification`。为兼容现有调用，旧的 `info` 类型在入口处转换为 `notification`，旧的 `success`、`warning`、`error` 保持语义不变。

### 2. 全局 API

在 `inject-keys.ts` 中集中定义类型和注入键：

```ts
export type NotificationType = 'notification' | 'success' | 'warning' | 'error'

export interface NotificationOptions {
  type?: NotificationType
  title?: string
  message: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

type Notify = {
  (options: NotificationOptions): void
  (message: string, type?: NotificationType | 'info'): void
}
```

`App.vue` 提供 `notify`，业务组件通过 `KeyShowToast` 注入。为减少一次性迁移范围，注入键名称可以暂时保持不变，但其函数类型升级为兼容的新 API；后续可再单独将名称迁移为 `KeyNotify`。

### 3. 默认标题与持续时间

| 类型 | 默认标题 | 默认持续时间 |
| --- | --- | ---: |
| notification | 通知 | 3000ms |
| success | 操作成功 | 3000ms |
| warning | 注意 | 5000ms |
| error | 操作失败 | 8000ms |

显式传入 `duration` 时覆盖默认值。`duration <= 0` 表示不自动关闭，只能手动关闭。

### 4. 展示与交互

每条 Toast 展示：

- 与类型对应的图标、颜色和样式类。
- 标题（未传入时使用类型默认标题）。
- 消息文本。
- 关闭按钮。
- 可选操作按钮；点击后执行回调并关闭当前 Toast。

保留现有行为：

- Toast 从页面底部居中显示。
- 支持多条 Toast 同时存在。
- 长消息点击后展开。
- 展开状态暂停自动关闭计时。
- 关闭时保留离场动画。

### 5. Modal 与 Toast 的职责边界

以下场景必须继续使用 Modal：

- 删除、卸载、覆盖等不可逆操作确认。
- 需要用户输入内容的场景。
- 需要用户选择多个选项或决定下一步的场景。
- 错误信息过长且需要用户阅读、复制或采取多步骤处理的场景。

Toast 只用于告知结果、状态和短暂提醒，不阻塞用户当前操作。

## 迁移策略

1. 先扩展 `AppToast.vue` 的数据模型和展示能力。
2. 更新 `inject-keys.ts`、`App.vue` 和相关类型定义。
3. 保留旧调用签名，兼容现有业务代码。
4. 将高频、语义明确的调用逐步迁移为对象形式；本次优先迁移代表性场景，不强制一次性改完全部调用。
5. 继续保留 `info` 兼容映射，但新代码不再使用 `info`。

## 测试计划

在实现前先编写失败测试，覆盖：

1. 默认类型为 `notification`，默认标题为“通知”。
2. `success`、`warning`、`error` 的默认标题和 CSS 类正确。
3. 对象形式支持自定义标题、消息和持续时间。
4. `info` 旧调用会映射为 `notification`。
5. 不同类型使用不同默认自动关闭时间。
6. `duration <= 0` 不会自动关闭。
7. 手动关闭、长消息展开和多条 Toast 行为保持不变。
8. 操作按钮点击后执行回调并关闭 Toast。
9. 现有组件使用旧 `showToast` 签名时不报错。

## 验收标准

- 业务侧可以用对象形式表达提示类型和内容。
- 用户能通过标题、图标、颜色快速识别通知级别。
- 警告和错误不会像普通通知一样过快消失。
- 需要确认的操作仍通过 Modal 完成。
- 相关单元测试通过，项目可以正常构建。

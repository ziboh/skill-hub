# 翻译共享机制实现计划

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/translation-sharing.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让同一技能在不同分发位置（我的技能、项目、Agent）共享翻译结果，通过 InstallRecord.skillId 反查原始技能 ID 作为翻译缓存键。

**Architecture:** 新增 `resolveTranslationKey()` 函数，通过 InstallRecord 反查原始技能 ID。SkillDetailBase.vue 和 SkillDetailModal.vue 改用该函数作为翻译缓存键。同时将 UI 中残留的"安装"文本改为"分发"。

**Tech Stack:** Vue 3, TypeScript

## Global Constraints

- 禁止使用浏览器内置弹窗 API（alert/confirm/prompt）
- 构建即验证：`pnpm build` 是唯一验证步骤
- 无测试框架，通过构建和手动验证确认
- TypeScript strict: false, noImplicitAny: false

---

### Task 1: 添加 resolveTranslationKey 函数

**Covers:** [S2]

**Files:**
- Modify: `src/utils/translate.ts`

**Interfaces:**
- Consumes: `storage` from `./storage`, `Skill` from `../types`
- Produces: `resolveTranslationKey(skill: Skill, skillDir?: string): string`

- [ ] **Step 1: 在 translate.ts 中添加 resolveTranslationKey 函数**

在 `src/utils/translate.ts` 末尾添加：

```typescript
import { storage } from './storage'
import type { Skill } from '../types'

export function resolveTranslationKey(skill: Skill, skillDir?: string): string {
  const cachedSkills = storage.getCachedSkills()
  const downloadedIds = storage.getDownloadedIds()
  const installRecords = storage.getInstallRecords()

  // 1. 如果是"我的技能"中的技能，直接使用 skill.id
  const isMySkill = cachedSkills.some(s => s.id === skill.id) && downloadedIds.includes(skill.id)
  if (isMySkill) {
    return skill.id
  }

  // 2. 通过 InstallRecord 查找原始技能 ID
  if (skillDir) {
    const normalizedDir = skillDir.replace(/\\/g, '/').toLowerCase()
    const record = installRecords.find(r => {
      const normalizedTarget = r.targetPath.replace(/\\/g, '/').toLowerCase()
      return normalizedTarget.startsWith(normalizedDir) || normalizedDir.startsWith(normalizedTarget)
    })
    if (record) {
      return record.skillId
    }
  }

  // 3. 通过名称匹配查找（降级方案）
  const skillName = (skill.name || '').toLowerCase()
  const matchedRecord = installRecords.find(r => {
    const recordSkill = cachedSkills.find(s => s.id === r.skillId)
    if (recordSkill && recordSkill.name.toLowerCase() === skillName) {
      return true
    }
    return false
  })
  if (matchedRecord) {
    return matchedRecord.skillId
  }

  // 4. 降级为 skill.id
  return skill.id
}
```

- [ ] **Step 2: 确认导入路径正确**

检查 `translate.ts` 顶部是否已有 `import { storage } from './storage'` 和 `import type { Skill } from '../types'`，如果没有则添加。

- [ ] **Step 3: 验证构建**

Run: `pnpm build`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: Commit**

```bash
git add src/utils/translate.ts
git commit -m "feat: add resolveTranslationKey for translation cache sharing"
```

---

### Task 2: 修改 SkillDetailBase.vue 使用共享翻译键

**Covers:** [S2]

**Files:**
- Modify: `src/components/SkillDetailBase.vue:7-9` (imports)
- Modify: `src/components/SkillDetailBase.vue:135-173` (translation functions)

**Interfaces:**
- Consumes: `resolveTranslationKey` from `../utils/translate`
- Produces: 无新接口，修改现有行为

- [ ] **Step 1: 导入 resolveTranslationKey**

在 `SkillDetailBase.vue` 的 import 语句中添加 `resolveTranslationKey`：

```typescript
import { translateContent, translateDescription, stripFrontmatter, renderImmersiveSegments, isChineseContent, resolveTranslationKey } from '../utils/translate'
```

- [ ] **Step 2: 添加 translationKey computed**

在 `const translationMode = ref<TranslationMode>('immersive')` 之后添加：

```typescript
const translationKey = computed(() => resolveTranslationKey(props.skill, props.skillDir))
```

- [ ] **Step 3: 修改 loadTranslationCache 使用 translationKey**

将 `loadTranslationCache` 函数中的 `props.skill.id` 替换为 `translationKey.value`：

```typescript
function loadTranslationCache() {
  const cached = storage.getTranslation(translationKey.value)
  if (cached) {
    translatedContent.value = cached.translatedContent
    translationMode.value = cached.mode as TranslationMode
    showTranslation.value = true
  } else {
    translatedContent.value = ''
    showTranslation.value = false
  }
  isContentChinese.value = isChineseContent(props.skillContent)
  const cachedDesc = storage.getTranslationDesc(translationKey.value)
  if (cachedDesc) {
    translatedDesc.value = cachedDesc
    descTranslationDone.value = true
    showDescTranslation.value = true
  } else {
    translatedDesc.value = ''
    descTranslationDone.value = false
    showDescTranslation.value = false
  }
  isDescChinese.value = isChineseContent(props.skillDesc || props.skill.description || '')
}
```

- [ ] **Step 4: 修改 saveTranslationCache 使用 translationKey**

将 `saveTranslationCache` 函数中的 `props.skill.id` 替换为 `translationKey.value`：

```typescript
function saveTranslationCache() {
  if (translatedContent.value) {
    storage.saveTranslation(translationKey.value, {
      sourceContent: props.skillContent,
      translatedContent: translatedContent.value,
      mode: translationMode.value,
    })
  }
}
```

- [ ] **Step 5: 修改 saveDescTranslationCache 使用 translationKey**

将 `saveDescTranslationCache` 函数中的 `props.skill.id` 替换为 `translationKey.value`：

```typescript
function saveDescTranslationCache() {
  if (translatedDesc.value) {
    storage.saveTranslationDesc(translationKey.value, translatedDesc.value)
  }
}
```

- [ ] **Step 6: 修改 watch 监听**

将 watch 中的 `props.skill.id` 替换为 `translationKey`（注意是 computed，不需要 .value）：

```typescript
watch(() => translationKey.value, () => {
  loadTranslationCache()
  loadUserTags()
})
```

- [ ] **Step 7: 验证构建**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 8: Commit**

```bash
git add src/components/SkillDetailBase.vue
git commit -m "feat: use shared translation key in SkillDetailBase"
```

---

### Task 3: 修改 SkillDetailModal.vue 使用共享翻译键

**Covers:** [S2]

**Files:**
- Modify: `src/components/SkillDetailModal.vue`

**Interfaces:**
- Consumes: `resolveTranslationKey` from `../utils/translate`
- Produces: 无新接口

- [ ] **Step 1: 读取 SkillDetailModal.vue 确认翻译缓存使用位置**

确认翻译缓存读写使用 `props.skill.id` 的位置（约 lines 156-240）。

- [ ] **Step 2: 导入 resolveTranslationKey**

在 import 语句中添加 `resolveTranslationKey`。

- [ ] **Step 3: 添加 translationKey computed**

在组件 setup 中添加：

```typescript
const translationKey = computed(() => resolveTranslationKey(props.skill))
```

- [ ] **Step 4: 替换所有翻译缓存读写中的 props.skill.id**

将 `storage.getTranslation(props.skill.id)` 替换为 `storage.getTranslation(translationKey.value)`，`storage.saveTranslation(props.skill.id, ...)` 替换为 `storage.saveTranslation(translationKey.value, ...)`，描述翻译同理。

- [ ] **Step 5: 验证构建**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 6: Commit**

```bash
git add src/components/SkillDetailModal.vue
git commit -m "feat: use shared translation key in SkillDetailModal"
```

---

### Task 4: UI 文本"安装"改为"分发"

**Covers:** [S4]

**Files:**
- Modify: `src/components/BatchSyncModal.vue:173`
- Modify: `src/components/DeployModal.vue:229`
- Modify: `src/views/AgentSkills/index.vue:415`
- Modify: `src/views/Settings/index.vue:1415,1418,1422`
- Modify: `src/components/SkillDetailBase.vue:56` (installCount 标签)

**Interfaces:**
- 无新接口，纯 UI 文本修改

- [ ] **Step 1: 修改 BatchSyncModal.vue**

将 line 173 的 `未检测到已安装的 AI 平台` 改为 `未检测到已配置的 AI 平台`

- [ ] **Step 2: 修改 DeployModal.vue**

将 line 229 的 `未检测到已安装的 AI 平台` 改为 `未检测到已配置的 AI 平台`

- [ ] **Step 3: 修改 AgentSkills/index.vue**

将 line 415 的 `管理复制或软链接安装` 改为 `管理复制或软链接分发`

- [ ] **Step 4: 修改 Settings/index.vue**

将 line 1415 的 `技能安装的默认行为` 改为 `技能分发的默认行为`
将 line 1418 的 `安装模式` 改为 `分发模式`
将 line 1422 的 `默认安装模式` 改为 `默认分发模式`

- [ ] **Step 5: 修改 SkillDetailBase.vue**

将 line 56 的 `{ key: 'installCount', label: '安装数', ... }` 改为 `{ key: 'installCount', label: '下载数', ... }`

- [ ] **Step 6: 验证构建**

Run: `pnpm build`
Expected: 构建成功

- [ ] **Step 7: Commit**

```bash
git add src/components/BatchSyncModal.vue src/components/DeployModal.vue src/views/AgentSkills/index.vue src/views/Settings/index.vue src/components/SkillDetailBase.vue
git commit -m "refactor: rename '安装' to '分发' in UI text"
```

---

### Task 5: 全量构建验证

**Covers:** [S2, S4]

**Files:**
- 无修改，仅验证

- [ ] **Step 1: 运行完整构建**

Run: `pnpm build`
Expected: vue-tsc 类型检查通过 + vite 构建成功，无错误

- [ ] **Step 2: 检查 dist 目录**

确认 `dist/` 目录已生成，包含所有资源文件。

- [ ] **Step 3: 最终 Commit（如有遗漏文件）**

如果构建发现遗漏的修改，修复后提交。

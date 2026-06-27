# 翻译共享机制设计

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/translation-sharing.md)

## [S1] 问题

当一个技能从"我的技能"分发到多个位置（项目、Agent），每个位置的详情页都有独立的翻译功能。但翻译缓存使用 `skill.id` 作为键，而不同位置的 `skill.id` 值不同：

| 位置 | `skill.id` 示例 |
|------|-----------------|
| 我的技能 | `anthropics/skills/extended-thinking` |
| AgentSkills | `claude/extended-thinking` |
| ProjectSkills | `extended-thinking` |

结果：在 Agent C 中翻译了技能 A，项目 B 中的同一技能 A 需要重新翻译，翻译不共享。

## [S2] 方案

### 核心思路

使用**原始技能 ID**（即"我的技能"中的 `skill.id`）作为翻译缓存键。对于分发出的技能，通过 `InstallRecord.skillId` 反查原始 ID。

### 翻译键解析流程

```
resolveTranslationKey(skill, skillDir?) → string
```

1. 如果 skill 是"我的技能"中的技能（在 cachedSkills 中且有匹配的 downloadedId）→ 返回 `skill.id`
2. 否则，在 `InstallRecord` 中查找匹配的记录：
   - 按 `targetPath` 匹配（skillDir 参数）
   - 如果找到，返回 `record.skillId`（原始技能 ID）
3. 如果都找不到，返回 `skill.id`（降级为不共享）

### 验证条件

只有满足以下条件的技能才能共享翻译：
- 在 `InstallRecord` 中有对应的分发记录
- 记录的 `targetPath` 与当前技能的目录路径匹配

同名但没有分发记录的技能不会共享翻译。

## [S3] 修改范围

### 1. 新增翻译键解析函数

**文件**: `src/utils/translate.ts`

添加 `resolveTranslationKey(skill: Skill, skillDir?: string): string` 函数：
- 从 storage 获取 cachedSkills 和 downloadedIds
- 从 storage 获取 installRecords
- 按上述流程解析

### 2. 修改 SkillDetailBase.vue

**文件**: `src/components/SkillDetailBase.vue`

- 导入 `resolveTranslationKey`
- 添加 computed `translationKey`，基于 `props.skill` 和 `props.skillDir` 计算
- `loadTranslationCache()` 和 `saveTranslationCache()` 中使用 `translationKey.value` 替代 `props.skill.id`

### 3. 修改 SkillDetailModal.vue

**文件**: `src/components/SkillDetailModal.vue`

- 同样导入 `resolveTranslationKey`
- 添加 computed `translationKey`
- 修改翻译缓存读写使用 `translationKey`

### 4. UI 文本更新

将以下位置的"安装"改为"分发"：
- `src/components/BatchSyncModal.vue`: "未检测到已安装的 AI 平台" → "未检测到已配置的 AI 平台"
- `src/components/DeployModal.vue`: 同上
- `src/views/AgentSkills/index.vue`: "管理复制或软链接安装" → "管理复制或软链接分发"
- `src/views/Settings/index.vue`: "技能安装的默认行为" → "技能分发的默认行为"，"安装模式" → "分发模式"，"默认安装模式" → "默认分发模式"

## [S4] 边界情况

1. **技能从未分发过**: `InstallRecord` 中无记录 → 降级为 `skill.id` → 不共享（预期行为）
2. **手动复制的技能**: 没有通过应用分发 → 无 `InstallRecord` → 不共享
3. **同名不同技能**: 不同作者/内容 → 不同 `skill.id` → `InstallRecord.skillId` 不同 → 不共享
4. **翻译缓存迁移**: 旧缓存使用 `skill.id` 作为键 → 新缓存使用 `resolveTranslationKey` → 旧缓存可能在某些位置失效（可接受，用户可重新翻译一次）

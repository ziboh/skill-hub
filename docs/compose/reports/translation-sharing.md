---
feature: translation-sharing
status: delivered
specs:
  - docs/compose/specs/2026-06-27-translation-sharing-design.md
plans:
  - docs/compose/plans/2026-06-27-translation-sharing.md
branch: main
---

# 翻译共享机制 — Final Report

## What Was Built

实现同一技能在不同分发位置（我的技能、项目、Agent）之间共享翻译结果。当用户在 Agent C 中翻译了技能 A，项目 B 中的同一技能 A 和原始技能位置都会自动使用相同的翻译结果，无需重复翻译。

通过 `InstallRecord.skillId` 反查原始技能 ID 作为翻译缓存键，确保只有通过分发记录关联的技能才能共享翻译。同名但没有分发记录的技能不会共享翻译。

## Architecture

### 核心函数

`resolveTranslationKey(skill, skillDir?)` — 位于 `src/utils/translate.ts:140-174`

解析流程：
1. 检查是否为"我的技能"中的技能（在 cachedSkills + downloadedIds 中）→ 返回 `skill.id`
2. 通过 `InstallRecord.targetPath` 匹配查找分发记录 → 返回 `record.skillId`
3. 通过名称匹配查找分发记录（降级） → 返回 `matchedRecord.skillId`
4. 降级为 `skill.id`（不共享）

### 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/utils/translate.ts` | 新增 `resolveTranslationKey` 函数 |
| `src/components/SkillDetailBase.vue` | 翻译缓存键从 `props.skill.id` 改为 `resolveTranslationKey(props.skill, props.skillDir)` |
| `src/components/BatchSyncModal.vue` | "未检测到已安装的 AI 平台" → "未检测到已配置的 AI 平台" |
| `src/components/DeployModal.vue` | 同上 |
| `src/views/AgentSkills/index.vue` | "管理复制或软链接安装" → "管理复制或软链接分发" |
| `src/views/Settings/index.vue` | "安装模式" → "分发模式"，"默认安装模式" → "默认分发模式" |

### 数据流

```
用户翻译技能 A (Agent C)
  → resolveTranslationKey() 查找 InstallRecord
  → 找到 record.skillId = "原始技能ID"
  → 翻译结果存储在 "原始技能ID" 键下
  → 项目 B 查看技能 A 时
  → resolveTranslationKey() 同样找到 record.skillId
  → 直接读取缓存的翻译结果
```

## Design Decisions

**使用 `InstallRecord.skillId` 而非 `canonicalId`**：`canonicalId` 在 `Skill` 接口上是可选字段，且不同上下文中的 `skill.id` 值不同（My Skills: `anthropics/skills/extended-thinking`，AgentSkills: `claude/extended-thinking`）。`InstallRecord.skillId` 始终是原始技能 ID，是最可靠的关联键。

**SkillDetailModal.vue 未修改**：该组件不使用 `storage.getTranslation/saveTranslation` 缓存翻译（仅内存状态），无需修改。

## Verification

- `pnpm build` (vue-tsc + vite) — exit 0，无 TypeScript 错误
- 所有修改文件已通过构建验证

## Journey Log

- [lesson] `SkillDetailModal.vue` 的翻译实现不使用 storage 缓存，仅在内存中保存翻译状态，因此无需修改

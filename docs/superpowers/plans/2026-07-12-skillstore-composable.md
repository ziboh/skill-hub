# SkillStore composable 化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 或本会话内联执行。步骤使用复选框跟踪进度。

**目标：** 将 `SkillStore/index.vue`（~2774 行）的加载/缓存/分页/搜索/下载状态逻辑抽到 `useStoreSkills`，页面只保留 UI 与交互编排。

**架构：** 先抽纯函数（分页、本地搜索、imported/available 分流、marketplace 解析）并 TDD；再组装 `useStoreSkills` composable；最后让 `index.vue` 改用 composable。可选子组件（StoreHeader/SkillGrid/StoreFilters）本阶段可不拆，优先逻辑下沉。

**技术栈：** Vue 3 Composition API、vitest、TypeScript（strict: false）

---

## 文件

| 文件 | 职责 |
|------|------|
| 创建 `src/composables/useStoreSkills.ts` | 商店技能：加载/缓存/分页/搜索/筛选/下载状态 |
| 创建 `src/composables/__tests__/useStoreSkills.test.ts` | composable + 纯函数行为测试 |
| 修改 `src/views/SkillStore/index.vue` | 调用 useStoreSkills，保留 template/样式与少量 UI 状态 |

## 边界（留在 index.vue）

- props/emit/inject
- 主题、viewMode
- Modal 开关（删除确认、商店配置、SkillPick）
- 描述懒加载 IntersectionObserver（强依赖 DOM ref）
- downloadSkill 完整下载流水线（依赖 window.services + queue + pick modal）— **可第二步再下沉**
- template + scoped CSS

## useStoreSkills 对外 API（目标）

```ts
export function useStoreSkills(opts: {
  storeId: () => string
  showToast?: (msg: string, type?: string) => void
  onNavigate?: (route: string, params?: { sub: string }) => void
}) {
  return {
    // sources
    presets, storeSources, activePresetId, currentSource, sourceSubtitle, sourceItems,
    // load
    loading, error, loadingDots, startLoadingDots, stopLoadingDots,
    allEntries, sourceSkills, totalCount, skillsCache,
    fetchCurrentSkills, fetchSkillsSh, onLeaderboardFilterChange,
    // search / filter
    searchQuery, debouncedSearchQuery, searchActive, searchResults,
    filterTab, leaderboardFilter, categoryCounts,
    isLocalSearchActive, localSearchResults,
    onSearch, exitSearch,
    // pagination
    PAGE_SIZE, visibleCount, resetVisibleCount, growVisibleCount, onStoreScroll, fillViewport, storeScrollRef,
    visibleSearchResults, visibleLocalSearchResults, visibleImportedSkills, availableSkills,
    // download status
    downloadedIds, downloadedIdSet, importedSkills, availableSkillsAll,
    isDownloaded, isDownloading, getDownloadedElsewhereBadges, getLanguageTags,
    refreshDownloadedIds,
    // store admin helpers
    _storeVersion, loadLocalIcons, localIconCache, getSourceIcon, isCurrentStoreCustom,
  }
}
```

### 任务 1：纯函数 + 失败测试（分页/搜索/分流）

**文件：**
- 创建：`src/composables/useStoreSkills.ts`（先只放纯函数导出）
- 创建：`src/composables/__tests__/useStoreSkills.test.ts`

- [ ] 测试：`growVisible` 不超过 max、按 PAGE_SIZE 增长
- [ ] 测试：`filterLocalSearch` 匹配 name/desc/author/tags
- [ ] 测试：`splitImportedAndAvailable` 按 storeSourceId 分流
- [ ] 测试：`buildCategoryCounts` 统计
- [ ] 测试：`parseMarketplaceEntries` 映射 id/name

### 任务 2：实现纯函数让测试通过

### 任务 3：组装 useStoreSkills 状态 + 计算属性

把 index.vue 中对应 ref/computed/watch 迁入 composable（不含下载流水线与 DOM observer）。

### 任务 4：index.vue 接线

删除已迁出逻辑，从 `useStoreSkills` 解构使用；保持行为不变。

### 任务 5：验证

```bash
pnpm test src/composables/__tests__/useStoreSkills.test.ts
pnpm exec vue-tsc --noEmit
```

不 commit（除非用户要求）。

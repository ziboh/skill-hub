<script setup lang="ts">
defineProps<{
  searchActive: boolean
  resultCount: number
  totalCount: number
  sourceSubtitle: string
  isCurrentStoreCustom: boolean
  viewMode: 'grid' | 'list'
  loading: boolean
  isDarkMode: boolean
}>()

const emit = defineEmits<{
  (e: 'edit-store'): void
  (e: 'add-store'): void
  (e: 'refresh'): void
  (e: 'toggle-theme'): void
  (e: 'update:viewMode', mode: 'grid' | 'list'): void
}>()
</script>

<template>
  <div class="page-header">
    <div class="header-left">
      <div class="header-title-row">
        <h2>Skill 商店</h2>
        <span v-if="searchActive" class="count-badge">{{ resultCount }} 个结果</span>
        <span v-else class="count-badge">{{ totalCount }}</span>
      </div>
      <p class="page-subtitle">
        {{ sourceSubtitle }}
      </p>
    </div>
    <div class="header-toolbar-wrapper">
      <div class="header-toolbar">
        <button
          v-if="isCurrentStoreCustom"
          class="toolbar-btn add-store-edit-btn"
          title="编辑商店配置"
          @click="emit('edit-store')"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          编辑商店
        </button>
        <button class="add-store-btn" title="添加商店" @click="emit('add-store')">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          添加商店
        </button>
        <div class="view-toggle">
          <button :class="{ active: viewMode === 'grid' }" title="网格视图" @click="emit('update:viewMode', 'grid')">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button :class="{ active: viewMode === 'list' }" title="列表视图" @click="emit('update:viewMode', 'list')">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        <button class="toolbar-icon-btn" :disabled="loading" title="刷新" @click="emit('refresh')">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <button
          class="toolbar-icon-btn"
          :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'"
          @click="emit('toggle-theme')"
        >
          <svg
            v-if="isDarkMode"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <path
              d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            />
          </svg>
          <svg
            v-else
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

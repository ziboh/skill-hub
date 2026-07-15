<script setup lang="ts">
import QuickSwitcher from './QuickSwitcher.vue'
import ProviderIcon from './ProviderIcon.vue'
import UiIcon from './UiIcon.vue'
import { SKILL_CATEGORIES, ALL_CATEGORIES, CATEGORY_ICONS } from '../data/skill-categories'
import * as skillsSh from '../utils/skills-sh'

const props = defineProps<{
  sourceItems: { id: string; label: string; deletable?: boolean }[]
  activePresetId: string
  searchQuery: string
  leaderboardFilter: string
  filterTab: string
  categoryCounts: Record<string, number>
  searchActive: boolean
  getSourceIcon: (id: string) => string | undefined
}>()

const emit = defineEmits<{
  (e: 'select-store', id: string): void
  (e: 'add-store'): void
  (e: 'delete-store', id: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'search'): void
  (e: 'clear-search'): void
  (e: 'update:leaderboardFilter', key: string): void
  (e: 'update:filterTab', tab: string): void
}>()

function onSearchEnter() {
  if (props.activePresetId === 'skills-sh') emit('search')
}

function onSearchClick() {
  if (props.activePresetId === 'skills-sh') emit('search')
}
</script>

<template>
  <div class="ss-filter-row">
    <QuickSwitcher
      :items="sourceItems"
      :selected-id="activePresetId"
      placeholder="搜索商店..."
      add-label="添加商店"
      :show-add="true"
      @select="(id) => emit('select-store', id)"
      @add="emit('add-store')"
      @delete="(id) => emit('delete-store', id)"
    >
      <template #trigger-prefix="{ item }">
        <span v-if="item?.id && getSourceIcon(item.id)" class="qs-trigger-icon">
          <ProviderIcon :icon="getSourceIcon(item.id)!" :size="16" />
        </span>
      </template>
      <template #item-prefix="{ item }">
        <span v-if="item?.id && getSourceIcon(item.id)" class="qs-item-icon">
          <ProviderIcon :icon="getSourceIcon(item.id)!" :size="16" />
        </span>
      </template>
    </QuickSwitcher>
    <div class="ss-search-wrapper">
      <div class="ss-search-inner">
        <svg
          class="ss-search-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          :value="searchQuery"
          type="text"
          placeholder="搜索技能..."
          class="ss-search-input"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @keyup.enter="onSearchEnter"
        />
        <button v-if="searchQuery" class="ss-search-clear" @click="emit('clear-search')">×</button>
        <button class="ss-search-btn" @click="onSearchClick">搜索</button>
      </div>
    </div>
  </div>

  <div v-if="activePresetId === 'skills-sh' && !searchActive" class="filter-tabs">
    <button
      v-for="f in skillsSh.LEADERBOARD_FILTERS"
      :key="f.key"
      class="tab-btn"
      :class="{ active: leaderboardFilter === f.key }"
      @click="emit('update:leaderboardFilter', f.key)"
    >
      {{ f.label }}
    </button>
  </div>
  <div v-else-if="activePresetId !== 'skills-sh'" class="filter-tabs">
    <button class="tab-btn" :class="{ active: filterTab === 'all' }" @click="emit('update:filterTab', 'all')">
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
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      全部
      <span class="tab-count">{{ categoryCounts.all }}</span>
    </button>
    <button
      v-for="cat in ALL_CATEGORIES"
      :key="cat"
      class="tab-btn"
      :class="{ active: filterTab === cat }"
      @click="emit('update:filterTab', cat)"
    >
      <UiIcon :name="CATEGORY_ICONS[cat]" :size="14" /> {{ SKILL_CATEGORIES[cat].label }}
      <span class="tab-count">{{ categoryCounts[cat] || 0 }}</span>
    </button>
  </div>
</template>

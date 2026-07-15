<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { getAvatarColor } from '../utils/color'
import ProviderIcon from './ProviderIcon.vue'
import UiIcon, { type UiIconName } from './UiIcon.vue'
import { findPlatformById, platformDisplayIcon } from '../data/platforms'

const props = withDefaults(
  defineProps<{
    name: string
    description?: string
    shortDescription?: string
    loadingDescription?: boolean
    selected?: boolean
    showBatchCheckbox?: boolean
    showActions?: boolean
    actionsAlwaysVisible?: boolean
    showPlatformIcons?: boolean
    installedPlatforms?: string[]
    avatarIcon?: string
    sourceTag?: { label: string; icon: string; color: string; bg: string } | null
    extraSourceTag?: { label: string; color: string; bg: string } | null
    categoryTag?: { label: string; icon: UiIconName } | null
    showChineseTag?: boolean
    showTranslatedTag?: boolean
    badges?: { text: string; type: string }[]
    duplicateBadge?: { count: number } | null
    showSymlinkBadge?: boolean
    descriptionError?: boolean
    emptyDescriptionReason?: string
  }>(),
  {
    description: '',
    loadingDescription: false,
    descriptionError: false,
    emptyDescriptionReason: '描述暂未返回',
    selected: false,
    showBatchCheckbox: false,
    showActions: true,
    actionsAlwaysVisible: false,
    showPlatformIcons: false,
    installedPlatforms: () => [],
    avatarIcon: '',
    sourceTag: null,
    extraSourceTag: null,
    categoryTag: null,
    showChineseTag: false,
    showTranslatedTag: false,
    badges: () => [],
    duplicateBadge: null,
    showSymlinkBadge: false,
  },
)

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
  (e: 'select'): void
}>()

const avatarColor = computed(() => getAvatarColor(props.name))
const avatarLetter = computed(() => props.name?.charAt(0)?.toUpperCase() || '?')

const hasTwoRows = computed(() => props.installedPlatforms.length > iconRowCount.value)

function platformIconKey(platformId: string): string {
  return platformDisplayIcon(findPlatformById(platformId) || { id: platformId })
}

const iconsContainerRef = ref<HTMLElement | null>(null)
const iconRowCount = ref(6)

function updateIconRowCount() {
  if (!iconsContainerRef.value) return
  const w = iconsContainerRef.value.clientWidth
  if (w <= 0) return
  iconRowCount.value = Math.max(1, Math.floor((w + 4) / 20))
}

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!props.showPlatformIcons) return
  nextTick(() => {
    if (iconsContainerRef.value) {
      updateIconRowCount()
      ro = new ResizeObserver(updateIconRowCount)
      ro.observe(iconsContainerRef.value)
    }
  })
})
onUnmounted(() => {
  ro?.disconnect()
})

watch(
  () => props.installedPlatforms,
  () => {
    if (props.showPlatformIcons) nextTick(updateIconRowCount)
  },
)
</script>

<template>
  <div class="skill-card" :class="{ selected }" @click="emit('click', $event)">
    <div v-if="showBatchCheckbox" class="card-checkbox" @click.stop="emit('select')">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" :fill="selected ? 'currentColor' : 'none'" />
        <polyline v-if="selected" points="9 11 12 14 22 4" />
      </svg>
    </div>
    <div class="card-top-row">
      <div class="card-top-left-group">
        <div v-if="avatarIcon" class="card-avatar-icon">
          <ProviderIcon :icon="avatarIcon" :size="22" />
        </div>
        <div v-else class="card-avatar" :style="{ background: avatarColor }">
          {{ avatarLetter }}
        </div>
        <div v-if="$slots['top-left']" class="card-top-left-slot">
          <slot name="top-left" />
        </div>
      </div>
      <div
        v-if="showPlatformIcons && installedPlatforms.length"
        ref="iconsContainerRef"
        class="card-platform-icons"
        :class="{ 'two-rows': hasTwoRows }"
      >
        <div class="icons-row icons-row-first">
          <ProviderIcon
            v-for="p in installedPlatforms.slice(0, iconRowCount)"
            :key="'pi-' + p"
            :icon="platformIconKey(p)"
            :size="16"
            variant="mono"
          />
        </div>
        <div v-if="installedPlatforms.length > iconRowCount" class="icons-row icons-row-second">
          <ProviderIcon
            v-for="p in installedPlatforms.slice(iconRowCount)"
            :key="'pi-' + p"
            :icon="platformIconKey(p)"
            :size="16"
            variant="mono"
          />
        </div>
      </div>
      <div class="card-top-right">
        <div class="card-badges-row">
          <slot name="badges">
            <template v-if="sourceTag">
              <span class="card-tag source-tag" :style="{ background: sourceTag.bg, color: sourceTag.color }">
                <svg
                  v-if="sourceTag.icon === 'multi'"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <svg
                  v-else-if="sourceTag.icon === 'git'"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                  <line x1="6" y1="9" x2="6" y2="21" />
                </svg>
                <ProviderIcon v-else-if="sourceTag.icon" :icon="sourceTag.icon" :size="10" />
                <svg
                  v-else
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {{ sourceTag.label }}
              </span>
            </template>
            <template v-if="categoryTag">
              <span class="card-tag category-tag"><UiIcon :name="categoryTag.icon" :size="12" /> {{ categoryTag.label }}</span>
            </template>
            <span v-if="showChineseTag" class="card-tag chinese-tag">中文</span>
            <span v-if="showTranslatedTag" class="card-tag translated-tag">译</span>
            <template v-for="badge in badges" :key="badge.type">
              <span class="card-tag" :class="'badge-' + badge.type">{{ badge.text }}</span>
            </template>
            <span v-if="duplicateBadge" class="card-tag badge-duplicate">x{{ duplicateBadge.count }}</span>
            <span v-if="showSymlinkBadge" class="card-tag badge-symlink">软链接</span>
          </slot>
          <template v-if="extraSourceTag">
            <span class="card-tag source-tag" :style="{ background: extraSourceTag.bg, color: extraSourceTag.color }">{{
              extraSourceTag.label
            }}</span>
          </template>
          <slot name="extra-badges" />
        </div>
        <div v-if="showActions" class="card-actions" :class="{ always: actionsAlwaysVisible }">
          <slot name="actions" />
        </div>
      </div>
    </div>
    <h3 class="card-name">
      {{ name }}
    </h3>
    <p v-if="loadingDescription && !shortDescription && !description" class="card-desc">
      <span class="desc-shimmer" />
    </p>
    <p v-else-if="descriptionError && !shortDescription && !description" class="card-desc card-desc-error">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      加载失败，点击重试
    </p>
    <p v-else class="card-desc">
      {{ description || shortDescription || emptyDescriptionReason }}
    </p>
    <slot name="after-desc" />
  </div>
</template>

<style scoped>
.skill-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  position: relative;
  min-height: 120px;
}

.skill-card:hover {
  border-color: hsl(var(--primary) / 0.4);
  box-shadow: var(--shadow-sm);
}

.skill-card.selected {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.03);
}

.card-checkbox {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: hsl(var(--card));
  border: 1.5px solid hsl(var(--border));
  color: hsl(var(--primary));
  transition: all var(--duration-base) var(--ease-standard);
  z-index: 2;
}

.card-checkbox:hover {
  border-color: hsl(var(--primary) / 0.5);
}

.skill-card.selected .card-checkbox {
  border-color: hsl(var(--primary));
}

.card-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4px;
  margin-bottom: 16px;
}

.card-top-left-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.card-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.card-top-left-slot {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.card-avatar-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: hsl(var(--muted));
  overflow: hidden;
}

.card-avatar-icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

[data-theme='dark'] .card-avatar-icon img {
  filter: invert(1);
}

.card-platform-icons {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.two-rows.card-platform-icons {
  margin-right: auto;
}

.icons-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.icons-row-first {
  justify-content: flex-end;
}

.icons-row-second {
  flex-wrap: nowrap;
}

.two-rows .icons-row-first {
  justify-content: flex-start;
}

.two-rows .icons-row-second {
  justify-content: flex-start;
}

.card-top-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
  position: relative;
}

.card-actions {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-base) var(--ease-standard);
}

.card-actions.always {
  position: relative;
  top: auto;
  right: auto;
  margin-top: 0;
  opacity: 1;
  pointer-events: auto;
}

.skill-card:hover .card-actions:not(.always) {
  opacity: 1;
  pointer-events: auto;
}

.card-badges-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.card-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.card-tag.source-tag {
  border: none;
}

.card-tag .tag-icon-svg {
  display: inline-flex;
  align-items: center;
}

.card-tag .tag-icon-svg :deep(svg) {
  width: 10px;
  height: 10px;
}

.card-tag.category-tag {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.card-tag.chinese-tag {
  background: hsl(0 70% 50% / 0.1);
  color: hsl(0 70% 50%);
}

.card-tag.translated-tag {
  background: hsl(160 70% 40% / 0.1);
  color: hsl(160 70% 35%);
}

.card-tag.badge-local {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.card-tag.badge-managed {
  background: hsl(142 40% 92%);
  color: hsl(142 50% 35%);
}

.card-tag.badge-source {
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.card-tag.badge-symlink {
  background: hsl(200 60% 90%);
  color: hsl(200 70% 30%);
}

.card-tag.badge-duplicate {
  background: hsl(38 80% 92%);
  color: hsl(38 80% 35%);
}

.card-tag.badge-downloaded-elsewhere {
  background: hsl(38 80% 92%);
  color: hsl(38 80% 35%);
}

.card-tag.badge-github {
  background: hsl(210 40% 92%);
  color: hsl(210 50% 35%);
  border: 1px solid hsl(210 40% 85%);
}

.card-tag.badge-website {
  background: hsl(150 40% 92%);
  color: hsl(150 50% 30%);
  border: 1px solid hsl(150 40% 82%);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  max-height: 0;
  overflow: visible;
  opacity: 0;
  pointer-events: none;
  transition: all var(--duration-base) var(--ease-standard);
}

.card-actions.always {
  max-height: 26px;
  margin-top: 4px;
  opacity: 1;
  pointer-events: auto;
}

.skill-card:hover .card-actions {
  max-height: 26px;
  margin-top: 4px;
  opacity: 1;
  pointer-events: auto;
}

:deep(.card-action-btn) {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}

:deep(.card-action-btn:hover) {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

:deep(.card-action-btn:disabled) {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

:deep(.card-action-btn.filled) {
  color: hsl(45 90% 55%);
}

:deep(.card-action-btn.primary:hover) {
  color: hsl(var(--primary));
}

:deep(.card-action-btn.danger:hover) {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

:deep(.card-action-btn.download) {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

:deep(.card-action-btn.download:hover) {
  opacity: 0.9;
}

:deep(.card-action-btn.download:disabled) {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  cursor: default;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--duration-base) var(--ease-standard);
}

.skill-card:hover .card-name {
  color: hsl(var(--primary));
}

.card-desc {
  font-size: 12px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 36px;
}

.card-desc-error {
  display: flex;
  align-items: center;
  gap: 4px;
  color: hsl(var(--destructive));
  cursor: pointer;
}

.card-desc-error:hover {
  text-decoration: underline;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.desc-shimmer {
  display: block;
  height: 12px;
  width: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, hsl(var(--border)) 25%, hsl(var(--muted)) 50%, hsl(var(--border)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
</style>

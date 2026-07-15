<script setup lang="ts">
import { computed } from 'vue'
import type { Skill } from '../types'
import SkillCard from './SkillCard.vue'
import { isWellKnownSkill } from '../utils/well-known'
import { isChineseContent } from '../utils/translate'

const props = withDefaults(
  defineProps<{
    skill: Skill
    loadingDescription?: boolean
    descriptionError?: boolean
    badges?: { text: string; type: string }[]
    sourceTag?: { label: string; icon: string; color: string; bg: string } | null
    showLanguageTags?: boolean
    showTranslatedTag?: boolean
    mode?: 'available' | 'imported'
    isDownloaded?: boolean
    isDownloading?: boolean
    skillUrl?: string
    emptyDescriptionReason?: string
  }>(),
  {
    loadingDescription: false,
    descriptionError: false,
    badges: () => [],
    sourceTag: null,
    showLanguageTags: false,
    showTranslatedTag: false,
    mode: 'available',
    isDownloaded: false,
    isDownloading: false,
    skillUrl: undefined,
    emptyDescriptionReason: '索引暂未返回描述',
  },
)

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'download', event: MouseEvent): void
  (e: 'delete'): void
  (e: 'locate'): void
}>()

const extraSourceTag = computed(() => {
  if (isWellKnownSkill(props.skill)) {
    return { label: 'Web', color: 'hsl(150 50% 30%)', bg: 'hsl(150 40% 92%)' }
  }
  if (props.skill.repo) {
    return { label: 'Git', color: 'hsl(210 50% 35%)', bg: 'hsl(210 40% 92%)' }
  }
  return null
})

const showChineseTag = computed(() => props.showLanguageTags && isChineseContent(props.skill.description || ''))
</script>

<template>
  <SkillCard
    :data-skill-id="skill.id"
    :name="skill.name"
    :description="skill.description"
    :short-description="skill.shortDescription"
    :loading-description="loadingDescription"
    :description-error="descriptionError"
    :empty-description-reason="emptyDescriptionReason"
    :avatar-icon="skill.iconUrl"
    :badges="badges"
    :source-tag="sourceTag"
    :extra-source-tag="mode === 'imported' ? null : extraSourceTag"
    :show-chinese-tag="showChineseTag"
    :show-translated-tag="showLanguageTags && showTranslatedTag"
    @click="emit('click')"
  >
    <template #actions>
      <a v-if="skillUrl" :href="skillUrl" target="_blank" class="card-action-btn" title="打开链接" @click.stop>
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
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
      <button
        v-if="mode === 'imported' || isDownloaded"
        class="card-action-btn"
        title="前往我的 Skill"
        @click.stop="emit('locate')"
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
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
      <button
        v-if="mode === 'imported'"
        class="card-action-btn danger"
        title="删除"
        @click.stop="emit('delete')"
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
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
      <button
        v-else-if="!isDownloaded"
        class="card-action-btn"
        :disabled="isDownloading"
        @click.stop="emit('download', $event)"
      >
        <svg
          v-if="isDownloading"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="spin"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </template>
  </SkillCard>
</template>

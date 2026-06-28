<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storage } from '../utils/storage'
import { useTranslationQueue } from '../composables/useTranslationQueue'
import { translateContent, translateDescription, isChineseContent } from '../utils/translate'
import type { Skill } from '../types'

const emit = defineEmits<{
  close: []
  'navigate': [route: string]
}>()

const props = defineProps<{
  currentRoute?: string
  currentSkills?: Skill[]
}>()

const { queue, addTranslation, removeTranslation, isTranslating: isTranslatingInQueue } = useTranslationQueue()

const skills = ref<Skill[]>([])
const translationProgress = ref<Record<string, { desc: boolean; content: boolean }>>({})
const downloadVersion = ref(0)
const translateScope = ref<'current' | 'all'>('all')
const translateType = ref<'desc' | 'content' | 'both'>('both')

function loadSkills() {
  const cachedSkills = storage.getCachedSkills()
  skills.value = cachedSkills
}

onMounted(() => loadSkills())

watch(downloadVersion, () => loadSkills())

function isSkillTranslating(skillId: string) {
  return isTranslatingInQueue(skillId, 'desc') || isTranslatingInQueue(skillId, 'content')
}

const translationModel = computed(() => {
  const settings = storage.getSettings()
  if (!settings.translationModelId) return null
  const providers = settings.aiModels || []
  for (const provider of providers) {
    if (provider.models) {
      const model = provider.models.find(m => m.id === settings.translationModelId)
      if (model) return model
    }
  }
  return null
})

const filteredSkills = computed(() => {
  if (translateScope.value === 'all') {
    return skills.value
  }
  // For 'current' scope, return current page skills if provided
  return props.currentSkills || skills.value
})

async function translateSkill(skill: Skill) {
  if (!translationModel.value) {
    console.error('AI model not configured')
    return
  }

  if (isSkillTranslating(skill.id)) return

  try {
    // 翻译描述
    if (translateType.value === 'desc' || translateType.value === 'both') {
      const desc = skill.description
      if (desc && !isChineseContent(desc)) {
        addTranslation(skill.id, skill.name, 'desc')
        const translatedDesc = await translateDescription(desc, translationModel.value)
        storage.saveTranslationDesc(skill.id, translatedDesc)
        removeTranslation(skill.id, 'desc')
      }
    }

    // 翻译内容
    if (translateType.value === 'content' || translateType.value === 'both') {
      const skillFile = ['SKILL.md', 'skill.md'].find(f =>
        window.services.pathExists(window.services.pathJoin(skill.path || '', f))
      )
      if (skillFile) {
        const content = window.services.readFile(window.services.pathJoin(skill.path || '', skillFile))
        if (content && !isChineseContent(content)) {
          addTranslation(skill.id, skill.name, 'content')
          const translatedContent = await translateContent(content, translationModel.value, 'immersive')
          storage.saveTranslation(skill.id, {
            sourceContent: content,
            translatedContent,
            mode: 'immersive'
          })
          removeTranslation(skill.id, 'content')
        }
      }
    }
  } catch (error) {
    console.error('Translation failed:', error)
  }
}

async function translateAll() {
  const pending = skills.value.filter(s => !isSkillTranslating(s.id))
  const concurrency = 2
  let index = 0

  async function runNext(): Promise<void> {
    if (index >= pending.length) return
    const skill = pending[index++]
    await translateSkill(skill)
    await runNext()
  }

  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => runNext())
  await Promise.all(workers)
}

function getTranslationStatus(skill: Skill): 'pending' | 'translating' | 'done' {
  if (isSkillTranslating(skill.id)) return 'translating'

  const descTranslated = storage.getTranslationDesc(skill.id)
  const contentTranslated = storage.getTranslation(skill.id)

  if (descTranslated || contentTranslated) return 'done'
  return 'pending'
}
</script>

<template>
  <div class="translate-panel-overlay" @click.self="emit('close')">
    <div class="translate-panel">
      <div class="panel-header">
        <h3 class="panel-title">批量翻译</h3>
        <button class="panel-close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="panel-content">
        <div class="panel-scope">
          <label class="scope-option">
            <input type="radio" v-model="translateScope" value="all" />
            <span>所有技能</span>
          </label>
          <label class="scope-option">
            <input type="radio" v-model="translateScope" value="current" />
            <span>当前页面技能</span>
          </label>
        </div>

        <div class="panel-type">
          <label class="type-option">
            <input type="radio" v-model="translateType" value="desc" />
            <span>描述</span>
          </label>
          <label class="type-option">
            <input type="radio" v-model="translateType" value="content" />
            <span>内容</span>
          </label>
          <label class="type-option">
            <input type="radio" v-model="translateType" value="both" />
            <span>描述和内容</span>
          </label>
        </div>

        <div class="panel-actions">
          <button class="translate-all-btn" @click="translateAll" :disabled="queue.length > 0 || !translationModel">
            {{ queue.length > 0 ? '翻译中...' : '翻译所有' }}
          </button>
          <p v-if="!translationModel" class="no-model-hint">请先在设置中配置翻译模型</p>
        </div>

        <div v-if="filteredSkills.length === 0" class="empty-state">
          暂无已下载的技能
        </div>

        <div v-else class="skills-grid">
          <div v-for="skill in filteredSkills" :key="skill.id" class="skill-item">
            <div class="skill-info">
              <div class="skill-name">{{ skill.name }}</div>
              <div class="skill-status" :class="getTranslationStatus(skill)">
                <span v-if="getTranslationStatus(skill) === 'pending'">待翻译</span>
                <span v-else-if="getTranslationStatus(skill) === 'translating'">翻译中...</span>
                <span v-else>已完成</span>
              </div>
            </div>
            <button
              class="translate-btn"
              @click="translateSkill(skill)"
              :disabled="isSkillTranslating(skill.id) || !translationModel"
            >
              {{ isSkillTranslating(skill.id) ? '翻译中' : '翻译' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.translate-panel-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  padding: 20px;
}

.translate-panel {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  width: 560px;
  max-width: 90vw;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.panel-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}

.panel-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.panel-scope {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.scope-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.scope-option input[type="radio"] {
  margin: 0;
}

.panel-type {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.type-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.type-option input[type="radio"] {
  margin: 0;
}

.panel-actions {
  margin-bottom: 16px;
}

.translate-all-btn {
  width: 100%;
  padding: 10px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground, #fff));
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.translate-all-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.translate-all-btn:disabled {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  cursor: not-allowed;
}

.no-model-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin: 8px 0 0;
}

.empty-state {
  text-align: center;
  padding: 32px 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.skill-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: hsl(var(--muted) / 0.5);
  border-radius: 8px;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name {
  font-weight: 600;
  font-size: 13px;
  color: hsl(var(--foreground));
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-status {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.skill-status.pending {
  color: hsl(38 92% 50%);
}

.skill-status.translating {
  color: hsl(217 91% 60%);
}

.skill-status.done {
  color: hsl(160 84% 39%);
}

.translate-btn {
  padding: 6px 12px;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}

.translate-btn:hover:not(:disabled) {
  background: hsl(var(--muted) / 0.7);
}

.translate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

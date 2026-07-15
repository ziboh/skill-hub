<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SkillScanResult } from '../types'
import { getAllPlatformDefinitions, platformDisplayIcon, findPlatformById } from '../data/platforms'
import ProviderIcon from './ProviderIcon.vue'

const props = defineProps<{
  skillName: string
  skills: SkillScanResult[]
}>()

const emit = defineEmits<{
  (e: 'confirm', selected: SkillScanResult[]): void
  (e: 'cancel'): void
}>()

const hasDuplicates = computed(() => props.skills.length > 1)

const selectedDirs = ref<Set<string>>(hasDuplicates.value ? new Set(props.skills.map((s) => s.dir)) : new Set([props.skills[0]?.dir]))

const allSelected = computed(() => props.skills.every((s) => selectedDirs.value.has(s.dir)))

function getPlatformId(dir: string): string {
  const normalized = dir.replace(/\\/g, '/').toLowerCase()
  for (const p of getAllPlatformDefinitions()) {
    const pp = (p.projectPath || p.customProjectPath || '').replace(/\\/g, '/').toLowerCase()
    if (pp && normalized.includes(pp)) return p.id
    const gp = (p.customPath || p.defaultPath || '').replace(/^~/, '').replace(/\\/g, '/').toLowerCase()
    if (gp && normalized.includes(gp.replace(/\/$/, ''))) return p.id
  }
  if (normalized.includes('.agents/skills')) return '_generic'
  return ''
}

function getPlatformName(dir: string): string {
  const id = getPlatformId(dir)
  if (id && id !== '_generic') return findPlatformById(id)?.name || id
  if (dir.replace(/\\/g, '/').toLowerCase().includes('.agents/skills')) return 'Generic Agent'
  return dir.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
}

function getPlatformIconForDir(dir: string): string {
  const id = getPlatformId(dir)
  if (!id) return '_generic'
  const p = findPlatformById(id)
  return p ? platformDisplayIcon(p) : id
}

function toggleAll() {
  if (allSelected.value) {
    selectedDirs.value = new Set()
  } else {
    selectedDirs.value = new Set(props.skills.map((s) => s.dir))
  }
}

function toggleDir(dir: string) {
  const next = new Set(selectedDirs.value)
  if (next.has(dir)) next.delete(dir)
  else next.add(dir)
  selectedDirs.value = next
}

function confirm() {
  const selected = props.skills.filter((s) => selectedDirs.value.has(s.dir))
  if (selected.length === 0) return
  emit('confirm', selected)
}
</script>

<template>
  <div class="confirm-overlay">
    <div class="confirm-modal">
      <div class="confirm-header">
        <div class="confirm-icon">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </div>
        <h3 class="confirm-title">删除 Skill</h3>
        <button class="confirm-close" @click="emit('cancel')">
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="confirm-body">
        <template v-if="!hasDuplicates">
          <p class="confirm-desc">
            确定要删除 <strong>{{ skillName }}</strong> 吗？此操作将从项目中移除相关文件和分发记录。
          </p>
        </template>
        <template v-else>
          <p class="confirm-desc">
            <strong>{{ skillName }}</strong> 在项目中有 {{ skills.length }} 个副本，选择要删除的：
          </p>
          <div class="skill-select-header">
            <span class="skill-select-label">选择要删除的副本</span>
            <button class="skill-select-all" @click="toggleAll">
              {{ allSelected ? '取消全选' : '全选' }}
            </button>
          </div>
          <div class="skill-select-list">
            <label v-for="s in skills" :key="s.dir" class="skill-select-item" :class="{ checked: selectedDirs.has(s.dir) }">
              <input type="checkbox" :checked="selectedDirs.has(s.dir)" class="skill-checkbox" @change="toggleDir(s.dir)" />
              <ProviderIcon v-if="getPlatformId(s.dir)" :icon="getPlatformIconForDir(s.dir)" :size="18" variant="mono" />
              <span class="skill-platform-name">{{ getPlatformName(s.dir) }}</span>
            </label>
          </div>
        </template>
      </div>

      <div class="confirm-footer">
        <button class="confirm-btn cancel" @click="emit('cancel')">取消</button>
        <button class="confirm-btn delete" :disabled="selectedDirs.size === 0" @click="confirm">
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
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          {{ hasDuplicates ? `删除 ${selectedDirs.size} 个副本` : '删除' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}
.confirm-modal {
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 64px hsl(0 0% 0% / 0.2);
  display: flex;
  flex-direction: column;
}

.confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  border-bottom: 1px solid hsl(var(--border));
}
.confirm-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.confirm-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin: 0;
  flex: 1;
}
.confirm-close {
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
.confirm-close:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.confirm-body {
  padding: 18px 20px;
  overflow-y: auto;
  flex: 1;
}
.confirm-desc {
  font-size: 13px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  margin: 0;
}
.confirm-desc :deep(strong) {
  color: hsl(var(--foreground));
  font-weight: 600;
}

.skill-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  margin-bottom: 6px;
}
.skill-select-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
.skill-select-all {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--primary));
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.skill-select-all:hover {
  opacity: 0.7;
}

.skill-select-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}
.skill-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.skill-select-item:hover {
  border-color: hsl(var(--primary) / 0.3);
}
.skill-select-item.checked {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.04);
}
.skill-checkbox {
  accent-color: hsl(var(--primary));
}
.skill-platform-name {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid hsl(var(--border));
}
.confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-base) var(--ease-standard);
}
.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.confirm-btn.cancel {
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}
.confirm-btn.cancel:hover {
  background: hsl(var(--muted) / 0.8);
}
.confirm-btn.delete {
  background: hsl(var(--destructive));
  color: #fff;
}
.confirm-btn.delete:not(:disabled):hover {
  opacity: 0.9;
}
</style>

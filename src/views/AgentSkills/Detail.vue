<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import { KeyShowToast, KeyRefreshCounts } from '../../inject-keys'
import { getAllPlatformDefinitions, findPlatformById, getPlatformPath, platformDisplayIcon } from '../../data/platforms'
import { storage } from '../../utils/storage'
import { normalizePath } from '../../utils/path'
import SkillDetailBase from '../../components/SkillDetailBase.vue'
import ProviderIcon from '../../components/ProviderIcon.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import type { SkillScanResult, Skill } from '../../types'
import { importScanResultToMySkills } from '../../utils/skill-import'
import { uninstallPathAndRecord } from '../../utils/skill-install-status'
import { formatSkillLifecycleWarnings } from '../../utils/skill-lifecycle'

const props = defineProps<{ skill: SkillScanResult | null; platformId: string; duplicateSkills?: SkillScanResult[] | null }>()
const emit = defineEmits(['navigate'])
const showToast = inject(KeyShowToast, () => {})
const refreshCounts = inject(KeyRefreshCounts, () => {})

const activeTab = ref<'preview' | 'source' | 'files'>('preview')
const skillContent = ref('')
const skillDesc = ref('')
const skillName = ref('')
const isEditing = ref(false)
const editedInstructions = ref('')
const copyStatus = ref<Record<string, boolean>>({})
let copyTimers: Record<string, ReturnType<typeof setTimeout>> = {}

onUnmounted(() => {
  Object.values(copyTimers).forEach(clearTimeout)
})

// Selected skill among duplicates
const selectedDuplicateIndex = ref(0)
const selectedDir = ref('')

const activeSkill = computed<SkillScanResult | null>(() => {
  if (!props.skill) return null
  const idx = selectedDuplicateIndex.value
  const sorted = duplicatesForDropdown.value
  if (sorted.length > 1 && idx >= 0 && idx < sorted.length) {
    return sorted[idx]
  }
  if (sorted.length > 0) {
    return sorted[0]
  }
  return props.skill
})

const duplicatesForDropdown = computed(() => {
  const duplicates = props.duplicateSkills
  if (!duplicates) return [props.skill].filter(Boolean) as SkillScanResult[]
  return [...duplicates].sort((a, b) => {
    const aGeneric = (a.dir || '').replace(/\\/g, '/').toLowerCase().includes('.agents/skills') ? 0 : 1
    const bGeneric = (b.dir || '').replace(/\\/g, '/').toLowerCase().includes('.agents/skills') ? 0 : 1
    return aGeneric - bGeneric
  })
})

function getPlatformIdFromDir(dir: string): string {
  if (props.platformId) return props.platformId
  const normalized = dir.replace(/\\/g, '/').toLowerCase()
  if (!normalized) return '_generic'
  for (const p of getAllPlatformDefinitions()) {
    const pp = (p.projectPath || p.customProjectPath || '').replace(/\\/g, '/').toLowerCase()
    if (pp && normalized.includes(pp)) return p.id
    const gp = (p.customPath || p.defaultPath || '').replace(/^~/, '').replace(/\\/g, '/').toLowerCase()
    if (gp && normalized.includes(gp.replace(/\/$/, ''))) return p.id
  }
  return '_generic'
}

const detectedPlatformId = computed(() => getPlatformIdFromDir(activeSkill.value?.dir || ''))

watch(
  duplicatesForDropdown,
  (list) => {
    if (!selectedDir.value) {
      selectedDuplicateIndex.value = 0
      return
    }
    const idx = list.findIndex((d) => d.dir === selectedDir.value)
    selectedDuplicateIndex.value = idx >= 0 ? idx : 0
  },
  { immediate: true },
)

const duplicateCount = computed(() => duplicatesForDropdown.value.length)

function getDirLabel(s: SkillScanResult, index: number): string {
  const dir = s.dir || ''
  const normalized = dir.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts.slice(-4).join('/') || `路径 ${index + 1}`
}

function switchDuplicate(index: number) {
  if (index === selectedDuplicateIndex.value) return
  selectedDuplicateIndex.value = index
  selectedDir.value = duplicatesForDropdown.value[index]?.dir || ''
  loadSkillContentForActive()
  checkImported()
}

function stripFrontmatter(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('---')) return trimmed
  const endIdx = trimmed.indexOf('---', 3)
  if (endIdx === -1) return trimmed
  return trimmed.slice(endIdx + 3).trim()
}

function loadSkillContentForActive() {
  const s = activeSkill.value
  if (!s) return
  skillContent.value = stripFrontmatter(s.content || '')
  skillDesc.value = s.manifest?.description || ''
  skillName.value = s.manifest?.name || s.name
  editedInstructions.value = skillContent.value
}

const _distributeRecords = computed(() => {
  if (!activeSkill.value || !props.platformId) return []
  const skillDir = normalizePath(activeSkill.value.dir || '')
  return storage.getDistributedForPlatform(props.platformId).filter((r) => normalizePath(r.targetPath) === skillDir)
})

const platform = computed(() => {
  if (!props.platformId) return null
  return findPlatformById(props.platformId) || null
})

// Convert active SkillScanResult to Skill type for SkillDetailBase
const skill = computed<Skill | null>(() => {
  const s = activeSkill.value
  if (!s) return null
  const manifest = s.manifest
  const id = props.platformId ? `${props.platformId}/${s.name}` : manifest?.name || s.name
  const cachedSkills = storage.getDownloadedSkills()
  // 先通过ID查找，如果找不到则通过name查找（同步分发后的收藏状态）
  let downloaded = cachedSkills.find((d) => d.id === id)
  if (!downloaded) {
    const normalizedName = (manifest?.name || s.name || '').toLowerCase()
    downloaded = cachedSkills.find((d) => d.name && d.name.toLowerCase() === normalizedName)
  }
  return {
    id,
    name: manifest?.name || s.name,
    description: manifest?.description || '',
    author: manifest?.author || '未知',
    tags: manifest?.tags || [],
    language: manifest?.language || 'en',
    source: 'local',
    path: s.dir,
    readme: s.content || '',
    storeSourceId: props.platformId ? `agent:${props.platformId}` : undefined,
    isFavorited: downloaded?.isFavorited || false,
  }
})

const isFavorited = computed(() => currentFavoriteState.value)
const isImported = computed(() => isInMySkills.value)

onMounted(() => {
  loadSkillContentForActive()
  checkImported()
})

watch(
  () => props.skill,
  () => {
    activeTab.value = 'preview'
    selectedDuplicateIndex.value = 0
    selectedDir.value = ''
    loadSkillContentForActive()
    checkImported()
  },
)

// 当前显示的收藏状态（用于在toggleFavorite后立即更新UI）
const currentFavoriteState = ref<boolean>(false)

// 监听skill变化，同步收藏状态
watch(
  () => skill.value,
  (newSkill) => {
    if (newSkill) {
      currentFavoriteState.value = newSkill.isFavorited ?? false
    }
  },
  { immediate: true },
)

function toggleFavorite() {
  if (!skill.value) return
  // 记录当前收藏状态，toggleFavorite会翻转它
  const wasFavorited = currentFavoriteState.value
  storage.toggleFavorite(skill.value.id, {
    name: skill.value.name,
    description: skill.value.description,
    author: skill.value.author,
    tags: skill.value.tags,
    source: skill.value.source,
  })
  // 手动更新当前显示的状态
  currentFavoriteState.value = !wasFavorited
  refreshCounts()
}

const getSkillDirPath = computed(() => {
  const s = activeSkill.value
  if (!s) return ''
  const dir = getSkillDir()
  return dir ? window.services.pathJoin(dir, s.name) : ''
})

function getSkillDir(): string {
  if (platform.value) {
    return (getPlatformPath(platform.value, 'global') || getPlatformPath(platform.value, 'project') || '').replace(
      /^~/,
      window.services.homeDir(),
    )
  }
  const s = activeSkill.value
  if (s?.dir) {
    const parts = s.dir.replace(/\\/g, '/').split('/')
    parts.pop()
    return parts.join('/')
  }
  return ''
}

function getSourceLabel(): string {
  if (platform.value) return platform.value?.name || '外部'
  return '项目'
}

function openLocalFolder() {
  const dir = getSkillDir()
  const s = activeSkill.value
  const name = s?.name || ''
  if (dir) window.services.openFolder(window.services.pathJoin(dir, name))
}

function uninstallSkill() {
  const s = activeSkill.value
  if (!s) return
  const targetPath = window.services.pathJoin(getSkillDir(), s.name)
  try {
    const records = storage.getDistributeRecords().filter((r) => r.targetPath.replace(/\\/g, '/') === targetPath.replace(/\\/g, '/'))
    if (records.length) {
      for (const r of records) {
        const result = uninstallPathAndRecord({
          targetPath: r.targetPath,
          skillId: r.skillId,
          skillName: s.name,
          platformId: r.platformId,
          scope: r.scope,
        })
        if (!result.ok) throw new Error(result.error || '请检查文件权限')
        const warning = formatSkillLifecycleWarnings('uninstall', result.warnings)
        if (warning) showToast({ type: 'warning', message: warning })
      }
    } else {
      window.services.removeFile(targetPath)
    }
    emit('navigate', props.platformId ? 'agent-skills' : 'project-skills', props.platformId ? { platformId: props.platformId } : undefined)
    showToast({ type: 'success', message: '已删除' })
  } catch (err: any) {
    showToast({ type: 'error', message: '删除失败: ' + err.message })
  }
}

const importing = ref(false)
const confirmDelete = ref(false)
const isInMySkills = ref(false)
const isSourceFile = ref(false)

function checkImported() {
  const s = activeSkill.value
  if (!s) return
  isInMySkills.value = false
  isSourceFile.value = false

  const skillDir = normalizePath(s.dir || '')
  if (!skillDir) return

  const cachedSkills = storage.getDownloadedSkills()
  const downloadedIds = storage.getDownloadedIds()
  const byPath = cachedSkills.find((c) => downloadedIds.includes(c.id) && normalizePath(c.path || '') === skillDir)
  if (byPath && byPath.source === 'local') {
    isSourceFile.value = true
    isInMySkills.value = true
    return
  }

  const hasDistribute = storage.getDistributeRecords().some((r) => normalizePath(r.targetPath) === skillDir)
  if (hasDistribute) {
    isInMySkills.value = true
  }
}

async function importToMySkills() {
  const s = activeSkill.value
  if (!s || !skill.value) return
  importing.value = true
  try {
    const sessionSource = props.platformId ? 'agent' : 'project'
    importScanResultToMySkills({
      skill: s,
      sessionSource,
      location: getSkillDirPath.value || s.dir || '',
      storeSourceId: skill.value.storeSourceId || (s as any)?.storeSourceId,
    })
    isInMySkills.value = true
    isSourceFile.value = true
    showToast({ type: 'success', message: `已将 ${skill.value.name} 导入到我的 Skill` })
  } catch (err: any) {
    showToast({ type: 'error', message: err.message })
  }
  importing.value = false
}

const showImportConfirm = ref(false)

function requestImportToMySkills() {
  if (!isInMySkills.value && !importing.value) showImportConfirm.value = true
}

function handleCopy(text: string, key: string) {
  navigator.clipboard.writeText(text).catch(() => {})
  copyStatus.value[key] = true
  if (copyTimers[key]) clearTimeout(copyTimers[key])
  copyTimers[key] = setTimeout(() => {
    copyStatus.value[key] = false
  }, 2000)
}

function toggleEdit() {
  isEditing.value = true
  editedInstructions.value = skillContent.value
}

function saveContent() {
  skillContent.value = editedInstructions.value
  isEditing.value = false
}

function _getActiveDir(): string {
  const s = activeSkill.value
  return s?.dir || ''
}

// Custom path dropdown
const showPathDropdown = ref(false)
const pathBtnRef = ref<HTMLButtonElement>()
const pathDropdownStyle = ref<Record<string, string>>({})

function togglePathDropdown() {
  if (showPathDropdown.value) {
    showPathDropdown.value = false
    return
  }
  const btn = pathBtnRef.value
  if (btn) {
    const rect = btn.getBoundingClientRect()
    pathDropdownStyle.value = {
      top: `${rect.bottom + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
      minWidth: `${Math.max(rect.width, 200)}px`,
    }
  }
  showPathDropdown.value = true
}

function selectPath(index: number) {
  switchDuplicate(index)
  showPathDropdown.value = false
}
</script>

<template>
  <div v-if="!skill" class="empty">未选择技能</div>
  <template v-else>
    <SkillDetailBase
      v-model:active-tab="activeTab"
      :skill="skill"
      :context="props.platformId ? 'agent' : 'project'"
      :skill-name="skillName"
      :skill-desc="skillDesc"
      :skill-content="skillContent"
      :is-favorited="isFavorited"
      :is-editing="isEditing"
      :edited-content="editedInstructions"
      :copy-status="copyStatus"
      :skill-dir="getSkillDirPath"
      :show-favorite="true"
      :can-favorite="isImported"
      @navigate="emit('navigate', $event)"
      @toggle-favorite="toggleFavorite"
      @copy-content="handleCopy"
      @toggle-edit="toggleEdit"
      @save-content="saveContent"
      @update:edited-content="editedInstructions = $event"
    >
      <template #tab-bar-actions>
        <div v-if="duplicateCount > 1" class="dup-switcher">
          <button ref="pathBtnRef" class="dup-trigger" @click="togglePathDropdown">
            <ProviderIcon
              :icon="platformDisplayIcon(findPlatformById(detectedPlatformId) || { id: detectedPlatformId })"
              :size="14"
              variant="mono"
            />
            <span class="dup-trigger-label">{{ getDirLabel(duplicatesForDropdown[selectedDuplicateIndex], selectedDuplicateIndex) }}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </template>
      <template #header-actions>
        <button class="action-btn" @click="openLocalFolder" title="打开文件夹">
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
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          class="action-btn"
          :class="{ favorited: isFavorited, disabled: !isImported }"
          :disabled="!isImported"
          :title="!isImported ? '下载后可收藏' : isFavorited ? '取消收藏' : '收藏'"
          @click="isImported && toggleFavorite()"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            :fill="isFavorited ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button class="action-btn danger" @click="confirmDelete = true" title="删除">
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
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </template>

      <template #context-panel>
        <div class="platform-panel">
          <div class="section-heading-row">
            <h3 class="section-heading">来源信息</h3>
            <span class="section-badge">{{ getSourceLabel() }}</span>
          </div>

          <div class="agent-source-card" :class="{ source: isSourceFile }">
            <div class="agent-source-icon">
              <ProviderIcon
                :icon="platformDisplayIcon(platform || { id: props.platformId || '_generic' })"
                :size="24"
                variant="mono"
              />
            </div>
            <div class="agent-source-info">
              <div class="agent-source-name">
                {{ platform?.name || '未知' }}
              </div>
              <div class="agent-source-type">复制</div>
            </div>
          </div>

          <div class="project-actions">
            <button v-if="isSourceFile" class="project-action-btn imported-tag" disabled>
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              源文件
            </button>
            <button v-else-if="isInMySkills" class="project-action-btn managed-tag" disabled>
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
                <polyline points="20 6 9 17 4 12" />
              </svg>
              已管理
            </button>
            <button v-else class="project-action-btn primary" :disabled="importing" @click="requestImportToMySkills">
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {{ importing ? '导入中...' : '导入到我的 Skill' }}
            </button>
            <button class="project-action-btn" @click="openLocalFolder">
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
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              打开本地文件夹
            </button>
          </div>
        </div>
      </template>
    </SkillDetailBase>

    <Teleport to="body">
      <div v-if="showPathDropdown" class="dup-overlay" @click="showPathDropdown = false" />
      <div v-if="showPathDropdown" class="dup-dropdown" :style="pathDropdownStyle">
        <button
          v-for="(d, i) in duplicatesForDropdown"
          :key="d.dir"
          class="dup-dropdown-item"
          :class="{ active: i === selectedDuplicateIndex }"
          @click="selectPath(i)"
        >
          <ProviderIcon
            :icon="platformDisplayIcon(findPlatformById(getPlatformIdFromDir(d.dir || '')) || { id: getPlatformIdFromDir(d.dir || '') || '_generic' })"
            :size="16"
            variant="mono"
          />
          <span class="dup-dropdown-label">{{ getDirLabel(d, i) }}</span>
          <svg
            v-if="i === selectedDuplicateIndex"
            class="dup-dropdown-check"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </Teleport>
  </template>

  <ConfirmModal
    v-if="showImportConfirm"
    title="确认导入 Skill"
    :message="`确定要将 <strong>${activeSkill?.name || skill?.name || ''}</strong> 导入到我的 Skill 吗？`"
    confirm-text="导入"
    @confirm="importToMySkills"
    @cancel="showImportConfirm = false"
  />

  <ConfirmModal
    v-if="confirmDelete"
    title="删除 Skill"
    :message="`确定要删除 <strong>${activeSkill?.name}</strong> 吗？此操作不可撤销。`"
    @confirm="uninstallSkill"
    @cancel="confirmDelete = false"
  />
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 60px;
  color: hsl(var(--muted-foreground));
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.action-btn:hover:not(:disabled) {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.action-btn:disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}
.action-btn.danger:hover {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
  background: hsl(var(--destructive) / 0.06);
}
.action-btn.close-btn:hover {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive) / 0.3);
  background: hsl(var(--destructive) / 0.06);
}
.action-btn.favorited {
  color: #f59e0b;
  border-color: hsl(48 96% 50% / 0.4);
}

.platform-panel {
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
}
.section-heading {
  font-size: 11px;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.2em;
}
.section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-heading-row .section-heading {
  margin-bottom: 0;
}
.section-badge {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.agent-source-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  margin-bottom: 12px;
}
.agent-source-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: hsl(var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.agent-source-info {
  flex: 1;
}
.agent-source-name {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.agent-source-type {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.project-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.project-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  width: 100%;
}
.project-action-btn:hover {
  background: hsl(var(--muted));
}
.project-action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.project-action-btn.primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}
.project-action-btn.primary:hover {
  opacity: 0.9;
}
.project-action-btn.managed-tag {
  background: hsl(142 40% 92%);
  color: hsl(142 50% 35%);
  border-color: transparent;
  cursor: default;
  opacity: 1;
}
.project-action-btn.imported-tag {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  border-color: transparent;
  cursor: default;
  opacity: 1;
}

.agent-source-card.source {
  border-color: hsl(var(--primary) / 0.3);
}
.agent-source-card.source .agent-source-name,
.agent-source-card.source .agent-source-type {
  display: inline-block;
  width: auto;
  background: hsl(var(--primary) / 0.08);
  border-radius: 4px;
  padding: 1px 6px;
}

/* ═══ Duplicate path switcher ═══ */
.dup-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.dup-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-base) var(--ease-standard);
}
.dup-trigger:hover {
  border-color: hsl(var(--primary) / 0.4);
  background: hsl(var(--accent));
}
.dup-trigger-label {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Dropdown */
.dup-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}
.dup-dropdown {
  position: fixed;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  padding: 4px;
}
.dup-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-quick) var(--ease-standard);
}
.dup-dropdown-item:hover {
  background: hsl(var(--accent));
}
.dup-dropdown-item.active {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}
.dup-dropdown-check {
  margin-left: auto;
  flex-shrink: 0;
  color: hsl(var(--primary));
}
</style>

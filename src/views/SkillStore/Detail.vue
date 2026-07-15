<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { KeyShowToast, KeyRefreshCounts, KeyBumpDownloadedSkillsVersion } from '../../inject-keys'
import { storage } from '../../utils/storage'
import { parseFrontmatter, extractChineseSummary } from '../../utils/frontmatter'
import { fetchSkillDetailFromSkill } from '../../utils/skills-sh'
import { isWellKnownSkill, downloadSkillFromWebsite } from '../../utils/well-known'
import type { Skill, InstallMode } from '../../types'
import SkillDetailBase from '../../components/SkillDetailBase.vue'
import GlobalDistPanel from '../../components/GlobalDistPanel.vue'
import ProjectDistPanel from '../../components/ProjectDistPanel.vue'
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal.vue'
import ConfirmModal from '../../components/ConfirmModal.vue'
import { getSkillsRepoDir } from '../../utils/skill-path'
import { finalizeImportedSkill } from '../../utils/skill-import'

const props = defineProps<{ skill: Skill | null; context?: 'my' | 'store' | 'project' | 'agent' }>()
const emit = defineEmits(['navigate'])
const showToast = inject(KeyShowToast, () => {})
const refreshCounts = inject(KeyRefreshCounts, () => {})
const bumpDownloadedSkillsVersion = inject(KeyBumpDownloadedSkillsVersion, () => {})

const activeTab = ref<'preview' | 'source' | 'files'>('preview')
const skillContent = ref('')
const skillDesc = ref('')
const skillName = ref('')
const installMode = ref<InstallMode>(storage.getSettings().defaultInstallMode)
const distScope = ref<'global' | 'project'>('global')
const installing = ref(false)
const isEditing = ref(false)
const editedInstructions = ref('')
const copyStatus = ref<Record<string, boolean>>({})
let copyTimers: Record<string, ReturnType<typeof setTimeout>> = {}

onUnmounted(() => {
  Object.values(copyTimers).forEach(clearTimeout)
})

const isProjectContext = computed(() => props.context === 'project')
const isImported = computed(() => {
  if (!props.skill) return false
  // 从"我的技能"页面进入时，技能一定是已导入的
  if (props.context === 'my') return true
  // 先通过ID查找，如果找不到则通过name查找（同步分发后的状态）
  if (storage.getDownloadedIds().includes(props.skill.id)) return true
  const normalizedName = (props.skill.name || '').toLowerCase()
  return storage.getDownloadedSkills().some((s) => s.name && s.name.toLowerCase() === normalizedName)
})
const skillDir = computed(() => {
  if (!props.skill) return ''
  const skill = props.skill as any
  if (skill.skillDir) return skill.skillDir
  if (isImported.value) {
    return getSkillsRepoDir(props.skill.id)
  }
  return ''
})
const projectImporting = ref(false)
const showProjectImportConfirm = ref(false)
const _projectRemoving = ref(false)
const showDeleteModal = ref(false)

const updateChecking = ref(false)
const updateAvailable = ref(false)
const updateStatus = ref<'idle' | 'checking' | 'updating' | 'done' | 'error'>('idle')
const updateMessage = ref('')

const canCheckUpdate = computed(() => {
  if (!props.skill) return false
  if (isWellKnownSkill(props.skill)) return false
  return !!props.skill.repo
})

async function checkForUpdate() {
  if (!props.skill?.repo || updateChecking.value) return
  updateChecking.value = true
  updateStatus.value = 'checking'
  updateMessage.value = ''
  try {
    const token = storage.getSettings().githubToken || undefined
    const result = await window.services.checkSkillUpdateFull(
      props.skill.repo,
      props.skill.path || '',
      token,
      props.skill.branch,
      props.skill.id,
    )
    if (!result) {
      updateStatus.value = 'error'
      updateMessage.value = '检查失败'
      showToast({ type: 'error', message: '检查更新失败' })
    } else if (result.hasUpdate) {
      updateAvailable.value = true
      updateStatus.value = 'done'
      const count = result.changedFiles.length
      updateMessage.value = `有 ${count} 个文件已更新`
      const preview = result.changedFiles.slice(0, 3).join(', ')
      const suffix = count > 3 ? ` 等${count}个文件` : ''
      showToast({ type: 'notification', message: `发现更新：${preview}${suffix}` })
    } else {
      updateAvailable.value = false
      updateStatus.value = 'done'
      updateMessage.value = '已是最新'
      showToast({ type: 'success', message: '已是最新版本' })
    }
  } catch (err: any) {
    updateStatus.value = 'error'
    updateMessage.value = '检查失败: ' + (err.message || '未知错误')
    showToast({ type: 'error', message: '检查更新失败: ' + (err.message || '未知错误') })
  }
  updateChecking.value = false
}

async function updateSkill() {
  if (!props.skill?.repo || updateStatus.value === 'updating') return
  updateStatus.value = 'updating'
  updateMessage.value = ''
  try {
    const token = storage.getSettings().githubToken || undefined
    const targetDir = getSkillsRepoDir(props.skill!.id)
    const ok = await window.services.updateSkillFromGitHub(props.skill.repo, props.skill.path || '', targetDir, token, props.skill.branch)
    if (ok) {
      updateAvailable.value = false
      updateStatus.value = 'done'
      updateMessage.value = '更新完成'
      loadSkillContent()
      showToast({ type: 'success', message: '技能已更新' })
    } else {
      updateStatus.value = 'error'
      updateMessage.value = '更新失败'
    }
  } catch (err: any) {
    updateStatus.value = 'error'
    updateMessage.value = '更新失败: ' + (err.message || '未知错误')
  }
}

function requestProjectImport() {
  if (!isImported.value && !projectImporting.value) showProjectImportConfirm.value = true
}

async function projectImportSkill() {
  showProjectImportConfirm.value = false
  if (!props.skill) return
  projectImporting.value = true
  try {
    const id = props.skill.id
    const targetDir = getSkillsRepoDir(id)
    const sourceDir = (props.skill as any).skillDir
    if (sourceDir) window.services.copyFile(sourceDir, targetDir)

    finalizeImportedSkill({
      skill: { ...props.skill, source: 'local', path: sourceDir || props.skill.path },
      targetDir,
      sourceType: 'local',
      location: sourceDir || '',
      sessionSource: 'local',
      storeSourceId: props.skill.storeSourceId,
    })
    bumpDownloadedSkillsVersion()
    showToast({ type: 'success', message: `已将 ${props.skill.name} 导入到我的 Skill` })
  } catch (err: any) {
    showToast({ type: 'error', message: err.message })
  }
  projectImporting.value = false
}

function projectOpenFolder() {
  const skill = props.skill as any
  if (skill?.skillDir) window.services.openFolder(skill.skillDir)
}

function handleDelete() {
  if (!props.skill) return
  showDeleteModal.value = true
}

function onSkillDeleted() {
  showDeleteModal.value = false
  emit('navigate', 'my')
}

onMounted(() => {
  loadSkillContent()
})
watch(
  () => props.skill?.id,
  () => {
    activeTab.value = 'preview'
    loadSkillContent()
    isEditing.value = false
    copyStatus.value = {}
    Object.values(copyTimers).forEach(clearTimeout)
    copyTimers = {}
  },
)

// 当前显示的收藏状态（用于在toggleFavorite后立即更新UI）
const currentFavoriteState = ref<boolean>(false)

// 监听skill变化，同步收藏状态
watch(
  () => props.skill?.isFavorited,
  (val) => {
    currentFavoriteState.value = val ?? false
  },
  { immediate: true },
)

function toggleFavorite() {
  if (!props.skill) return
  // 记录当前收藏状态，toggleFavorite会翻转它
  const wasFavorited = currentFavoriteState.value
  storage.toggleFavorite(props.skill.id, {
    name: props.skill.name,
    description: props.skill.description,
    author: props.skill.author,
    tags: props.skill.tags,
    source: props.skill.source,
  })
  // 手动更新当前显示的状态
  currentFavoriteState.value = !wasFavorited
  refreshCounts()
}

async function loadSkillContent() {
  if (!props.skill) return
  skillContent.value = ''
  skillDesc.value = ''
  skillName.value = ''
  const skill = props.skill as any

  // Well-known 技能优先从 web 缓存读取 readme
  const isWellKnown = isWellKnownSkill(skill) || (!skill.repo && skill.sourceUrl && skill.source === 'skills-sh')
  if (isWellKnown) {
    const webCachedReadme = storage.getCachedWebSkillReadme(skill.id)
    if (webCachedReadme) skill.readme = webCachedReadme
  }

  // Check persistent readme cache (24h TTL)
  if (!skill.readme) {
    const cachedContent = storage.getCachedReadme(skill.id)
    if (cachedContent) skill.readme = cachedContent
  }

  if (skill.readme) {
    const fm = parseFrontmatter(skill.readme)
    if (fm.description) skill.description = fm.description
    const normalized = skill.readme.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
    skillName.value = fm.name || ''
    skillDesc.value = fm.description || extractChineseSummary(skill.readme) || ''
    skillContent.value = bodyMatch ? bodyMatch[1].trim() : skill.readme
    editedInstructions.value = skillContent.value
    return
  }

  if (skill.skillDir) {
    try {
      const files = window.services.readDir(skill.skillDir)
      const skillMd = files.find((f: any) => f.name === 'SKILL.md' || f.name === 'skill.md')
      if (skillMd) {
        const raw = window.services.readFile(skillMd.path) || ''
        const fm = parseFrontmatter(raw)
        if (fm.description) skill.description = fm.description
        const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = fm.name || ''
        skillDesc.value = fm.description || extractChineseSummary(raw) || ''
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : raw
        editedInstructions.value = skillContent.value
        return
      }
    } catch {}
  }

  const downloadedIds = storage.getDownloadedIds()
  if (downloadedIds.includes(skill.id)) {
    try {
      const dir = getSkillsRepoDir(skill.id)
      const files = window.services.readDir(dir)
      const skillMd = files.find((f: any) => f.name === 'SKILL.md')
      if (skillMd) {
        const raw = window.services.readFile(skillMd.path) || ''
        const fm = parseFrontmatter(raw)
        if (fm.description) skill.description = fm.description
        const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = fm.name || ''
        skillDesc.value = fm.description || extractChineseSummary(raw) || ''
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : raw
        editedInstructions.value = skillContent.value
        return
      }
    } catch {}
  }

  if (skill.source === 'skills-sh' && !skill.readme) {
    // Well-known 技能 或 没有 GitHub repo 的 marketplace 技能：从网站下载 SKILL.md 内容
    if (isWellKnownSkill(skill) || (!skill.repo && skill.sourceUrl)) {
      const result = await downloadSkillFromWebsite(skill)
      if (result) {
        skill.readme = result.skillMd
        skill.readmeCachedAt = Date.now()
        storage.saveWebSkillReadme(skill, result.skillMd)
        const fm = parseFrontmatter(result.skillMd)
        if (fm.description) skill.description = fm.description
        const normalized = result.skillMd.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const bodyMatch = normalized.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
        skillName.value = fm.name || skill.name
        skillDesc.value = fm.description || extractChineseSummary(result.skillMd) || ''
        skillContent.value = bodyMatch ? bodyMatch[1].trim() : result.skillMd
        editedInstructions.value = skillContent.value
        return
      }
    }
    const result = await fetchSkillDetailFromSkill(skill, storage.getSettings().githubToken || undefined)
    if (result) {
      skill.readme = result.content
      skill.readmeCachedAt = Date.now()
      if (result.name) skill.name = result.name
      if (result.description) skill.description = result.description
      if (result.canonicalId) skill.canonicalId = result.canonicalId
      storage.saveGitHubSkills([skill])
      skillName.value = result.name
      skillDesc.value = result.description
      const bodyMatch2 = result.content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
      skillContent.value = bodyMatch2 ? bodyMatch2[1].trim() : result.content
      editedInstructions.value = skillContent.value
      return
    }
  }
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
</script>

<template>
  <div v-if="!skill" class="empty">未选择技能</div>
  <SkillDetailBase
    v-else
    v-model:active-tab="activeTab"
    :skill="skill"
    :context="context"
    :skill-name="skillName"
    :skill-desc="skillDesc"
    :skill-content="skillContent"
    :is-favorited="currentFavoriteState"
    :is-editing="isEditing"
    :edited-content="editedInstructions"
    :copy-status="copyStatus"
    :skill-dir="skillDir"
    :show-favorite="isImported"
    @navigate="emit('navigate', $event)"
    @toggle-favorite="toggleFavorite"
    @copy-content="handleCopy"
    @toggle-edit="toggleEdit"
    @save-content="saveContent"
    @update:edited-content="editedInstructions = $event"
    @delete="handleDelete"
  >
    <template #header-toolbar-start>
      <button
        v-if="isImported && canCheckUpdate"
        class="header-update-btn"
        :class="{ 'update-available': updateAvailable, updating: updateChecking || updateStatus === 'updating' }"
        :disabled="updateChecking || updateStatus === 'updating'"
        @click="updateAvailable ? updateSkill() : checkForUpdate()"
      >
        <svg
          v-if="updateChecking || updateStatus === 'updating'"
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
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        {{
          updateChecking ? '检查中...' : updateStatus === 'updating' ? '更新中...' : updateAvailable ? '有可用更新，立即更新' : '检查更新'
        }}
      </button>
    </template>
    <template v-if="isProjectContext" #context-panel>
      <div class="platform-panel">
        <div class="section-heading-row">
          <h3 class="section-heading">项目 Skill</h3>
          <span class="section-badge">SKILL.md</span>
        </div>

        <div class="project-actions">
          <button v-if="!isImported" class="project-action-btn primary" :disabled="projectImporting" @click="requestProjectImport">
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
            {{ projectImporting ? '导入中...' : '导入到我的 Skill' }}
          </button>
          <div v-else class="project-action-btn imported-tag">
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
            已在我的 Skill 中
          </div>
          <button class="project-action-btn" @click="projectOpenFolder">
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
            打开文件夹
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="skill" #context-panel>
      <div class="platform-panel">
        <div class="section-heading-row">
          <h3 class="section-heading">平台集成</h3>
          <span class="section-badge">SKILL.md</span>
        </div>

        <div class="scope-toggle">
          <button :class="{ active: distScope === 'global' }" @click="distScope = 'global'">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            全局分发
          </button>
          <button :class="{ active: distScope === 'project' }" @click="distScope = 'project'">
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
            项目分发
          </button>
        </div>
        <p class="mode-desc">
          {{ distScope === 'global' ? '分发到用户目录下的平台配置目录，所有项目共享。' : '分发到当前项目的指定 Agent 目录下。' }}
        </p>

        <GlobalDistPanel
          v-if="distScope === 'global'"
          v-model:install-mode="installMode"
          :skill="skill"
          :installing="installing"
          :install-progress-text="''"
          @install-started="installing = true"
          @install-finished="installing = false"
        />
        <ProjectDistPanel
          v-else
          v-model:install-mode="installMode"
          :skill="skill"
          :installing="installing"
          :install-progress-text="''"
          @install-started="installing = true"
          @install-finished="installing = false"
        />
      </div>
    </template>
  </SkillDetailBase>

  <ConfirmModal
    v-if="showProjectImportConfirm && skill"
    title="确认导入 Skill"
    :message="`确定要将 <strong>${skill.name}</strong> 导入到我的 Skill 吗？`"
    confirm-text="导入"
    @confirm="projectImportSkill"
    @cancel="showProjectImportConfirm = false"
  />
  <ConfirmDeleteModal v-if="showDeleteModal && skill" :skill="skill" @close="showDeleteModal = false" @deleted="onSkillDeleted" />
</template>

<style scoped>
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

.scope-toggle {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: hsl(var(--accent) / 0.4);
  border-radius: 10px;
  margin-bottom: 8px;
}
.scope-toggle button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.scope-toggle button.active {
  background: hsl(var(--card));
  color: hsl(var(--primary));
  box-shadow: 0 1px 3px hsl(0 0% 0% / 0.08);
}
.mode-desc {
  font-size: 11px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  margin: 0 0 16px;
}

.project-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
.project-action-btn.primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}
.project-action-btn.primary:hover {
  opacity: 0.9;
}
.project-action-btn.imported-tag {
  border: none;
  background: rgb(222, 242, 231);
  color: #166534;
  cursor: default;
}

.header-update-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
  white-space: nowrap;
  flex-shrink: 0;
}
.header-update-btn:hover:not(:disabled) {
  border-color: hsl(var(--primary) / 0.3);
  color: hsl(var(--foreground));
}
.header-update-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.header-update-btn.update-available {
  color: hsl(142 50% 45%);
  border-color: hsl(142 50% 45% / 0.3);
}
.header-update-btn.update-available:hover:not(:disabled) {
  background: hsl(142 50% 45% / 0.08);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 0.7s linear infinite;
}
</style>

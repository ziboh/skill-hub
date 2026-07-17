<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import { KeyRefreshCounts, KeyShowToast } from '../inject-keys'
import { storage } from '../utils/storage'
import { fetchGitHubRepoTree, fetchGitHubFile, detectSkillDirectories, githubFetch } from '../utils/github'
import { downloadGiteeSkillCompat, fetchGiteeRepoTree, fetchGiteeFile } from '../utils/gitee'
import { getRepositoryUrl, parseRepositoryUrl } from '../utils/repository'
import { parseFrontmatter } from '../utils/frontmatter'
import type { Skill, SkillScanResult } from '../types'
import { getAvatarColor } from '../utils/color'
import { getSkillsRepoDir, skillIdSlug } from '../utils/skill-path'
import { atomicReplaceDir } from '../utils/fs-ops'
import { finalizeImportedSkill } from '../utils/skill-import'
import { skillsShareIdentity } from '../utils/skill-identity'
import { sortProcessedSkillsLast } from '../utils/skill-modal-sort'
import { isValidRelativeRepositoryPath, validateGitSourceOptions } from '../utils/input-validation'
import UiIcon, { type UiIconName } from './UiIcon.vue'

const emit = defineEmits(['close', 'imported', 'navigate'])
const refreshCounts = inject(KeyRefreshCounts)
const showToast = inject(KeyShowToast, () => {})

const step = ref<'choose' | 'git-input' | 'local-input'>('choose')
const gitUrl = ref('')
const gitBranch = ref('')
const gitSkillPath = ref('')
const scanning = ref(false)
const scanError = ref('')
const scannedSkills = ref<Skill[]>([])
const scannedGiteeTree = ref<import('../utils/gitee').GiteeTreeItem[] | null>(null)
const sortedGitHubSkills = computed(() => sortProcessedSkillsLast(scannedSkills.value, isSkillImported))
const selectedIds = ref<Set<string>>(new Set())
const importing = ref(false)
const localRoot = ref('')

const methods: { id: string; icon: UiIconName; title: string; desc: string }[] = [
  { id: 'git', icon: 'package', title: '从 GitHub 导入', desc: '支持 GitHub、Gitee，输入仓库和 skill 名称或扫描选择' },
  { id: 'local', icon: 'folder', title: '从本地导入', desc: '选择文件夹，自动识别单个或多个技能' },
]

function showError(message: string) {
  scanError.value = message
  showToast({ type: 'error', message: message })
}

function clearError() {
  scanError.value = ''
}

function chooseMethod(id: string) {
  scannedSkills.value = []
  scannedGiteeTree.value = null
  selectedIds.value = new Set()
  clearError()
  if (id === 'git') step.value = 'git-input'
  if (id === 'local') step.value = 'local-input'
}

function skillIdPart(path: string, fallback: string) {
  return (path === '.' ? fallback : path.split('/').filter(Boolean).pop() || fallback).replace(/[^\w.-]/g, '-')
}

function selectedBranch(infoBranch = 'main') {
  return gitBranch.value.trim() || infoBranch
}

async function scanGit() {
  const branchError = validateGitSourceOptions(gitBranch.value, '')
  if (branchError) {
    showError(branchError)
    return
  }
  const info = parseRepositoryUrl(gitUrl.value.trim())
  if (!info) {
    showError('请输入有效的 GitHub URL 或 Gitee URL（如 owner/repo）')
    return
  }
  scanning.value = true
  clearError()
  scannedSkills.value = []
  selectedIds.value = new Set()
  try {
    const token = info.provider === 'gitee' ? storage.getSettings().giteeToken || undefined : storage.getSettings().githubToken || undefined
    const branch = selectedBranch(info.defaultBranch)
    const tree =
      info.provider === 'gitee'
        ? await fetchGiteeRepoTree(info.owner, info.repo, branch, token)
        : await fetchGitHubRepoTree(info.owner, info.repo, branch, token)
    scannedGiteeTree.value = info.provider === 'gitee' ? tree : null
    const skills: Skill[] = []
    for (const sd of detectSkillDirectories(tree)) {
      try {
        const content =
          info.provider === 'gitee'
            ? await fetchGiteeFile(info.owner, info.repo, sd.manifestFile, branch, token)
            : await fetchGitHubFile(info.owner, info.repo, sd.manifestFile, branch, token)
        const fm = parseFrontmatter(content)
        const dirName = skillIdPart(sd.dir, info.repo)
        const tags = fm.tags
          ? fm.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : []
        skills.push({
          id: info.provider === 'gitee' ? `gitee/${info.owner}/${info.repo}/${dirName}` : `${info.owner}/${info.repo}/${dirName}`,
          canonicalId: `${info.owner}/${info.repo}/${fm.name || dirName}`,
          name: fm.name || dirName,
          description: fm.description || '',
          author: fm.author || '',
          tags,
          source: info.provider,
          sourceUrl: getRepositoryUrl(info),
          repo: `${info.owner}/${info.repo}`,
          repositoryProvider: info.provider,
          sourceId: `${info.provider}:${info.owner}/${info.repo}/${sd.dir}`,
          path: sd.dir,
          readme: content,
          branch,
        })
      } catch {}
    }
    if (!skills.length) {
      showError('未找到可安装的技能')
      return
    }
    scannedSkills.value = skills
  } catch (err: any) {
    showError(err.message || '扫描失败')
  } finally {
    scanning.value = false
  }
}

async function importGitDirect() {
  const branchError = validateGitSourceOptions(gitBranch.value, '')
  if (branchError) {
    showError(branchError)
    return
  }
  const info = parseRepositoryUrl(gitUrl.value.trim())
  const path = gitSkillPath.value.trim()
  if (!info) {
    showError('请输入有效的 GitHub URL 或 Gitee URL（如 owner/repo）')
    return
  }
  if (!path) {
    showError('请输入 skill 名称或目录')
    return
  }
  if (!isValidRelativeRepositoryPath(path)) {
    showError('skill 目录必须是仓库内的相对路径，且不能包含绝对路径或 ..')
    return
  }
  const branch = selectedBranch(info.defaultBranch)
  const idPart = skillIdPart(path, info.repo)
  await importGitSkills([
    {
      id: info.provider === 'gitee' ? `gitee/${info.owner}/${info.repo}/${idPart}` : `${info.owner}/${info.repo}/${idPart}`,
      name: idPart,
      description: '',
      author: '',
      tags: [],
      source: info.provider,
      sourceUrl: getRepositoryUrl(info),
      repo: `${info.owner}/${info.repo}`,
      repositoryProvider: info.provider,
      sourceId: `${info.provider}:${info.owner}/${info.repo}/${path}`,
      path,
      branch,
    },
  ])
}

function isImported(id: string): boolean {
  return storage.getDownloadedIds().includes(id)
}

function normalizeLocalPath(path = ''): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isSkillImported(skill: Skill): boolean {
  if (isImported(skill.id)) return true
  const downloaded = new Set(storage.getDownloadedIds())
  const localPath = normalizeLocalPath(skill.sourceUrl || skill.path || '')
  return storage.getDownloadedSkills().some((s) => {
    if (!downloaded.has(s.id)) return false
    if (skill.source === 'github') {
      if (skillsShareIdentity(skill, s)) return true
      // Backward compatibility for records saved before provider-aware ids.
      if (!s.repositoryProvider && !s.sourceId && !s.repositoryId && !s.contentHash && skill.repo) {
        const legacyId = normalizeLocalPath(s.id)
        const repoKey = normalizeLocalPath(skill.repo)
        const nameKey = normalizeLocalPath(skill.name)
        return legacyId.startsWith(repoKey + '/') && (legacyId.endsWith('/' + nameKey) || normalizeLocalPath(s.name) === nameKey)
      }
      return false
    }
    if (skill.source === 'local' && localPath) {
      return [s.sourceUrl, s.path].some((p) => normalizeLocalPath(p || '') === localPath)
    }
    return false
  })
}

function toggleSelect(id: string) {
  const skill = scannedSkills.value.find((s) => s.id === id)
  if (skill && isSkillImported(skill)) return
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next
}

function selectableSkills() {
  return scannedSkills.value.filter((s) => !isSkillImported(s))
}

function selectAll() {
  const ids = selectableSkills().map((s) => s.id)
  selectedIds.value = selectedIds.value.size === ids.length ? new Set() : new Set(ids)
}

function collectAllSkillDirs(root: string): string[] {
  const results: string[] = []
  if (['SKILL.md', 'skill.md'].some((f) => window.services.pathExists(window.services.pathJoin(root, f)))) results.push(root)
  for (const item of window.services.readDir(root) || []) {
    if (item.isDirectory) results.push(...collectAllSkillDirs(item.path))
  }
  return results
}

function readSkillDirMeta(dirPath: string): { name: string; description: string } {
  const skillFile = ['SKILL.md', 'skill.md'].map((f) => window.services.pathJoin(dirPath, f)).find((f) => window.services.pathExists(f))
  if (!skillFile) return { name: '', description: '' }
  const fm = parseFrontmatter(window.services.readFile(skillFile) || '')
  return { name: fm.name || '', description: fm.description || '' }
}

function matchSkillDir(candidates: string[], targetName: string): string | null {
  const targetLower = targetName.toLowerCase()
  for (const dir of candidates) {
    const { name } = readSkillDirMeta(dir)
    if (name && name.toLowerCase() === targetLower) return dir
  }
  for (const dir of candidates) {
    const dirName = dir.split(/[\\/]/).pop()?.toLowerCase() || ''
    if (dirName === targetLower) return dir
  }
  return null
}

async function resolveRemoteSkillPath(owner: string, repo: string, branch: string, token: string | undefined, skill: Skill) {
  let tree
  try {
    tree =
      skill.repositoryProvider === 'gitee'
        ? await fetchGiteeRepoTree(owner, repo, branch, token)
        : await fetchGitHubRepoTree(owner, repo, branch, token)
  } catch (err: any) {
    throw new Error(err.message || `仓库或分支不存在：${owner}/${repo}`)
  }

  const target = (skill.path || skill.name || '').trim()
  const candidates = [target, `skills/${target}`, `agent-skills/${target}`].filter(Boolean)
  const skillDirs = detectSkillDirectories(tree)
  const skillDirSet = new Set(skillDirs.map((item) => item.dir))
  const exact = candidates.find((p) => skillDirSet.has(p))
  if (exact) return exact

  const targetLower = target.toLowerCase()
  for (const sd of skillDirs) {
    const dirName = skillIdPart(sd.dir, repo).toLowerCase()
    if (dirName === targetLower) return sd.dir
    try {
      const content =
        skill.repositoryProvider === 'gitee'
          ? await fetchGiteeFile(owner, repo, sd.manifestFile, branch, token)
          : await fetchGitHubFile(owner, repo, sd.manifestFile, branch, token)
      const name = parseFrontmatter(content).name?.toLowerCase()
      if (name && name === targetLower) return sd.dir
    } catch {}
  }

  throw new Error(`skill 不存在：${target}（仓库 ${owner}/${repo} 存在，但未找到对应目录或名称）`)
}

async function importGitSkills(skills: Skill[]) {
  importing.value = true
  clearError()
  let importedCount = 0
  const errors: string[] = []
  const targetNames: string[] = []
  const downloadedIds = storage.getDownloadedIds()
  for (const skill of skills) {
    if (isSkillImported(skill) || !skill.repo) {
      errors.push(`「${skill.name}」已导入，跳过`)
      continue
    }
    try {
      const branch = skill.branch || (skill.repositoryProvider === 'gitee' ? 'main' : 'main')
      const [owner, repo] = skill.repo.split('/')
      const token =
        skill.repositoryProvider === 'gitee'
          ? storage.getSettings().giteeToken || undefined
          : storage.getSettings().githubToken || undefined
      const remotePath = await resolveRemoteSkillPath(owner, repo, branch, token, skill)
      const skillName = (skill.path || skill.name || '').trim().split('/').pop() || skill.name
      if (downloadedIds.some((id) => id.toLowerCase().endsWith(`/${skillName.toLowerCase()}`)) || targetNames.includes(skillName)) {
        errors.push(`「${skillName}」已存在，跳过导入`)
        continue
      }
      if (skill.repositoryProvider === 'gitee') {
        const targetDir = getSkillsRepoDir(skill.id)
        const ok = await downloadGiteeSkillCompat(skill.repo, remotePath, targetDir, token, branch, scannedGiteeTree.value || undefined)
        if (!ok) throw new Error(`skill 不存在：${skill.path || skill.name}`)
        if (typeof window.services.saveGiteeSkillMetaAfterDownload === 'function') {
          await window.services.saveGiteeSkillMetaAfterDownload(skill.repo, branch, token, targetDir)
        }
        finishImportedSkill({ ...skill, source: 'gitee', repositoryProvider: 'gitee' }, targetDir, 'gitee', skill.repo)
        targetNames.push(skill.name || skillName)
        importedCount++
        continue
      }
      const arrayBuffer = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: false,
        responseType: 'arraybuffer',
        timeout: 60000,
      })
      const buffer = new Uint8Array(arrayBuffer)
      const tempDir = window.services.pathJoin(window.services.homeDir(), '.cache/skill-hub/')
      window.services.mkdir(tempDir)
      const extractDir = window.services.pathJoin(tempDir, `extract-${skillIdSlug(skill.id)}`)
      window.services.removeFile(extractDir)
      window.services.extractBufferZip(buffer as any, extractDir)
      const rootDir = window.services.readDir(extractDir).find((d: any) => d.isDirectory)
      const sourceRoot = rootDir ? rootDir.path : extractDir
      const candidates = [remotePath].filter(Boolean) as string[]
      let skillSourceDir = candidates.map((p) => window.services.pathJoin(sourceRoot, p)).find((p) => window.services.pathExists(p)) || ''
      if (!skillSourceDir) skillSourceDir = matchSkillDir(collectAllSkillDirs(sourceRoot), skill.name) || ''
      if (!skillSourceDir) {
        errors.push(`skill 不存在：${skill.path || skill.name}（仓库 ${skill.repo} 存在，但未找到对应目录）`)
        window.services.removeFile(extractDir)
        continue
      }
      const targetDir = getSkillsRepoDir(skill.id)
      atomicReplaceDir(skillSourceDir, targetDir)
      await window.services.saveSkillMetaAfterDownload(skill.repo, branch, storage.getSettings().githubToken || undefined, targetDir)
      window.services.removeFile(extractDir)
      finishImportedSkill(skill, targetDir, 'github', skill.repo)
      const finalName = skill.name || skillName
      targetNames.push(finalName)
      importedCount++
    } catch (err: any) {
      errors.push(err.message || '导入失败')
    }
  }
  importing.value = false
  if (importedCount) {
    const msg = targetNames.length === 1 ? `已导入「${targetNames[0]}」` : `已导入 ${targetNames.length} 个技能`
    showToast({ type: 'success', message: msg })
  }
  if (errors.length) {
    showError(errors[errors.length - 1])
    if (importedCount) emit('imported')
    return
  }
  if (!importedCount) {
    showError('没有可导入的 skill')
    return
  }
  emit('imported')
  emit('close')
}

function finishImportedSkill(skill: Skill, targetDir: string, sourceType: 'github' | 'gitee' | 'local', location: string) {
  // location / skill.path = original source (local dir or github relative path)
  if (sourceType === 'local' && !skill.path) {
    skill.path = location
  }
  finalizeImportedSkill({
    skill,
    targetDir,
    sourceType,
    location,
    sessionSource: 'import',
  })
  refreshCounts?.()
}

async function importSelectedGit() {
  await importGitSkills(scannedSkills.value.filter((s) => selectedIds.value.has(s.id)))
}

function selectLocalFolder() {
  clearError()
  const dialog = window.ztools?.showOpenDialog
  if (!dialog) {
    showError('文件选择对话框不可用')
    return
  }
  const dirs = dialog({ properties: ['openDirectory'], title: '选择技能文件夹' })
  if (!dirs?.length) return
  localRoot.value = dirs[0]
  loadLocalSkills(dirs[0])
}

function localScanResultToSkill(r: SkillScanResult): Skill {
  const name = r.manifest.name || r.name
  const id = `local/${name.replace(/[^\w.-]/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name,
    description: r.manifest.description || '',
    author: r.manifest.author || '',
    tags: r.manifest.tags || [],
    source: 'local',
    sourceUrl: r.dir,
    path: r.dir,
    readme: r.content,
  }
}

function loadLocalSkills(dir: string) {
  try {
    const direct = ['SKILL.md', 'skill.md'].map((f) => window.services.pathJoin(dir, f)).find((f) => window.services.pathExists(f))
    const results = direct
      ? [window.services.parseSkillFile(direct)].filter(Boolean).map((parsed: any) => ({
          name: dir.split(/[\\/]/).pop() || 'skill',
          dir,
          skillFile: direct,
          content: parsed.content || '',
          manifest: parsed.manifest,
        }))
      : window.services.scanForSkillFiles([dir])
    scannedSkills.value = results.map(localScanResultToSkill)
    selectedIds.value = direct ? new Set(scannedSkills.value.map((s) => s.id)) : new Set()
    if (direct) importLocalSelected()
    else if (!scannedSkills.value.length) showError('未找到 SKILL.md')
  } catch (err: any) {
    showError(err.message || '扫描本地技能失败')
    step.value = 'choose'
  }
}

async function importLocalSelected() {
  importing.value = true
  const targetNames: string[] = []
  for (const skill of scannedSkills.value.filter((s) => selectedIds.value.has(s.id))) {
    try {
      if (storage.getDownloadedIds().includes(skill.id) || targetNames.includes(skill.name)) {
        showError(`「${skill.name}」已存在，跳过导入`)
        continue
      }
      const targetDir = getSkillsRepoDir(skill.id)
      atomicReplaceDir(skill.path || '', targetDir)
      finishImportedSkill(skill, targetDir, 'local', skill.sourceUrl || skill.path || '')
      targetNames.push(skill.name)
    } catch (err: any) {
      showError(err.message || '导入失败')
    }
  }
  if (targetNames.length)
    showToast({
      type: 'success',
      message: targetNames.length === 1 ? `已导入「${targetNames[0]}」` : `已导入 ${targetNames.length} 个技能`,
    })
  importing.value = false
  emit('imported')
  if (targetNames.length) emit('close')
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <button
            v-if="step !== 'choose'"
            class="back-btn"
            type="button"
            title="返回选择添加方式"
            aria-label="返回选择添加方式"
            @click="step = 'choose'"
          >
            <UiIcon name="arrow-left" :size="18" />
          </button>
          <h3>添加技能</h3>
        </div>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      <div class="modal-body">
        <template v-if="step === 'choose'">
          <p class="hint">选择添加技能的方式：</p>
          <div class="method-list">
            <button v-for="m in methods" :key="m.id" class="method-item" @click="chooseMethod(m.id)">
              <div class="method-icon"><UiIcon :name="m.icon" :size="24" /></div>
              <div class="method-info">
                <div class="method-title">
                  {{ m.title }}
                </div>
                <div class="method-desc">
                  {{ m.desc }}
                </div>
              </div>
            </button>
          </div>
        </template>

        <template v-else-if="step === 'git-input'">
          <p class="hint">输入 GitHub 或 Gitee 仓库，可直接填 skill 目录，也可扫描选择：</p>
          <div class="git-input-row">
            <input
              v-model="gitUrl"
              type="text"
              placeholder="https://github.com/user/repo 或 https://gitee.com/user/repo"
              class="git-input"
            />
            <input v-model="gitBranch" type="text" placeholder="分支（可选）" class="git-input small" />
          </div>
          <div class="git-input-row">
            <input
              v-model="gitSkillPath"
              type="text"
              placeholder="skill 名称或目录，如 skills/foo"
              class="git-input"
              @keydown.enter="importGitDirect"
            />
            <button class="scan-btn" :disabled="importing || !gitUrl.trim() || !gitSkillPath.trim()" @click="importGitDirect">
              {{ importing ? '导入中...' : '直接导入' }}
            </button>
            <button class="scan-btn secondary" :disabled="scanning || !gitUrl.trim()" @click="scanGit">
              {{ scanning ? '扫描中...' : '扫描仓库' }}
            </button>
          </div>
          <div v-if="scannedSkills.length" class="inline-results">
            <div class="scan-header">
              <p class="hint">找到 {{ scannedSkills.length }} 个技能。选择要导入的：</p>
              <button class="select-all-btn" @click="selectAll">
                {{ selectedIds.size === selectableSkills().length ? '取消全选' : '全选' }}
              </button>
            </div>
            <div class="skill-select-list">
              <label
                v-for="skill in sortedGitHubSkills"
                :key="skill.id"
                class="skill-select-item"
                :class="{ imported: isSkillImported(skill) }"
              >
                <input
                  type="checkbox"
                  :checked="isSkillImported(skill) || selectedIds.has(skill.id)"
                  :disabled="isSkillImported(skill)"
                  @change="toggleSelect(skill.id)"
                />
                <div class="skill-avatar" :style="{ background: getAvatarColor(skill.name) }">{{ skill.name.charAt(0).toUpperCase() }}</div>
                <div class="skill-info">
                  <div class="skill-name">{{ skill.name }} <span v-if="isSkillImported(skill)" class="imported-badge">已导入</span></div>
                  <div class="skill-desc">{{ skill.description || skill.path || '描述未解析成功' }}</div>
                </div>
              </label>
            </div>
          </div>
        </template>

        <template v-else-if="step === 'local-input'">
          <p class="hint">选择本地文件夹：如果该文件夹下有 SKILL.md 会直接导入，否则扫描其中所有技能。</p>
          <div class="git-input-row">
            <input v-model="localRoot" type="text" placeholder="选择或填写本地文件夹路径" class="git-input" />
            <button class="scan-btn secondary" @click="selectLocalFolder">浏览</button>
            <button class="scan-btn" :disabled="!localRoot.trim()" @click="loadLocalSkills(localRoot)">扫描</button>
          </div>
          <div v-if="scannedSkills.length" class="inline-results">
            <div class="scan-header">
              <p class="hint">找到 {{ scannedSkills.length }} 个技能。选择要导入的：</p>
              <button class="select-all-btn" @click="selectAll">
                {{ selectedIds.size === selectableSkills().length ? '取消全选' : '全选' }}
              </button>
            </div>
            <div class="skill-select-list">
              <label v-for="skill in scannedSkills" :key="skill.id" class="skill-select-item" :class="{ imported: isSkillImported(skill) }">
                <input
                  type="checkbox"
                  :checked="isSkillImported(skill) || selectedIds.has(skill.id)"
                  :disabled="isSkillImported(skill)"
                  @change="toggleSelect(skill.id)"
                />
                <div class="skill-avatar" :style="{ background: getAvatarColor(skill.name) }">{{ skill.name.charAt(0).toUpperCase() }}</div>
                <div class="skill-info">
                  <div class="skill-name">{{ skill.name }} <span v-if="isSkillImported(skill)" class="imported-badge">已导入</span></div>
                  <div class="skill-desc">{{ skill.description || skill.path || '描述未解析成功' }}</div>
                </div>
              </label>
            </div>
          </div>
        </template>
      </div>

      <div v-if="scannedSkills.length && (step === 'git-input' || step === 'local-input')" class="modal-footer">
        <div class="scan-actions">
          <button
            v-if="step === 'git-input' && scannedSkills.length"
            class="import-btn"
            :disabled="!selectedIds.size || importing"
            @click="importSelectedGit"
          >
            {{ importing ? '导入中...' : `导入 (${selectedIds.size})` }}
          </button>
          <button
            v-else-if="step === 'local-input' && scannedSkills.length"
            class="import-btn"
            :disabled="!selectedIds.size || importing"
            @click="importLocalSelected"
          >
            {{ importing ? '导入中...' : `导入 (${selectedIds.size})` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: hsl(var(--background) / 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  width: min(920px, 92vw);
  max-height: 86vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}
.modal-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: hsl(var(--foreground));
}
.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.back-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-standard),
    background var(--duration-base) var(--ease-standard);
}
.back-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}
.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-base) var(--ease-standard);
}
.close-btn:hover {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.modal-body {
  padding: 20px 24px 24px;
  overflow-y: auto;
}
.hint {
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 16px;
}
.method-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.method-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all var(--duration-base) var(--ease-standard);
}
.method-item:hover {
  border-color: hsl(var(--primary) / 0.4);
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.1);
}
.method-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.method-info {
  flex: 1;
  min-width: 0;
}
.method-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.method-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}
.git-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.git-input {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  outline: none;
  transition: all var(--duration-base) var(--ease-standard);
  min-width: 0;
}
.git-input.small {
  flex: 0 0 130px;
}
.git-input:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 3px hsl(var(--ring) / 0.12);
  background: hsl(var(--card));
}
.git-input::placeholder {
  color: hsl(var(--muted-foreground));
}
.scan-btn {
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-base) var(--ease-standard);
}
.scan-btn.secondary {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
}
.scan-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 12px;
}
.scan-header .hint {
  margin-bottom: 0;
}
.select-all-btn {
  background: none;
  border: none;
  color: hsl(var(--primary));
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.skill-select-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}
.skill-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.skill-select-item:hover {
  border-color: hsl(var(--primary));
}
.skill-select-item.imported {
  opacity: 0.65;
  cursor: not-allowed;
  background: hsl(var(--muted) / 0.5);
}
.skill-select-item.imported:hover {
  border-color: hsl(var(--border));
}
.skill-select-item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: hsl(var(--primary));
  flex-shrink: 0;
}
.skill-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.skill-info {
  flex: 1;
  min-width: 0;
}
.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.imported-badge {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--primary));
}
.skill-desc {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-footer {
  padding: 0 24px 20px;
  border-top: 1px solid hsl(var(--border));
  flex-shrink: 0;
}
.modal-footer .scan-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 16px;
}
.import-btn {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  transition: all var(--duration-base) var(--ease-standard);
}
.import-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

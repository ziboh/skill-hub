import { ref, type Ref } from 'vue'
import type { Skill } from '../types'
import { storage } from '../utils/storage'
import { parseFrontmatter } from '../utils/frontmatter'
import * as skillsSh from '../utils/skills-sh'
import { getSkillsRepoDir, skillIdSlug } from '../utils/skill-path'
import { useDownloadQueue } from './useDownloadQueue'
import { useTranslationQueue } from './useTranslationQueue'
import { isChineseContent, computeContentHash } from '../utils/translate'
import { isWellKnownSkill, downloadSkillFromWebsite, downloadDirectFromStore, type WellKnownSkillResult } from '../utils/well-known'
import { atomicReplaceDir, atomicWriteDir } from '../utils/fs-ops'
import { finalizeImportedSkill, resolveImportSourceType } from '../utils/skill-import'
import type { ShowToast } from './useStoreSkills'

export function getSkillUrl(skill: Skill): string | undefined {
  if (skill.sourceUrl) return skill.sourceUrl
  if (skill.homepage) return skill.homepage
  if (skill.repo) return `https://github.com/${skill.repo}`
  return undefined
}

export function collectPathCandidates(skillPath: string): string[] {
  return [skillPath, `skills/${skillPath}`, `agent-skills/${skillPath}`]
}

export function getRepoRelativeSkillPath(sourceRoot: string, skillDir: string): string | null {
  const root = sourceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  const dir = skillDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (dir.toLowerCase() === root.toLowerCase()) return '.'
  if (!dir.toLowerCase().startsWith(root.toLowerCase() + '/')) return null
  return dir.slice(root.length + 1)
}

export function matchSkillDirByMeta(
  candidates: { dir: string; name: string; description: string }[],
  targetName: string,
): string | null {
  if (candidates.length === 1) return candidates[0].dir
  if (!candidates.length) return null
  if (!targetName) return candidates[0].dir
  const targetLower = targetName.toLowerCase()
  for (const c of candidates) {
    if (c.name && c.name.toLowerCase() === targetLower) return c.dir
  }
  for (const c of candidates) {
    const dirName = c.dir.split(/[\\/]/).pop()?.toLowerCase() || ''
    if (dirName === targetLower || dirName.includes(targetLower) || targetLower.includes(dirName)) return c.dir
  }
  return null
}

export function collectAllSkillDirs(root: string): string[] {
  const results: string[] = []
  const rootSkill = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(root, f)))
  if (rootSkill) results.push(root)
  const items = window.services.readDir(root) || []
  for (const item of items) {
    if (!item.isDirectory) continue
    results.push(...collectAllSkillDirs(item.path))
  }
  return results
}

export function readSkillDirMeta(dirPath: string): { name: string; description: string } {
  const skillFile = ['SKILL.md', 'skill.md'].map((f) => window.services.pathJoin(dirPath, f)).find((f) => window.services.pathExists(f))
  if (skillFile) {
    const content = window.services.readFile(skillFile)
    const fm = parseFrontmatter(content || '')
    return { name: fm.name || '', description: fm.description || '' }
  }
  return { name: '', description: '' }
}

export function useStoreDownload(opts: {
  activePresetId: Ref<string>
  downloadedIds: Ref<string[]>
  isDownloading: (id: string) => boolean
  refreshDownloadedIds: () => void
  showToast: ShowToast
  refreshCounts?: () => void
  bumpDownloadedSkillsVersion?: () => void
}) {
  const { enqueueDownload, updateItem, queue: downloadQueue } = useDownloadQueue()
  const { addTranslation } = useTranslationQueue()

  const showPickModal = ref(false)
  const pickSkills = ref<{ name: string; description: string; dir: string }[]>([])
  let pickSkillResolve: ((dir: string | null) => void) | null = null

  const showConfirmDelete = ref(false)
  const skillToDelete = ref<Skill | null>(null)

  function pickSkillDir(candidates: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      pickSkills.value = candidates.map((dir) => {
        const { name, description } = readSkillDirMeta(dir)
        const dirName = dir.split(/[\\/]/).pop() || dir
        return { name: name || dirName, description, dir }
      })
      pickSkillResolve = resolve
      showPickModal.value = true
    })
  }

  function handlePickSelect(dir: string) {
    pickSkillResolve?.(dir)
    showPickModal.value = false
    pickSkillResolve = null
  }

  function handlePickCancel() {
    pickSkillResolve?.(null)
    showPickModal.value = false
    pickSkillResolve = null
  }

  function autoTranslateSkill(skill: Skill, targetDir: string) {
    const settings = storage.getSettings()
    if (!settings.autoTranslate) return
    if (!settings.translationModelId) return

    const skillFile = ['SKILL.md', 'skill.md'].find((f) => window.services.pathExists(window.services.pathJoin(targetDir, f)))
    if (!skillFile) return

    const content = window.services.readFile(window.services.pathJoin(targetDir, skillFile))
    if (!content) return

    const fh = computeContentHash(content)
    if (!fh) return

    const desc = skill.description
    if (desc && !isChineseContent(desc)) {
      addTranslation(fh, 'desc', skill.name)
    }

    if (!isChineseContent(content)) {
      addTranslation(fh, 'content', skill.name)
    }
  }

  async function writeDownloadedFiles(skill: Skill, result: WellKnownSkillResult, queueItem: any) {
    const targetDir = getSkillsRepoDir(skill.id)
    atomicWriteDir(targetDir, result.files)
    finalizeImportedSkill({
      skill: { ...skill },
      targetDir,
      sourceType: resolveImportSourceType(skill.source),
      location: skill.repo || skill.sourceUrl || '',
      sessionSource: opts.activePresetId.value || 'unknown',
      storeSourceId: opts.activePresetId.value,
      forceStoreSourceId: true,
    })
    opts.refreshDownloadedIds()
    opts.refreshCounts?.()
    opts.bumpDownloadedSkillsVersion?.()
    autoTranslateSkill(skill, targetDir)
    updateItem(queueItem.id, { status: 'success' })
    opts.showToast({ type: 'success', message: `已导入 ${skill.name}` })
  }

  function downloadSkill(skill: Skill) {
    if (opts.downloadedIds.value.includes(skill.id) || opts.isDownloading(skill.id)) return

    const source = opts.activePresetId.value || 'unknown'
    enqueueDownload(skill.id, skill.name, source, async () => {
      const queueItem = downloadQueue.value.find((i) => i.type === 'download' && i.skillId === skill.id && i.status === 'running')
      if (!queueItem) throw new Error('队列项丢失')

      try {
        let result: WellKnownSkillResult | null = null

        if (isWellKnownSkill(skill)) {
          result = await downloadSkillFromWebsite(skill)
        }

        if (!result && skill.source === 'marketplace-json' && !skill.repo && skill.sourceUrl) {
          result = await downloadDirectFromStore(skill)
        }

        if (result) {
          await writeDownloadedFiles(skill, result, queueItem)
          return
        }

        if (!skill.repo) {
          opts.showToast({ type: 'error', message: '该技能没有关联的 GitHub 仓库，无法下载' })
          updateItem(queueItem.id, { status: 'error', error: '无 GitHub 仓库' })
          return
        }
        const gh = skillsSh.getGitHubRepo(skill)
        if (!gh) {
          opts.showToast({ type: 'error', message: '无效的 GitHub 仓库地址' })
          updateItem(queueItem.id, { status: 'error', error: '无效的 GitHub 仓库地址' })
          storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '无效的 GitHub 仓库地址' })
          return
        }
        const { owner, repo } = gh
        const skillPath = skill.path || skill.id
        const buffer = await window.services.downloadFile(
          `https://api.github.com/repos/${owner}/${repo}/zipball/${skill.branch || 'main'}`,
          storage.getSettings().githubToken || undefined,
        )
        const tempDir = window.services.pathJoin(window.services.homeDir(), '.cache/skill-hub/')
        window.services.mkdir(tempDir)
        const extractDir = window.services.pathJoin(tempDir, `extract-${skillIdSlug(skill.id)}`)
        window.services.removeFile(extractDir)
        window.services.extractBufferZip(buffer as ArrayBuffer, extractDir)
        const extractedItems = window.services.readDir(extractDir)
        const rootDir = extractedItems.find((d: any) => d.isDirectory)
        const sourceRoot = rootDir ? rootDir.path : extractDir
        let skillSourceDir: string | null = ''
        for (const p of collectPathCandidates(skillPath)) {
          const candidate = window.services.pathJoin(sourceRoot, p)
          if (window.services.pathExists(candidate)) {
            skillSourceDir = candidate
            break
          }
        }
        if (!skillSourceDir) {
          const allSkillDirs = collectAllSkillDirs(sourceRoot)
          if (allSkillDirs.length === 0) {
            opts.showToast({ type: 'error', message: '未找到技能文件' })
            updateItem(queueItem.id, { status: 'error', error: '未找到技能文件' })
            storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '未找到技能文件' })
            return
          }
          const metas = allSkillDirs.map((dir) => {
            const meta = readSkillDirMeta(dir)
            return { dir, ...meta }
          })
          skillSourceDir = matchSkillDirByMeta(metas, skill.name) || (await pickSkillDir(allSkillDirs))
        }
        if (!skillSourceDir) {
          opts.showToast({ type: 'error', message: '未找到技能文件' })
          updateItem(queueItem.id, { status: 'error', error: '未找到技能文件' })
          storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: '未找到技能文件' })
          return
        }
        const targetDir = getSkillsRepoDir(skill.id)
        atomicReplaceDir(skillSourceDir, targetDir)
        window.services.saveSkillMetaAfterDownload(
          skill.repo || '',
          skill.branch || 'main',
          storage.getSettings().githubToken || undefined,
          targetDir,
        )
        window.services.removeFile(extractDir)
        const repoPath = getRepoRelativeSkillPath(sourceRoot, skillSourceDir)
        finalizeImportedSkill({
          skill: { ...skill, path: repoPath || skill.path },
          targetDir,
          sourceType: opts.activePresetId.value === 'skills-sh' ? 'skills-sh' : 'github',
          location: skill.repo || '',
          sessionSource: opts.activePresetId.value || 'unknown',
          storeSourceId: opts.activePresetId.value,
          forceStoreSourceId: true,
        })
        opts.refreshDownloadedIds()
        opts.refreshCounts?.()
        autoTranslateSkill(skill, targetDir)
        updateItem(queueItem.id, { status: 'success' })
        opts.showToast({ type: 'success', message: `已导入 ${skill.name}` })
      } catch (err: any) {
        opts.showToast({ type: 'error', message: '导入失败: ' + (err.message || '未知错误') })
        updateItem(queueItem.id, { status: 'error', error: err.message || '未知错误' })
        storage.addFailureRecord({ type: 'download', skillId: skill.id, skillName: skill.name, error: err.message || '未知错误' })
      }
    })
  }

  function confirmDelete(skill: Skill) {
    skillToDelete.value = skill
    showConfirmDelete.value = true
  }

  async function executeDelete() {
    const skill = skillToDelete.value
    if (!skill) return
    showConfirmDelete.value = false
    skillToDelete.value = null
    try {
      const targetDir = getSkillsRepoDir(skill.id)
      window.services.removeFile(targetDir)
      storage.removeDownloadedId(skill.id)
      storage.removeAllForSkill(skill.id)
      storage.removeDownloadedSkill(skill.id)
      opts.refreshDownloadedIds()
      opts.refreshCounts?.()
      opts.showToast({ type: 'notification', message: `已删除 ${skill.name}` })
    } catch (err: any) {
      opts.showToast({ type: 'error', message: '删除失败: ' + (err.message || '未知错误') })
    }
  }

  return {
    showPickModal,
    pickSkills,
    handlePickSelect,
    handlePickCancel,
    showConfirmDelete,
    skillToDelete,
    confirmDelete,
    executeDelete,
    downloadSkill,
    getSkillUrl,
  }
}

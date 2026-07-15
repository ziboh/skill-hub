/**
 * Preload bridge entry — assembles window.services from domain modules.
 * plugin.json: "preload": "preload/services.js"
 */
const path = require('node:path')
const crypto = require('node:crypto')

const { homeDir, expandPath, safeResolveWithin, isWindows, isMacOS } = require('./lib/path-utils')
const {
  getAllowedWriteRoots,
  isUnderAllowedRoot,
  setAllowedWriteRoots,
} = require('./lib/write-roots')
const {
  doAtomicReplaceDir,
  doAtomicWriteDir,
  readFile,
  pathExists,
  mkdir,
  openFolder,
  readDir,
  readFileText,
  writeFile,
  renamePath,
  removeFile,
  removeEmptyAncestors,
  copyFile,
  stat,
  saveIconFile,
  writeSvgFile,
  listIconFiles,
  readFileAsDataUri,
  createSymlink,
  setSkillEnabled,
} = require('./lib/fs')
const { downloadFile } = require('./lib/github-http')
const { extractBufferZip } = require('./lib/zip')
const { scanForSkills, scanForSkillFiles, scanForSkillFilesIncludingDisabled, parseSkillFile } = require('./lib/scan')
const { deployPlatformSkill, uninstallPlatformSkill } = require('./lib/platform-deploy')
const {
  getLatestCommitSha,
  getRemoteSkillTree,
  saveSkillMeta,
  loadSkillMeta,
  saveSkillMetaAfterDownload,
  buildLocalFileManifest,
  checkSkillUpdateFull,
  updateSkillFromGitHub,
  getStateDir,
} = require('./lib/github-skills')

window.services = {
  hashContent(content) {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex')
  },
  readFile,
  expandPath,
  homeDir,
  isWindows,
  isMacOS,
  pathJoin: (...parts) => path.join(...parts),
  safeJoin(base, ...parts) {
    return safeResolveWithin(base, ...parts)
  },
  setAllowedWriteRoots,
  getAllowedWriteRoots,
  isPathWritable(filePath) {
    try {
      return isUnderAllowedRoot(filePath)
    } catch {
      return false
    }
  },
  atomicReplaceDir: doAtomicReplaceDir,
  atomicWriteDir: doAtomicWriteDir,
  pathExists,
  mkdir,
  openFolder,
  readDir,
  readFileText,
  writeFile,
  renamePath,
  removeFile,
  removeEmptyAncestors,
  copyFile,
  stat,
  saveIconFile,
  writeSvgFile,
  listIconFiles,
  readFileAsDataUri,
  createSymlink,
  setSkillEnabled,
  downloadFile,
  extractBufferZip,
  scanForSkills,
  scanForSkillFiles,
  scanForSkillFilesIncludingDisabled,
  parseSkillFile,
  deployPlatformSkill,
  uninstallPlatformSkill,
  getLatestCommitSha,
  getRemoteSkillTree,
  saveSkillMeta,
  loadSkillMeta,
  saveSkillMetaAfterDownload,
  buildLocalFileManifest,
  checkSkillUpdateFull,
  updateSkillFromGitHub,
  getStateDir,
}

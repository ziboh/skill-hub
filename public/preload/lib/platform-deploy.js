const { deployCherryStudioSkill, uninstallCherryStudioSkill } = require('./cherry-studio')

const platformAdapters = new Map([['cherry-studio', deployCherryStudioSkill]])
const uninstallAdapters = new Map([['cherry-studio', uninstallCherryStudioSkill]])

function deployPlatformSkill(options) {
  const adapter = platformAdapters.get(options?.platformId)
  if (!adapter) return { handled: false }
  const result = adapter(options)
  return { handled: true, targetDir: result.targetDir }
}

function uninstallPlatformSkill(options) {
  const adapter = uninstallAdapters.get(options?.platformId)
  if (!adapter) return { handled: false }
  const result = adapter(options)
  return { handled: true, targetDir: result.targetDir }
}

module.exports = { deployPlatformSkill, uninstallPlatformSkill }

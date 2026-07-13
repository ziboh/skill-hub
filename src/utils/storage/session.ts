import type { SessionDownload } from './core'

const _sessionDownloads: SessionDownload[] = []

export const sessionApi = {
  getSessionDownloads(): SessionDownload[] {
    return _sessionDownloads
  },
  addSessionDownload(skillId: string, skillName: string, source: string): void {
    const download: SessionDownload = {
      skillId,
      skillName,
      source,
      downloadedAt: new Date().toISOString(),
    }
    _sessionDownloads.unshift(download)
  },
}

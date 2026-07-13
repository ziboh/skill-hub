import type { StoreSource } from '../../types'
import { KEYS, dbGet, dbSet, setDownloadedSkillsCache } from './core'
import { skillsApi } from './skills'
import { webCacheApi } from './web-cache'

export const storeSourcesApi = {
  getStoreSources(): StoreSource[] {
    const sources = dbGet<StoreSource[]>(KEYS.STORE_SOURCES) || []
    return sources
  },
  saveStoreSource(source: StoreSource): void {
    const sources = storeSourcesApi.getStoreSources()
    const idx = sources.findIndex((s) => s.id === source.id)
    if (idx >= 0) sources[idx] = source
    else sources.push(source)
    dbSet(KEYS.STORE_SOURCES, sources)
  },
  removeStoreSource(id: string): void {
    const sources = storeSourcesApi.getStoreSources().filter((s) => s.id !== id)
    dbSet(KEYS.STORE_SOURCES, sources)
    const downloaded = skillsApi.getDownloadedSkills()
    const updated = downloaded.map((s) => (s.storeSourceId === id ? { ...s, storeSourceId: undefined } : s))
    if (updated.length !== downloaded.length || updated.some((s, i) => s.storeSourceId !== downloaded[i].storeSourceId)) {
      dbSet(KEYS.DOWNLOADED_SKILLS, updated)
      setDownloadedSkillsCache(updated)
    }
    webCacheApi.clearWebCache(id)
  },
}

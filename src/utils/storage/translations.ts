import { KEYS, dbGet, dbSet } from './core'

type TranslationEntry = {
  sourceContent?: string
  translatedContent?: string
  translatedDesc?: string
  mode?: string
  updatedAt: number
  skillName?: string
}

function _readTranslationCache(): Record<string, TranslationEntry> {
  let cache: Record<string, any> = {}
  try {
    cache = dbGet<Record<string, any>>(KEYS.TRANSLATIONS) || {}
  } catch {
    console.warn('[storage] failed to read translation cache')
  }
  return cache
}

function _writeTranslationCache(cache: Record<string, any>): void {
  dbSet(KEYS.TRANSLATIONS, cache)
}

export const translationsApi = {
  _readTranslationCache,
  _writeTranslationCache,
  getTranslationByHash(hash: string): TranslationEntry | null {
    const cache = _readTranslationCache()
    return cache[hash] || null
  },
  saveTranslationByHash(
    hash: string,
    data: { sourceContent?: string; translatedContent?: string; translatedDesc?: string; mode?: string; skillName?: string },
  ): void {
    const cache = _readTranslationCache()
    const existing = cache[hash] || {}
    cache[hash] = { ...existing, ...data, updatedAt: Date.now() }
    _writeTranslationCache(cache)
  },
  removeTranslationByHash(hash: string, type?: 'content' | 'desc'): void {
    const cache = _readTranslationCache()
    const existing = cache[hash]
    if (!existing) return
    if (type === 'desc') {
      delete existing.translatedDesc
    } else if (type === 'content') {
      delete existing.sourceContent
      delete existing.translatedContent
      delete existing.mode
    } else {
      delete cache[hash]
      _writeTranslationCache(cache)
      return
    }
    if (!existing.translatedDesc && !existing.translatedContent) {
      delete cache[hash]
    }
    _writeTranslationCache(cache)
  },
  getTranslationCaches(): Record<string, TranslationEntry> {
    return _readTranslationCache()
  },
  saveDescTranslationByHash(hash: string, translatedDesc: string, skillName?: string): void {
    const cache = _readTranslationCache()
    const existing = cache[hash] || {}
    cache[hash] = { ...existing, translatedDesc, updatedAt: Date.now(), skillName }
    _writeTranslationCache(cache)
  },
  getDescTranslationByHash(hash: string): string | null {
    const cache = _readTranslationCache()
    return cache[hash]?.translatedDesc || null
  },
}

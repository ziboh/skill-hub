import { dbGet, dbSet } from './core'

export const pageStateApi = {
  savePageState(pageId: string, state: Record<string, any>): void {
    const all = dbGet<Record<string, any>>('page_state') || {}
    all[pageId] = state
    dbSet('page_state', all)
  },
  getPageState(pageId: string): Record<string, any> | null {
    const all = dbGet<Record<string, any>>('page_state')
    return all?.[pageId] ?? null
  },
  getAllPageStates(): Record<string, any> {
    return dbGet<Record<string, any>>('page_state') || {}
  },
}

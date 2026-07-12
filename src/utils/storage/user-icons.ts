import type { UserIconEntry } from '../../types'
import { KEYS, dbGet, dbSet } from './core'

export const userIconsApi = {
  getUserIcons(): UserIconEntry[] {
    return dbGet<UserIconEntry[]>(KEYS.USER_ICONS) || []
  },

  addUserIcon(path: string, name: string): UserIconEntry {
    const icons = userIconsApi.getUserIcons()
    const entry: UserIconEntry = {
      id: `uicon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      name,
      createdAt: new Date().toISOString(),
    }
    icons.unshift(entry)
    dbSet(KEYS.USER_ICONS, icons)
    return entry
  },

  removeUserIcon(id: string): void {
    const icons = userIconsApi.getUserIcons().filter((i) => i.id !== id)
    dbSet(KEYS.USER_ICONS, icons)
  },

  findUserIconById(id: string): UserIconEntry | undefined {
    return userIconsApi.getUserIcons().find((i) => i.id === id)
  },

  pruneMissing(): number {
    const icons = userIconsApi.getUserIcons()
    const before = icons.length
    const alive = icons.filter((i) => {
      try {
        return window.services?.pathExists?.(i.path)
      } catch {
        return false
      }
    })
    if (alive.length !== before) {
      dbSet(KEYS.USER_ICONS, alive)
    }
    return before - alive.length
  },
}

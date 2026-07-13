import type { PlatformInfo } from '../../types'
import { KEYS, dbGet, dbSet } from './core'

export const platformsApi = {
  getPlatformConfigs(): PlatformInfo[] {
    return dbGet<PlatformInfo[]>(KEYS.PLATFORM_CONFIGS) || []
  },
  savePlatformConfigs(configs: PlatformInfo[]): void {
    dbSet(KEYS.PLATFORM_CONFIGS, configs)
  },
  getPlatformOrder(): string[] {
    return dbGet<string[]>(KEYS.PLATFORM_ORDER) || []
  },
  savePlatformOrder(order: string[]): void {
    dbSet(KEYS.PLATFORM_ORDER, order)
  },
}

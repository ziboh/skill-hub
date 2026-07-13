import type { DistributeRecord } from '../../types'
import {
  KEYS,
  dbGet,
  dbSet,
  getDistributeRecordsCache,
  setDistributeRecordsCache,
  getDistributedSkillSetCache,
  setDistributedSkillSetCache,
  reseedDistributeRecords,
} from './core'

export const distributeApi = {
  getDistributeRecords(): DistributeRecord[] {
    if (!getDistributeRecordsCache()) setDistributeRecordsCache(dbGet<DistributeRecord[]>(KEYS.DISTRIBUTED_SKILLS) || [])
    return getDistributeRecordsCache()!
  },
  getDistributedSkillSet(): Set<string> {
    if (!getDistributedSkillSetCache()) setDistributedSkillSetCache(new Set(distributeApi.getDistributeRecords().map((r) => r.skillId)))
    return getDistributedSkillSetCache()!
  },
  saveDistributeRecord(record: DistributeRecord): void {
    const records = [...distributeApi.getDistributeRecords()]
    const idx = records.findIndex((r) => r.skillId === record.skillId && r.platformId === record.platformId && r.scope === record.scope)
    if (idx >= 0) records[idx] = record
    else records.push(record)
    reseedDistributeRecords(records)
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  removeDistributeRecord(skillId: string, platformId: string, scope?: string): void {
    const records = distributeApi.getDistributeRecords().filter((r) => {
      if (r.skillId !== skillId || r.platformId !== platformId) return true
      if (scope === undefined || scope === '') return false
      return (r.scope || '') !== scope
    })
    reseedDistributeRecords(records)
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  removeAllForSkill(skillId: string): void {
    const records = distributeApi.getDistributeRecords().filter((r) => r.skillId !== skillId)
    reseedDistributeRecords(records)
    dbSet(KEYS.DISTRIBUTED_SKILLS, records)
  },
  getDistributedForPlatform(platformId: string): DistributeRecord[] {
    return distributeApi.getDistributeRecords().filter((r) => r.platformId === platformId)
  },
  getDistributedForSkill(skillId: string): DistributeRecord[] {
    return distributeApi.getDistributeRecords().filter((r) => r.skillId === skillId)
  },
}

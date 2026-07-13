import type { FailureRecord, FailureType } from '../../types'
import { KEYS, dbGet, dbSet } from './core'

export const failuresApi = {
  getFailureRecords(): FailureRecord[] {
    return dbGet<FailureRecord[]>(KEYS.FAILURE_RECORDS) || []
  },
  addFailureRecord(record: Omit<FailureRecord, 'id' | 'timestamp'>): FailureRecord {
    const records = failuresApi.getFailureRecords()
    const newRecord: FailureRecord = {
      ...record,
      id: `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }
    records.unshift(newRecord)
    if (records.length > 1000) {
      records.splice(1000)
    }
    dbSet(KEYS.FAILURE_RECORDS, records)
    return newRecord
  },
  removeFailureRecord(id: string): void {
    const records = failuresApi.getFailureRecords().filter((r) => r.id !== id)
    dbSet(KEYS.FAILURE_RECORDS, records)
  },
  clearFailureRecords(type?: FailureType): void {
    if (type) {
      const records = failuresApi.getFailureRecords().filter((r) => r.type !== type)
      dbSet(KEYS.FAILURE_RECORDS, records)
    } else {
      dbSet(KEYS.FAILURE_RECORDS, [])
    }
  },
}

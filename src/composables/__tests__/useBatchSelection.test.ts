import { describe, test, expect } from 'vitest'
import { ref } from 'vue'
import { useBatchSelection } from '../useBatchSelection'

describe('useBatchSelection', () => {
  const items = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]

  test('starts with batchMode off and empty selection', () => {
    const { batchMode, selectedIds, isAllSelected } = useBatchSelection({
      getItems: () => items,
      getKey: (item) => item.id,
    })
    expect(batchMode.value).toBe(false)
    expect(selectedIds.value.size).toBe(0)
    expect(isAllSelected.value).toBe(false)
  })

  test('toggleBatchMode turns on and clears selection', () => {
    const api = useBatchSelection({
      getItems: () => items,
      getKey: (item) => item.id,
    })
    api.toggleSelect('a')
    expect(api.selectedIds.value.has('a')).toBe(true)
    api.toggleBatchMode()
    expect(api.batchMode.value).toBe(true)
    expect(api.selectedIds.value.size).toBe(0)
    api.toggleBatchMode()
    expect(api.batchMode.value).toBe(false)
  })

  test('toggleSelect adds and removes ids', () => {
    const { toggleSelect, selectedIds } = useBatchSelection({
      getItems: () => items,
      getKey: (item) => item.id,
    })
    toggleSelect('a')
    toggleSelect('b')
    expect([...selectedIds.value]).toEqual(['a', 'b'])
    toggleSelect('a')
    expect([...selectedIds.value]).toEqual(['b'])
  })

  test('toggleSelectAll selects all then clears', () => {
    const { toggleSelectAll, selectedIds, isAllSelected } = useBatchSelection({
      getItems: () => items,
      getKey: (item) => item.id,
    })
    toggleSelectAll()
    expect(selectedIds.value.size).toBe(3)
    expect(isAllSelected.value).toBe(true)
    toggleSelectAll()
    expect(selectedIds.value.size).toBe(0)
    expect(isAllSelected.value).toBe(false)
  })

  test('getItems can be a ref-backed getter', () => {
    const list = ref([{ dir: '/x' }, { dir: '/y' }])
    const { toggleSelectAll, selectedIds, isAllSelected } = useBatchSelection({
      getItems: () => list.value,
      getKey: (item) => item.dir,
    })
    toggleSelectAll()
    expect([...selectedIds.value]).toEqual(['/x', '/y'])
    expect(isAllSelected.value).toBe(true)
    list.value = [{ dir: '/x' }]
    expect(isAllSelected.value).toBe(false)
  })

  test('exitBatchMode clears mode and selection', () => {
    const api = useBatchSelection({
      getItems: () => items,
      getKey: (item) => item.id,
    })
    api.toggleBatchMode()
    api.toggleSelect('a')
    api.exitBatchMode()
    expect(api.batchMode.value).toBe(false)
    expect(api.selectedIds.value.size).toBe(0)
  })

  test('isAllSelected is false when items empty', () => {
    const { isAllSelected, toggleSelectAll, selectedIds } = useBatchSelection({
      getItems: () => [],
      getKey: (item: { id: string }) => item.id,
    })
    toggleSelectAll()
    expect(selectedIds.value.size).toBe(0)
    expect(isAllSelected.value).toBe(false)
  })
})

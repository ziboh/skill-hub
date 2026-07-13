import { ref, computed, type Ref, type ComputedRef } from 'vue'

export function useBatchSelection<T>(opts: { getItems: () => T[]; getKey: (item: T) => string }): {
  batchMode: Ref<boolean>
  selectedIds: Ref<Set<string>>
  isAllSelected: ComputedRef<boolean>
  toggleBatchMode: () => void
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  exitBatchMode: () => void
  clearSelection: () => void
} {
  const batchMode = ref(false)
  const selectedIds = ref<Set<string>>(new Set())

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value
    clearSelection()
  }

  function exitBatchMode() {
    batchMode.value = false
    clearSelection()
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function toggleSelectAll() {
    const items = opts.getItems()
    if (selectedIds.value.size === items.length && items.length > 0) {
      clearSelection()
    } else {
      selectedIds.value = new Set(items.map((item) => opts.getKey(item)))
    }
  }

  const isAllSelected = computed(() => {
    const items = opts.getItems()
    return items.length > 0 && selectedIds.value.size === items.length
  })

  return {
    batchMode,
    selectedIds,
    isAllSelected,
    toggleBatchMode,
    toggleSelect,
    toggleSelectAll,
    exitBatchMode,
    clearSelection,
  }
}

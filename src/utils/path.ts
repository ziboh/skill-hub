export function normalizePath(p: string): string {
  if (!p) return ''
  return p
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
    .replace(/^\.\//, '')
}

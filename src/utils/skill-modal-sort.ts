export function sortProcessedSkillsLast<T>(items: T[], isProcessed: (item: T) => boolean): T[] {
  return [...items].sort((a, b) => Number(isProcessed(a)) - Number(isProcessed(b)))
}

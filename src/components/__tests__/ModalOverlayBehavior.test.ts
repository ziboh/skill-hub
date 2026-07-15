import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..')
const modalOverlayClass = /(?:modal|confirm|dialog|cleanup|deploy|pick|store-config|translate-panel)-(?:overlay|detail-fixed)|dm-(?:overlay|detail-fixed)/

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? vueFiles(path) : extname(path) === '.vue' ? [path] : []
  })
}

describe('弹窗遮罩交互', () => {
  test('所有弹窗点击外部均不会触发关闭操作', () => {
    const offenders = vueFiles(srcDir).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return [...source.matchAll(/<[^>]+>/g)]
        .filter(([tag]) => modalOverlayClass.test(tag) && /@click(?:\.self)?=/.test(tag))
        .map((match) => `${relative(srcDir, path)}:${source.slice(0, match.index).split('\n').length}`)
    })

    expect(offenders).toEqual([])
  })
})

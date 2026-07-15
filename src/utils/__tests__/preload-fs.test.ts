import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { doAtomicReplaceDir, doAtomicWriteDir, writeSvgFile, renamePath } = require('../../../public/preload/lib/fs.js')
const { setAllowedWriteRoots } = require('../../../public/preload/lib/write-roots.js')

const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  setAllowedWriteRoots([])
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('preload filesystem safety', () => {
  it('keeps the old directory when an atomic replacement fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-atomic-'))
    roots.push(root)
    const source = path.join(root, 'source')
    const target = path.join(root, 'target')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'SKILL.md'), 'new')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'old')
    setAllowedWriteRoots([root])
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {
      throw new Error('copy failed')
    })

    expect(() => doAtomicReplaceDir(source, target)).toThrow('copy failed')
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('old')
  })

  it('keeps the old directory when new files are invalid', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-atomic-'))
    roots.push(root)
    const target = path.join(root, 'target')
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'old')
    setAllowedWriteRoots([root])

    expect(() => doAtomicWriteDir(target, { 'README.md': 'new' })).toThrow('SKILL.md')
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('old')
  })

  it('rejects icon filenames outside the icon directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-icons-'))
    roots.push(root)
    const userData = path.join(root, 'user-data')
    fs.mkdirSync(userData)
    ;(globalThis as any).window = { ztools: { getPath: () => userData } }
    setAllowedWriteRoots([userData])

    expect(() => writeSvgFile('<svg />', '../outside.svg')).toThrow()
    expect(fs.existsSync(path.join(root, 'outside.svg'))).toBe(false)
  })

  it('does not move a source outside the allowed write roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-rename-'))
    roots.push(root)
    const userData = path.join(root, 'user-data')
    const outside = path.join(root, 'outside.txt')
    fs.mkdirSync(userData)
    fs.writeFileSync(outside, 'keep')
    setAllowedWriteRoots([userData])

    expect(() => renamePath(outside, path.join(userData, 'inside.txt'))).toThrow('outside allowed roots')
    expect(fs.existsSync(outside)).toBe(true)
  })
})

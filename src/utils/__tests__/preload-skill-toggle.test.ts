import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { setSkillEnabled } = require('../../../public/preload/lib/fs.js')
const { setAllowedWriteRoots } = require('../../../public/preload/lib/write-roots.js')

const roots: string[] = []

afterEach(() => {
  setAllowedWriteRoots([])
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('preload skill toggle', () => {
  it('renames the skill file without deleting the skill directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-toggle-'))
    roots.push(root)
    const skillDir = path.join(root, 'demo')
    fs.mkdirSync(skillDir)
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# demo\n')
    setAllowedWriteRoots([root])

    expect(setSkillEnabled(skillDir, false)).toMatchObject({ enabled: false })
    expect(fs.existsSync(skillDir)).toBe(true)
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(false)
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md.disabled'))).toBe(true)

    expect(setSkillEnabled(skillDir, true)).toMatchObject({ enabled: true })
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md.disabled'))).toBe(false)
  })
})

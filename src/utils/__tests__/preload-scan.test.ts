import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { scanForSkills, scanForSkillFilesIncludingDisabled } = require('../../../public/preload/lib/scan.js')

const roots: string[] = []

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('preload skill scan', () => {
  it('does not recognize disabled files in the default scan but can load them for management pages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-hub-scan-'))
    roots.push(root)
    const skillDir = path.join(root, 'demo')
    fs.mkdirSync(skillDir)
    fs.writeFileSync(path.join(skillDir, 'SKILL.md.disabled'), '# demo\n')

    expect(scanForSkills(root)).toHaveLength(0)
    expect(scanForSkillFilesIncludingDisabled([root])).toMatchObject([
      { name: 'demo', enabled: false, skillFile: path.join(skillDir, 'SKILL.md.disabled') },
    ])
  })
})

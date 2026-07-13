import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { parseSkillFrontmatter } = require('../../../public/preload/lib/frontmatter.js')

describe('preload parseSkillFrontmatter', () => {
  test('parses simple frontmatter', () => {
    const content = `---
name: Hello
description: A skill
author: me
tags: a, b
---
# body
`
    const m = parseSkillFrontmatter(content)
    expect(m.name).toBe('Hello')
    expect(m.description).toBe('A skill')
    expect(m.author).toBe('me')
    expect(m.tags).toEqual(['a', 'b'])
  })

  test('parses yaml list tags', () => {
    const content = `---
name: T
tags:
  - foo
  - bar
---
`
    const m = parseSkillFrontmatter(content)
    expect(m.tags).toEqual(['foo', 'bar'])
  })

  test('falls back description from body', () => {
    const content = `# Title\n\nFirst line of body\n`
    const m = parseSkillFrontmatter(content)
    expect(m.description).toContain('First line')
  })
})

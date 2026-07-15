import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viewSource = readFileSync(resolve(process.cwd(), 'src/views/MySkills/index.vue'), 'utf8')

describe('MySkills category filter icons', () => {
  test('renders category icon keys through UiIcon instead of showing the key as text', () => {
    expect(viewSource).toContain('<UiIcon :name="cat.icon"')
    expect(viewSource).not.toContain('{{ cat.icon }}')
  })
})

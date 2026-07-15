import { describe, expect, test } from 'vitest'
import { CATEGORY_ICONS } from '../skill-categories'

describe('skill category icons', () => {
  test('uses named icons instead of emoji values', () => {
    expect(CATEGORY_ICONS).toEqual({
      search: 'search',
      content: 'sparkles',
      dev: 'wrench',
      testing: 'pencil',
      ops: 'rocket',
      other: 'clipboard',
    })
  })
})

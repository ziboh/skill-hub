import { describe, expect, test } from 'vitest'
import '../builtins'
import { getIconAsset } from '../registry'

const RASTER_BACKED_PROVIDER_IDS = ['dola', 'querit', 'think-any', 'xiaoyi', 'you', 'zhida']

describe('built-in icon registration', () => {
  test.each(RASTER_BACKED_PROVIDER_IDS)('renders raster-backed provider %s as a trusted image asset', (id) => {
    expect(getIconAsset(`providers:${id}`)?.type).toBe('module-url')
  })

  test('keeps vector provider icons on the sanitized inline SVG path', () => {
    expect(getIconAsset('providers:openai')?.type).toBe('module-svg')
  })
})

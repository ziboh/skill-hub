import type { IconValue, ResolvedIcon } from './types'
import { getIconAsset } from './registry'

let uidCounter = 0

export function injectSvgIds(raw: string): string {
  const uid = `c${++uidCounter}`
  return raw
    .replace(/\sid="([^"]+)"/g, ` id="${uid}-$1"`)
    .replace(/url\(#/g, `url(#${uid}-`)
    .replace(/xlink:href="#/g, `xlink:href="#${uid}-`)
    .replace(/\shref="#/g, ` href="#${uid}-`)
}

export async function resolveIcon(value: IconValue): Promise<ResolvedIcon> {
  if (value.kind === 'empty') return { mode: 'empty' }
  if (value.kind === 'inline-svg') return { mode: 'svg', svg: injectSvgIds(value.value) }
  if (value.kind === 'src') return { mode: 'img', src: value.value }
  if (value.kind === 'local') {
    try {
      const dataUri = (window as any)?.services?.readFileAsDataUri?.(value.value)
      if (dataUri) return { mode: 'img', src: dataUri }
    } catch {
      /* ignore */
    }
    return { mode: 'empty' }
  }
  const asset = getIconAsset(value.value)
  if (!asset) return { mode: 'empty' }
  try {
    if (asset.type === 'inline-svg') return { mode: 'svg', svg: injectSvgIds(asset.svg) }
    if (asset.type === 'src') return { mode: 'img', src: asset.src }
    if (asset.type === 'module-svg') {
      const svg = await asset.load()
      return svg ? { mode: 'svg', svg: injectSvgIds(svg) } : { mode: 'empty' }
    }
    if (asset.type === 'module-url') {
      const src = await asset.load()
      return src ? { mode: 'img', src } : { mode: 'empty' }
    }
  } catch {
    return { mode: 'empty' }
  }
  return { mode: 'empty' }
}

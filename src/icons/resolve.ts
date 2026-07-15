import type { IconValue, ResolvedIcon } from './types'
import { getIconAsset } from './registry'
import { sanitizeSvg } from '../utils/sanitize-html'

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
  if (value.kind === 'inline-svg') return resolveSvg(value.value)
  if (value.kind === 'src') return { mode: 'img', src: value.value }
  if (value.kind === 'local') {
    try {
      const svc = (window as any)?.services
      const filePath = value.value
      // Prefer inline SVG so mono/theme CSS can style fills
      if (/\.svg$/i.test(filePath) && typeof svc?.readFile === 'function') {
        const svg = svc.readFile(filePath)
          if (typeof svg === 'string' && svg.trim().startsWith('<svg')) return resolveSvg(svg.trim())
      }
      const dataUri = svc?.readFileAsDataUri?.(filePath)
      if (dataUri) return { mode: 'img', src: dataUri }
    } catch {
      /* ignore */
    }
    return { mode: 'empty' }
  }
  const asset = getIconAsset(value.value)
  if (!asset) return { mode: 'empty' }
  try {
    if (asset.type === 'inline-svg') return resolveSvg(asset.svg)
    if (asset.type === 'src') return { mode: 'img', src: asset.src }
    if (asset.type === 'module-svg') {
      const svg = await asset.load()
      return svg ? resolveSvg(svg) : { mode: 'empty' }
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

function resolveSvg(raw: string): ResolvedIcon {
  const safe = sanitizeSvg(raw)
  return safe ? { mode: 'svg', svg: injectSvgIds(safe) } : { mode: 'empty' }
}

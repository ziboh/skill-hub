import { afterEach, describe, expect, test, vi } from 'vitest'
import { animateStoreCardTransfer } from '../store-card-motion'

const originalAnimate = HTMLElement.prototype.animate
function rect(left: number, top: number, width = 280, height = 120): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

describe('商店卡片转移动效', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    HTMLElement.prototype.animate = originalAnimate
    vi.unstubAllGlobals()
  })

  test('从可用卡片生成快照并飞向已导入卡片', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const source = document.createElement('article')
    const target = document.createElement('article')
    source.getBoundingClientRect = () => rect(40, 420)
    target.getBoundingClientRect = () => rect(40, 80)
    const animate = vi.fn(() => ({ finished: Promise.resolve() }))
    HTMLElement.prototype.animate = animate as typeof HTMLElement.prototype.animate
    document.body.append(source, target)
    await animateStoreCardTransfer(source, target)
    expect(animate).toHaveBeenCalledOnce()
    expect(document.querySelector('.store-card-flight')).toBeNull()
    expect(target.classList.contains('store-card-arrived')).toBe(true)
  })

  test('系统要求减少动态效果时不创建快照', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const source = document.createElement('article')
    const target = document.createElement('article')
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as typeof HTMLElement.prototype.animate
    await animateStoreCardTransfer(source, target)
    expect(animate).not.toHaveBeenCalled()
  })

  test('来源卡片已离开文档时使用安装前捕获的位置', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const source = document.createElement('article')
    const target = document.createElement('article')
    source.getBoundingClientRect = () => rect(0, 0, 0, 0)
    target.getBoundingClientRect = () => rect(20, 60)
    const animate = vi.fn(() => ({ finished: Promise.resolve() }))
    HTMLElement.prototype.animate = animate as typeof HTMLElement.prototype.animate
    document.body.append(target)
    await animateStoreCardTransfer(source, target, rect(20, 360))
    expect(animate).toHaveBeenCalledOnce()
  })
})

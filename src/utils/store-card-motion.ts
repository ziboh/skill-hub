function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export async function animateStoreCardTransfer(source: HTMLElement, target: HTMLElement, sourceRect?: DOMRect): Promise<void> {
  if (prefersReducedMotion()) return
  const from = sourceRect || source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  if (!from.width || !from.height || !to.width || !to.height) return

  const snapshot = source.cloneNode(true) as HTMLElement
  snapshot.className = `${snapshot.className} store-card-flight`
  Object.assign(snapshot.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: '0', pointerEvents: 'none', zIndex: '1000',
  })
  document.body.appendChild(snapshot)
  const animation = snapshot.animate(
    [
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.92 },
      { transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0) scale(${to.width / from.width}, ${to.height / from.height})`, opacity: 0.18 },
    ],
    { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  )
  try { await animation.finished } finally { snapshot.remove() }
  target.classList.add('store-card-arrived')
  window.setTimeout(() => target.classList.remove('store-card-arrived'), 700)
}

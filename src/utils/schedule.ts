/** Leading + trailing coalescer: first call runs now; further calls within `waitMs` share one trailing run. */
export function createLeadingTrailingScheduler(fn: () => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let lastRun = 0

  function run() {
    lastRun = Date.now()
    pending = false
    fn()
  }

  function schedule() {
    const now = Date.now()
    const elapsed = now - lastRun
    if (lastRun === 0 || elapsed >= waitMs) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      run()
      return
    }
    pending = true
    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        if (pending) run()
      }, waitMs - elapsed)
    }
  }

  schedule.flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending) run()
  }

  schedule.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pending = false
  }

  return schedule
}

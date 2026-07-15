export function withTimeout<T>(request: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      controller.abort()
      reject(new Error('timeout'))
    }, ms)

    request(controller.signal).then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

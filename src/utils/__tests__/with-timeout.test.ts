import { describe, expect, test, vi } from 'vitest'
import { withTimeout } from '../with-timeout'

describe('withTimeout', () => {
  test('aborts the request when the timeout expires', async () => {
    vi.useFakeTimers()
    const request = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        }),
    )

    const promise = withTimeout(request, 1000)
    const assertion = expect(promise).rejects.toThrow('timeout')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion

    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0][0].aborted).toBe(true)
    vi.useRealTimers()
  })
})

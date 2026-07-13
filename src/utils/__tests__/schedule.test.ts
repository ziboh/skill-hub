import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLeadingTrailingScheduler } from '../schedule'

describe('createLeadingTrailingScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('runs immediately on first call', () => {
    const fn = vi.fn()
    const schedule = createLeadingTrailingScheduler(fn, 100)
    schedule()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('coalesces bursts into one trailing run', () => {
    const fn = vi.fn()
    const schedule = createLeadingTrailingScheduler(fn, 100)
    schedule()
    schedule()
    schedule()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('allows a new leading run after window ends', () => {
    const fn = vi.fn()
    const schedule = createLeadingTrailingScheduler(fn, 100)
    schedule()
    vi.advanceTimersByTime(100)
    schedule()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('flush runs pending work immediately', () => {
    const fn = vi.fn()
    const schedule = createLeadingTrailingScheduler(fn, 100)
    schedule()
    schedule()
    schedule.flush()
    expect(fn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

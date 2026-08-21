import { describe, expect, it } from 'vitest'
import { RateLimitedRetryQueue } from '@/lib/async-request-queue'
import {
  BAIDU_REQUEST_INTERVAL_MS,
  BAIDU_RETRY_DELAYS_MS,
} from '@/lib/baidu'

describe('Baidu request scheduling', () => {
  it('starts no more than three requests per second', async () => {
    let now = 0
    const starts: number[] = []
    const queue = new RateLimitedRetryQueue({
      intervalMs: BAIDU_REQUEST_INTERVAL_MS,
      retryDelaysMs: BAIDU_RETRY_DELAYS_MS,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds
      },
    })

    await Promise.all(
      Array.from({ length: 6 }, () =>
        queue.run(async () => {
          starts.push(now)
        }),
      ),
    )

    expect(starts).toEqual([0, 500, 1000, 1500, 2000, 2500])
  })

  it('retries failures with one, two, four and eight second backoff', async () => {
    let now = 0
    let attempts = 0
    const waits: number[] = []
    const queue = new RateLimitedRetryQueue({
      intervalMs: 0,
      retryDelaysMs: BAIDU_RETRY_DELAYS_MS,
      now: () => now,
      sleep: async (milliseconds) => {
        waits.push(milliseconds)
        now += milliseconds
      },
    })

    const result = await queue.run(async () => {
      attempts += 1
      if (attempts < 5) throw new Error('QPS limited')
      return 'ready'
    })

    expect(result).toBe('ready')
    expect(attempts).toBe(5)
    expect(waits).toEqual([1000, 2000, 4000, 8000])
  })

  it('does not start an API request after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const queue = new RateLimitedRetryQueue({
      intervalMs: BAIDU_REQUEST_INTERVAL_MS,
      retryDelaysMs: BAIDU_RETRY_DELAYS_MS,
      sleep: async () => undefined,
    })

    await expect(
      queue.run(
        async () => {
          called = true
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('Request cancelled')
    expect(called).toBe(false)
  })
})

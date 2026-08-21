export interface RetryQueueOptions {
  intervalMs: number
  retryDelaysMs: readonly number[]
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

export interface QueueRunOptions {
  signal?: AbortSignal
  onRetry?: (retryNumber: number, delayMs: number, error: unknown) => void
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

function cancellationError() {
  return new Error('Request cancelled')
}

export class RateLimitedRetryQueue {
  private readonly intervalMs: number
  private readonly retryDelaysMs: readonly number[]
  private readonly now: () => number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private gate: Promise<void> = Promise.resolve()
  private nextStartAt = 0

  constructor(options: RetryQueueOptions) {
    this.intervalMs = options.intervalMs
    this.retryDelaysMs = options.retryDelaysMs
    this.now = options.now || Date.now
    this.sleep = options.sleep || defaultSleep
  }

  private scheduleStart(signal?: AbortSignal) {
    const slot = this.gate.then(async () => {
      if (signal?.aborted) throw cancellationError()
      const waitMs = Math.max(0, this.nextStartAt - this.now())
      if (waitMs > 0) await this.sleep(waitMs)
      if (signal?.aborted) throw cancellationError()
      this.nextStartAt = this.now() + this.intervalMs
    })
    this.gate = slot.catch(() => undefined)
    return slot
  }

  async run<T>(
    request: (attempt: number) => Promise<T>,
    options: QueueRunOptions = {},
  ): Promise<T> {
    let attempt = 0

    while (true) {
      await this.scheduleStart(options.signal)
      try {
        return await request(attempt)
      } catch (error) {
        if (options.signal?.aborted || attempt >= this.retryDelaysMs.length) {
          throw error
        }
        const delayMs = this.retryDelaysMs[attempt]
        options.onRetry?.(attempt + 1, delayMs, error)
        await this.sleep(delayMs)
        if (options.signal?.aborted) throw cancellationError()
        attempt += 1
      }
    }
  }
}

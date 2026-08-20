// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  createRoadbook,
  loadRoadbooks,
  parseSharedRoadbook,
  reverseDay,
  sampleRoadbook,
  saveRoadbooks,
  totalCost,
  totalDistance,
} from '@/lib/roadbooks'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  },
})

describe('roadbook data helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('persists roadbooks in browser storage', () => {
    const roadbook = createRoadbook()
    roadbook.title = '周末短途'
    saveRoadbooks([roadbook])

    expect(loadRoadbooks()).toEqual([roadbook])
  })

  it('calculates totals and keeps a valid first stop when reversing', () => {
    expect(totalDistance(sampleRoadbook)).toBeCloseTo(47.6)
    expect(totalCost(sampleRoadbook)).toBe(857)

    const reversed = reverseDay(sampleRoadbook.days[0])
    expect(reversed.stops[0].name).toBe('湖滨轻居酒店')
    expect(reversed.stops[0].legFromPrevious).toBeUndefined()
    expect(reversed.stops[1].legFromPrevious?.mode).toBe('driving')
  })

  it('round-trips a shared roadbook through the URL fragment', () => {
    const url = buildShareUrl(sampleRoadbook)
    window.history.replaceState(null, '', new URL(url).hash)
    const shared = parseSharedRoadbook()

    expect(shared?.title).toBe('杭州 · 山水与宋韵（分享）')
    expect(shared?.days).toHaveLength(3)
    expect(shared?.id).not.toBe(sampleRoadbook.id)
  })
})

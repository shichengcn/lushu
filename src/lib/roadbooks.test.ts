// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  createRoadbook,
  loadRoadbooks,
  normalizeRoadbook,
  parseSharedRoadbook,
  qingganRoadbook,
  recalculateDayDates,
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

    expect(loadRoadbooks().find((item) => item.id === roadbook.id)).toEqual(roadbook)
  })

  it('calculates totals and keeps a valid first stop when reversing', () => {
    expect(totalDistance(sampleRoadbook)).toBeCloseTo(47.6)
    expect(totalCost(sampleRoadbook)).toBe(878)

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

  it('migrates legacy costs and notes without losing content', () => {
    const migrated = normalizeRoadbook({
      title: '旧路书',
      startDate: '2026-01-01',
      days: [
        {
          date: '2026-01-01',
          stops: [
            {
              name: '旧节点',
              location: [120, 30],
              cost: 99,
              notes: '旧备注',
            },
          ],
        },
      ],
    })

    expect(migrated.days[0].stops[0].expenses[0].amount).toBe(99)
    expect(migrated.days[0].stops[0].notes[0].text).toBe('旧备注')
    expect(migrated.days[0].stops[0].hidden).toBe(false)
  })

  it('keeps the Qinghai-Gansu driving days within the planned limit', () => {
    const maximum = Math.max(
      ...qingganRoadbook.days.map((day) =>
        day.stops.reduce(
          (sum, stop) =>
            sum +
            (stop.legFromPrevious?.mode === 'driving'
              ? stop.legFromPrevious.distanceKm
              : 0),
          0,
        ),
      ),
    )

    expect(qingganRoadbook.days).toHaveLength(12)
    expect(maximum).toBeLessThanOrEqual(500)
  })

  it('excludes hidden nodes from expense totals', () => {
    const roadbook = structuredClone(sampleRoadbook)
    roadbook.days[0].stops[1].hidden = true

    expect(totalCost(roadbook)).toBeLessThan(totalCost(sampleRoadbook))
  })

  it('shifts all following dates after the itinerary changes', () => {
    const days = recalculateDayDates(sampleRoadbook.days, '2027-01-30')

    expect(days.map((day) => day.date)).toEqual([
      '2027-01-30',
      '2027-01-31',
      '2027-02-01',
    ])
  })
})

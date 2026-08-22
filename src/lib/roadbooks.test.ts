// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  createRoadbook,
  hydratePlaceLibrary,
  loadRoadbooks,
  migrateRoadbookV6,
  migrateRoadbookV10,
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
import {
  globalDrivingGroups,
  isPlausibleRouteDistance,
  markerEntriesForScope,
  routeGroupsForScope,
} from '@/lib/map-routes'
import { gcj02ToBd09 } from '@/lib/baidu'
import { placeLibraryKey } from '@/lib/place-media'
import {
  knowledgePlacesForRoadbook,
  qingganKnowledgePlaces,
} from '@/lib/qinggan-v10'

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

  it('never replaces a locally edited built-in roadbook during a new build', () => {
    const customized = structuredClone(qingganRoadbook)
    customized.title = '我的青甘行程'
    saveRoadbooks([customized])

    expect(loadRoadbooks().find((item) => item.id === customized.id)?.title).toBe(
      '我的青甘行程',
    )
  })

  it('restores the previous local backup when primary data is damaged', () => {
    const first = createRoadbook()
    first.title = '可恢复版本'
    saveRoadbooks([first])

    const second = structuredClone(first)
    second.title = '最新版本'
    saveRoadbooks([second])
    localStorage.setItem('tuji-roadbooks-v2', '{broken')

    expect(loadRoadbooks().find((item) => item.id === first.id)?.title).toBe(
      '可恢复版本',
    )
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

  it('builds the 12-day knowledge-base itinerary within its documented limit', () => {
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
    expect(maximum).toBeLessThanOrEqual(580)
    expect(qingganRoadbook.dataVersion).toBe(10)
    expect(JSON.stringify(qingganRoadbook)).not.toContain('可可西里')
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

  it('builds a Xining-to-Xining global self-driving route', () => {
    const groups = globalDrivingGroups(qingganRoadbook)
    const names = groups.flatMap((group) => group.stops.map((stop) => stop.name))

    expect(names[0]).toBe('西宁曹家堡国际机场')
    expect(names.at(-1)).toBe('桔子酒店·西宁城东万达广场店')
    expect(names).not.toContain('上海虹桥国际机场')
    expect(names).not.toContain('兰州中川国际机场')
    expect(groups.every((group) => group.stops.length >= 2)).toBe(true)
  })

  it('rejects implausible navigation detours instead of drawing a false route', () => {
    const returnGroup = globalDrivingGroups(qingganRoadbook).find(
      (group) => group.dayId === 'qg-v10-day-8' && group.id.endsWith('-return'),
    )

    expect(returnGroup).toBeDefined()
    expect(isPlausibleRouteDistance(returnGroup!, 190)).toBe(true)
    expect(isPlausibleRouteDistance(returnGroup!, 900)).toBe(false)
  })

  it('removes the legacy Kekexili day and moves following dates forward', () => {
    const legacy = structuredClone(qingganRoadbook)
    legacy.dataVersion = undefined
    legacy.title = '青甘大环线 · 反向 12 日'
    legacy.summary += '，含可可西里保护站往返。'
    legacy.days = [
      {
        id: 'qg-day-10',
        date: '2026-10-04',
        title: '可可西里保护站往返',
        stops: [],
      },
      {
        id: 'qg-day-11',
        date: '2026-10-05',
        title: '茶卡盐湖',
        stops: [],
      },
      {
        id: 'qg-day-12',
        date: '2026-10-06',
        title: '返回西宁',
        stops: [],
      },
    ]

    const migrated = migrateRoadbookV6(legacy)

    expect(migrated.days).toHaveLength(2)
    expect(migrated.days.some((day) => day.id === 'qg-day-10')).toBe(false)
    expect(migrated.days.find((day) => day.id === 'qg-day-11')?.date).toBe('2026-10-04')
    expect(migrated.endDate).toBe('2026-10-05')
    expect(JSON.stringify(migrated)).not.toContain('可可西里')
  })

  it('keeps place media in the roadbook library independently from nodes', () => {
    const hydrated = hydratePlaceLibrary(structuredClone(sampleRoadbook))
    const stop = hydrated.days[0].stops[0]
    const key = placeLibraryKey(stop)

    hydrated.days[0].stops.shift()

    expect(hydrated.placeLibrary[key]?.photos).toHaveLength(2)
    expect(hydrated.placeLibrary[key]?.name).toBe(stop.name)
  })

  it('reconnects route groups around hidden stops', () => {
    const roadbook = structuredClone(sampleRoadbook)
    roadbook.days[0].stops[1].hidden = true
    const groups = routeGroupsForScope(roadbook, {
      mode: 'day',
      dayId: roadbook.days[0].id,
    })

    expect(groups[0].stops.map((stop) => stop.id)).toEqual([
      roadbook.days[0].stops[0].id,
      roadbook.days[0].stops[2].id,
      roadbook.days[0].stops[3].id,
    ])
  })

  it('limits day and leg scopes to their ordered driving stops', () => {
    const dayScope = { mode: 'day' as const, dayId: 'qg-v10-day-2' }
    const dayGroups = routeGroupsForScope(qingganRoadbook, dayScope)
    const legScope = {
      mode: 'leg' as const,
      dayId: 'qg-v10-day-2',
      fromStopId: 'v10-d2-hotel-start',
      stopId: 'v10-d2-heiquan',
    }
    const legGroups = routeGroupsForScope(qingganRoadbook, legScope)

    expect(dayGroups).toHaveLength(1)
    expect(dayGroups[0].stops).toHaveLength(7)
    expect(legGroups[0].stops.map((stop) => stop.id)).toEqual([
      'v10-d2-hotel-start',
      'v10-d2-heiquan',
    ])
    expect(markerEntriesForScope(qingganRoadbook, dayScope).some((entry) => entry.relevant)).toBe(
      true,
    )
  })

  it('exposes all knowledge-base places with usable map coordinates', () => {
    expect(qingganKnowledgePlaces).toHaveLength(78)
    expect(knowledgePlacesForRoadbook(qingganRoadbook)).toHaveLength(78)
    expect(
      qingganKnowledgePlaces.every(
        (place) => Number.isFinite(place.location[0]) && Number.isFinite(place.location[1]),
      ),
    ).toBe(true)
  })

  it('upgrades the local Qinghai-Gansu roadbook while preserving user media', () => {
    const legacy = structuredClone(qingganRoadbook)
    legacy.dataVersion = 6
    legacy.days = legacy.days.slice(0, 2)
    const key = Object.keys(legacy.placeLibrary)[0]
    legacy.placeLibrary[key].photos.push({
      id: 'user-photo',
      url: 'data:image/jpeg;base64,user',
      caption: '用户照片',
      source: 'upload',
      createdAt: '2026-08-22T00:00:00.000Z',
    })

    const migrated = migrateRoadbookV10(legacy)

    expect(migrated.dataVersion).toBe(10)
    expect(migrated.days).toHaveLength(12)
    expect(migrated.placeLibrary[key].photos.some((photo) => photo.id === 'user-photo')).toBe(true)
  })

  it('converts GCJ-02 coordinates for Baidu without mutating source data', () => {
    const source: [number, number] = [116.397451, 39.909187]
    const converted = gcj02ToBd09(source)

    expect(source).toEqual([116.397451, 39.909187])
    expect(converted[0]).toBeGreaterThan(source[0])
    expect(converted[1]).toBeGreaterThan(source[1])
  })
})

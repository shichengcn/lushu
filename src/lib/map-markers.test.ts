// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  calculateMarkerOffsets,
  createStopMarkerElement,
  DEFAULT_MAP_VISIBILITY,
  focusAllowsStop,
  focusShowsDistances,
  focusShowsKnowledge,
  visibilityAllowsStop,
  visibilityForFocus,
} from '@/lib/map-markers'
import { sampleRoadbook } from '@/lib/roadbooks'

describe('map marker presentation', () => {
  const scenic = sampleRoadbook.days[0].stops[0]
  const hotel = sampleRoadbook.days[0].stops.at(-1)!

  it('filters non-target map features for each focus mode', () => {
    expect(focusAllowsStop('overview', scenic)).toBe(true)
    expect(focusAllowsStop('scenic', scenic)).toBe(true)
    expect(focusAllowsStop('scenic', hotel)).toBe(false)
    expect(focusAllowsStop('hotel', scenic)).toBe(false)
    expect(focusAllowsStop('hotel', hotel)).toBe(true)
    expect(focusAllowsStop('driving', scenic)).toBe(false)
    expect(focusAllowsStop('cost', hotel)).toBe(true)
    expect(focusShowsKnowledge('scenic')).toBe(true)
    expect(focusShowsKnowledge('hotel')).toBe(false)
    expect(focusShowsDistances('driving')).toBe(true)
    expect(focusShowsDistances('scenic')).toBe(false)
  })

  it('respects layer visibility and restores the selected focus layer', () => {
    const hidden = {
      ...DEFAULT_MAP_VISIBILITY,
      scenic: false,
      knowledge: false,
      hotels: false,
    }

    expect(visibilityAllowsStop(hidden, scenic)).toBe(false)
    expect(visibilityAllowsStop(hidden, hotel)).toBe(false)
    expect(visibilityForFocus(hidden, 'scenic')).toMatchObject({
      scenic: true,
      knowledge: true,
    })
    expect(visibilityForFocus(hidden, 'hotel').hotels).toBe(true)
  })

  it('keeps the stop number inside the photo marker', () => {
    const marker = createStopMarkerElement({
      dayIndex: 0,
      stopIndex: 2,
      stop: scenic,
      photos: [],
      selected: false,
      dimmed: false,
      showNumber: true,
      showLabel: true,
      focusMode: 'overview',
    })
    const pin = marker.querySelector('.map-marker-pin')

    expect(marker.dataset.markerKind).toBe('stop')
    expect(pin?.classList.contains('has-number')).toBe(true)
    expect(pin?.querySelector('b')?.textContent).toBe('3')
    expect(marker.querySelectorAll('.map-marker-pin')).toHaveLength(1)
  })

  it('moves lower-priority markers away from overlapping markers', () => {
    const offsets = calculateMarkerOffsets([
      { id: 'selected', x: 100, y: 100, priority: 1000 },
      { id: 'route', x: 102, y: 101, priority: 500 },
      { id: 'knowledge', x: 99, y: 103, priority: 100 },
      { id: 'far', x: 300, y: 300, priority: 50 },
    ])

    expect(offsets.selected).toEqual({ offsetX: 0, offsetY: 0, overlapping: true })
    expect(Math.hypot(offsets.route.offsetX, offsets.route.offsetY)).toBeGreaterThan(0)
    expect(Math.hypot(offsets.knowledge.offsetX, offsets.knowledge.offsetY)).toBeGreaterThan(0)
    expect(offsets.far).toEqual({ offsetX: 0, offsetY: 0, overlapping: false })
  })
})

import { visibleStops } from '@/lib/roadbooks'
import type { MapScope, Roadbook, TripStop } from '@/types'

export interface RouteGroup {
  id: string
  dayId: string
  dayIndex: number
  stops: TripStop[]
}

interface StopEntry {
  dayId: string
  dayIndex: number
  stop: TripStop
  flatIndex: number
}

function flattenedStops(roadbook: Roadbook) {
  let flatIndex = 0
  return roadbook.days.flatMap((day, dayIndex) =>
    visibleStops(day).map((stop) => ({
      dayId: day.id,
      dayIndex,
      stop,
      flatIndex: flatIndex++,
    })),
  )
}

export function selfDrivingWindow(roadbook: Roadbook) {
  const entries = flattenedStops(roadbook)
  const flightIndexes = entries
    .filter(({ stop }) => stop.legFromPrevious?.mode === 'flight')
    .map(({ flatIndex }) => flatIndex)

  if (!flightIndexes.length) return entries
  const start = flightIndexes[0]
  const end = flightIndexes[1] ?? entries.length
  return entries.filter(({ flatIndex }) => flatIndex >= start && flatIndex < end)
}

function drivingGroupsForEntries(entries: StopEntry[]) {
  const groups: RouteGroup[] = []
  let current: RouteGroup | null = null

  entries.forEach((entry, index) => {
    if (index === 0) return
    const previous = entries[index - 1]
    const sameDay = previous.dayId === entry.dayId
    const isDriving = entry.stop.legFromPrevious?.mode === 'driving'

    if (!sameDay || !isDriving) {
      current = null
      return
    }

    if (!current) {
      current = {
        id: `${entry.dayId}-${previous.stop.id}-${entry.stop.id}`,
        dayId: entry.dayId,
        dayIndex: entry.dayIndex,
        stops: [previous.stop, entry.stop],
      }
      groups.push(current)
      return
    }

    current.stops.push(entry.stop)
  })

  return groups.flatMap((group) => {
    const first = group.stops[0]
    const last = group.stops.at(-1)!
    const loopDelta =
      Math.abs(first.location[0] - last.location[0]) +
      Math.abs(first.location[1] - last.location[1])
    if (group.stops.length < 4 || loopDelta > 0.02) return [group]

    let farthestIndex = 1
    let farthestDistance = 0
    group.stops.forEach((stop, index) => {
      const delta =
        (stop.location[0] - first.location[0]) ** 2 +
        (stop.location[1] - first.location[1]) ** 2
      if (delta > farthestDistance) {
        farthestDistance = delta
        farthestIndex = index
      }
    })
    if (farthestIndex <= 0 || farthestIndex >= group.stops.length - 1) return [group]

    return [
      {
        ...group,
        id: `${group.id}-outbound`,
        stops: group.stops.slice(0, farthestIndex + 1),
      },
      {
        ...group,
        id: `${group.id}-return`,
        stops: group.stops.slice(farthestIndex),
      },
    ]
  })
}

export function globalDrivingGroups(roadbook: Roadbook) {
  return drivingGroupsForEntries(selfDrivingWindow(roadbook))
}

export function routeGroupsForScope(roadbook: Roadbook, scope: MapScope) {
  const globalGroups = globalDrivingGroups(roadbook)
  if (scope.mode === 'global') return globalGroups

  if (scope.mode === 'day') {
    return globalGroups.filter((group) => group.dayId === scope.dayId)
  }

  const day = roadbook.days.find((item) => item.id === scope.dayId)
  if (!day) return []
  const stops = visibleStops(day)
  const toIndex = stops.findIndex((stop) => stop.id === scope.stopId)
  const fromIndex = stops.findIndex((stop) => stop.id === scope.fromStopId)
  if (fromIndex < 0 || toIndex < 0) return []

  return [
    {
      id: `${scope.dayId}-${scope.fromStopId}-${scope.stopId}`,
      dayId: scope.dayId,
      dayIndex: roadbook.days.findIndex((item) => item.id === scope.dayId),
      stops: [stops[fromIndex], stops[toIndex]],
    },
  ]
}

export function displayDrivingGroups(roadbook: Roadbook, scope: MapScope) {
  const groups = globalDrivingGroups(roadbook)
  if (scope.mode !== 'leg') return groups

  return groups.flatMap((group) => {
    if (group.dayId !== scope.dayId) return [group]
    return group.stops.slice(1).map((stop, index) => {
      const previous = group.stops[index]
      return {
        id: `${group.dayId}-${previous.id}-${stop.id}`,
        dayId: group.dayId,
        dayIndex: group.dayIndex,
        stops: [previous, stop],
      }
    })
  })
}

export function isPlausibleRouteDistance(group: RouteGroup, distanceKm: number) {
  const plannedDistance = group.stops
    .slice(1)
    .reduce((total, stop) => total + (stop.legFromPrevious?.distanceKm || 0), 0)
  if (plannedDistance <= 0 || distanceKm <= 0) return true

  return distanceKm <= Math.max(plannedDistance * 2.5, plannedDistance + 300)
}

export function markerEntriesForScope(roadbook: Roadbook, scope: MapScope) {
  const selfDriveIds = new Set(selfDrivingWindow(roadbook).map(({ stop }) => stop.id))
  const relevantIds = new Set(
    routeGroupsForScope(roadbook, scope).flatMap((group) =>
      group.stops.map((stop) => stop.id),
    ),
  )

  return roadbook.days.flatMap((day, dayIndex) =>
    visibleStops(day)
      .filter((stop) => selfDriveIds.has(stop.id))
      .map((stop, stopIndex) => ({
        day,
        dayIndex,
        stop,
        stopIndex,
        relevant: relevantIds.has(stop.id),
      })),
  )
}

export function scopeLabel(roadbook: Roadbook, scope: MapScope) {
  if (scope.mode === 'global') return '全局自驾'
  const dayIndex = roadbook.days.findIndex((day) => day.id === scope.dayId)
  if (scope.mode === 'day') return `第 ${dayIndex + 1} 天`
  return '单段路线'
}

export function scopeDrivingDistance(roadbook: Roadbook, scope: MapScope) {
  return routeGroupsForScope(roadbook, scope).reduce(
    (total, group) =>
      total +
      group.stops
        .slice(1)
        .reduce(
          (subtotal, stop) => subtotal + (stop.legFromPrevious?.distanceKm || 0),
          0,
        ),
    0,
  )
}

import { DAY_COLORS, stopCost } from '@/lib/roadbooks'
import type {
  KnowledgePlace,
  MapFocusMode,
  MapVisibility,
  PlacePhoto,
  TripStop,
} from '@/types'

export const DEFAULT_MAP_VISIBILITY: MapVisibility = {
  routes: true,
  distances: true,
  scenic: true,
  knowledge: true,
  hotels: true,
  costs: true,
  fuel: false,
  labels: true,
  traffic: false,
}

export function focusAllowsStop(focusMode: MapFocusMode, stop: TripStop) {
  if (focusMode === 'scenic') return stop.type === 'scenic'
  if (focusMode === 'cost') return stopCost(stop) > 0
  if (focusMode === 'driving') return false
  if (focusMode === 'hotel') return stop.type === 'hotel'
  return true
}

export function visibilityAllowsStop(visibility: MapVisibility, stop: TripStop) {
  if (stop.type === 'scenic') return visibility.scenic
  if (stop.type === 'hotel') return visibility.hotels
  if (stop.type === 'fuel') return visibility.fuel
  return true
}

export function focusShowsKnowledge(focusMode: MapFocusMode) {
  return focusMode === 'overview' || focusMode === 'scenic'
}

export function focusShowsDistances(focusMode: MapFocusMode) {
  return focusMode === 'overview' || focusMode === 'driving'
}

export function focusShowsDayLabels(focusMode: MapFocusMode) {
  return focusMode === 'overview'
}

export function focusShowsFuel(focusMode: MapFocusMode) {
  return focusMode === 'overview' || focusMode === 'driving'
}

export function visibilityForFocus(
  visibility: MapVisibility,
  focusMode: MapFocusMode,
): MapVisibility {
  if (focusMode === 'scenic') {
    return { ...visibility, scenic: true, knowledge: true }
  }
  if (focusMode === 'cost') return { ...visibility, costs: true }
  if (focusMode === 'driving') {
    return { ...visibility, routes: true, distances: true }
  }
  if (focusMode === 'hotel') return { ...visibility, hotels: true }
  return visibility
}

function appendFirstAvailablePhoto(
  marker: HTMLElement,
  container: HTMLElement,
  fallback: HTMLElement,
  photos: PlacePhoto[],
) {
  if (!photos.length) return
  const image = document.createElement('img')
  image.alt = ''
  image.hidden = true
  let index = 0

  const loadNext = () => {
    const photo = photos[index]
    index += 1
    if (!photo) {
      image.remove()
      return
    }
    image.hidden = true
    image.onload = () => {
      image.hidden = false
      fallback.remove()
      marker.dataset.photoLoaded = 'true'
    }
    image.onerror = loadNext
    image.src = photo.url
  }

  container.appendChild(image)
  loadNext()
}

export function createStopMarkerElement({
  dayIndex,
  stopIndex,
  stop,
  photos,
  selected,
  dimmed,
  showNumber,
  showLabel,
  focusMode,
}: {
  dayIndex: number
  stopIndex: number
  stop: TripStop
  photos: PlacePhoto[]
  selected: boolean
  dimmed: boolean
  showNumber: boolean
  showLabel: boolean
  focusMode: MapFocusMode
}) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = [
    'map-marker-v2',
    selected ? 'is-selected' : '',
    dimmed ? 'is-dimmed' : '',
    `is-${stop.type}`,
  ]
    .filter(Boolean)
    .join(' ')
  marker.dataset.markerKind = 'stop'
  marker.dataset.markerId = stop.id
  marker.dataset.stopType = stop.type
  marker.style.setProperty('--marker-color', DAY_COLORS[dayIndex % DAY_COLORS.length])
  marker.setAttribute('aria-label', `第 ${dayIndex + 1} 天，第 ${stopIndex + 1} 站，${stop.name}`)

  const pin = document.createElement('span')
  pin.className = `map-marker-pin${showNumber ? ' has-number' : ''}`
  const fallback = document.createElement('i')
  fallback.className = 'map-marker-fallback'
  fallback.textContent = stop.type === 'hotel' ? '住' : stop.type === 'fuel' ? '油' : '景'
  pin.appendChild(fallback)
  appendFirstAvailablePhoto(marker, pin, fallback, photos)
  if (showNumber) {
    const number = document.createElement('b')
    number.textContent = String(stopIndex + 1)
    pin.appendChild(number)
  }
  marker.appendChild(pin)

  if (showLabel) {
    const label = document.createElement('span')
    label.className = 'map-marker-label'
    const name = document.createElement('b')
    name.textContent = stop.name
    label.appendChild(name)

    if (focusMode === 'cost') {
      const cost = document.createElement('small')
      cost.textContent = `¥${stopCost(stop).toLocaleString('zh-CN')}`
      label.appendChild(cost)
      if (stop.expenses.length) {
        const details = document.createElement('em')
        details.className = 'map-cost-detail'
        details.textContent = stop.expenses
          .map((expense) => `${expense.label} ¥${expense.amount}`)
          .join(' · ')
        label.appendChild(details)
      }
    } else {
      const type = document.createElement('small')
      type.textContent =
        stop.type === 'hotel'
          ? '住宿'
          : stop.type === 'scenic'
            ? '景点'
            : stop.type === 'fuel'
              ? '加油'
              : stop.arrivalTime
      label.appendChild(type)
    }
    marker.appendChild(label)
  }
  return marker
}

export function createKnowledgeMarkerElement(
  place: KnowledgePlace,
  photos: PlacePhoto[],
) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = [
    'knowledge-map-marker',
    place.isNiche ? 'is-niche' : 'is-core',
    /不可前往|放弃|封闭/.test(place.recommendation) ? 'is-caution' : '',
  ].filter(Boolean).join(' ')
  marker.dataset.markerKind = 'knowledge'
  marker.dataset.markerId = place.id
  marker.title = `${place.name} · ${place.recommendation}`
  marker.setAttribute('aria-label', `规划景点，${place.name}，${place.recommendation}`)

  const fallback = document.createElement('span')
  fallback.textContent = place.isNiche ? '秘' : '景'
  marker.appendChild(fallback)
  appendFirstAvailablePhoto(marker, marker, fallback, photos)
  return marker
}

export interface MarkerScreenPoint {
  id: string
  x: number
  y: number
  priority: number
}

export interface MarkerScreenOffset {
  offsetX: number
  offsetY: number
  overlapping: boolean
}

export function calculateMarkerOffsets(
  points: MarkerScreenPoint[],
  collisionDistance = 42,
): Record<string, MarkerScreenOffset> {
  const ordered = points
    .map((point, index) => ({ ...point, index }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
  const overlapping = new Set<string>()

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex]
      const right = ordered[rightIndex]
      if (Math.hypot(left.x - right.x, left.y - right.y) >= collisionDistance) continue
      overlapping.add(left.id)
      overlapping.add(right.id)
    }
  }

  const result: Record<string, MarkerScreenOffset> = {}
  ordered.forEach((point, index) => {
    const earlierCollisions = ordered
      .slice(0, index)
      .filter(
        (other) =>
          Math.hypot(point.x - other.x, point.y - other.y) < collisionDistance,
      ).length
    if (!earlierCollisions) {
      result[point.id] = { offsetX: 0, offsetY: 0, overlapping: overlapping.has(point.id) }
      return
    }
    const slot = earlierCollisions - 1
    const ring = Math.floor(slot / 6) + 1
    const angle = -Math.PI / 2 + (slot % 6) * (Math.PI / 3)
    const distance = 38 * ring
    result[point.id] = {
      offsetX: Math.round(Math.cos(angle) * distance),
      offsetY: Math.round(Math.sin(angle) * distance),
      overlapping: true,
    }
  })
  return result
}

export function applyMarkerOffsets(
  markers: Array<{ id: string; element: HTMLElement }>,
  offsets: Record<string, MarkerScreenOffset>,
) {
  markers.forEach(({ id, element }) => {
    const offset = offsets[id] || { offsetX: 0, offsetY: 0, overlapping: false }
    element.style.setProperty('--marker-shift-x', `${offset.offsetX}px`)
    element.style.setProperty('--marker-shift-y', `${offset.offsetY}px`)
    element.classList.toggle('has-collision', offset.overlapping)
    element.classList.toggle(
      'is-collision-shifted',
      offset.offsetX !== 0 || offset.offsetY !== 0,
    )
  })
}

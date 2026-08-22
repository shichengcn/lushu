import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BedDouble,
  Car,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Maximize2,
  Minimize2,
  Navigation,
  Ruler,
  Satellite,
  TrafficCone,
  X,
} from 'lucide-react'
import {
  KnowledgePlaceDetails,
  KnowledgeReferencePanel,
} from '@/components/KnowledgePlaceDetails'
import { PlaceMediaGallery } from '@/components/PlaceMediaGallery'
import {
  buildBaiduNavigationUrl,
  buildBaiduPlaceUrl,
  gcj02ToBd09,
  loadBaiduMap,
  queueBaiduRequest,
} from '@/lib/baidu'
import {
  displayDrivingGroups,
  isPlausibleRouteDistance,
  markerEntriesForScope,
  routeGroupsForScope,
  scopeDrivingDistance,
  scopeLabel,
  type RouteGroup,
} from '@/lib/map-routes'
import {
  applyMarkerOffsets,
  calculateMarkerOffsets,
  createKnowledgeMarkerElement,
  createStopMarkerElement,
  DEFAULT_MAP_VISIBILITY,
  focusAllowsStop,
  focusShowsDistances,
  focusShowsKnowledge,
  visibilityAllowsStop,
  visibilityForFocus,
} from '@/lib/map-markers'
import {
  DAY_COLORS,
  legCost,
  stopCost,
  totalCost,
} from '@/lib/roadbooks'
import { placeLibraryEntry } from '@/lib/place-media'
import {
  isKnowledgePlaceSelected,
  knowledgePlaceForStop,
  knowledgePlacesForScope,
  knowledgePlaceToStop,
} from '@/lib/qinggan-v10'
import type {
  KnowledgePlace,
  MapBaseLayer,
  MapFocusMode,
  MapScope,
  MapVisibility,
  ResolvedLeg,
  Roadbook,
  TripStop,
} from '@/types'

interface BaiduMapCanvasProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  scope: MapScope
  onScopeChange: (scope: MapScope) => void
  onSelectStop: (stopId: string) => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null, dayId: string) => void
  onRoutesResolved: (legs: ResolvedLeg[]) => void
  onAddPlacePhoto: (stop: TripStop, file: File) => Promise<void>
  onAddPlaceNote: (stop: TripStop, text: string) => void
  onAddKnowledgePlace: (place: KnowledgePlace) => void
  readOnly: boolean
}

interface BaiduRouteResult {
  path: any[]
  distanceKm: number
  durationMinutes: number
  roadNames: string[]
}

type SelectedElement =
  | { kind: 'stop'; dayId: string; stopId: string }
  | { kind: 'leg'; dayId: string; stopId: string; fromStopId: string }
  | { kind: 'knowledge'; placeId: string }

const focusModes: Array<{ value: MapFocusMode; label: string; icon: typeof MapIcon }> = [
  { value: 'overview', label: '总览', icon: MapIcon },
  { value: 'scenic', label: '景点', icon: MapPinned },
  { value: 'cost', label: '费用', icon: CircleDollarSign },
  { value: 'driving', label: '驾车', icon: Car },
  { value: 'hotel', label: '酒店', icon: BedDouble },
]

function requestBaiduRoute(BMapGL: any, map: any, group: RouteGroup) {
  return new Promise<BaiduRouteResult>((resolve, reject) => {
    const points = group.stops.map((stop) => {
      const [lng, lat] = gcj02ToBd09(stop.location)
      return new BMapGL.Point(lng, lat)
    })
    if (points.length < 2) {
      reject(new Error('路线节点不足'))
      return
    }
    let settled = false
    let service: any
    const timeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('百度路线请求超时'))
    }, 15000)
    service = new BMapGL.DrivingRoute(map, {
      onSearchComplete: (results: any) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (service.getStatus() !== 0 || !results?.getPlan?.(0)) {
          reject(new Error(`百度路线请求失败：${service.getStatus()}`))
          return
        }
        const plan = results.getPlan(0)
        const path: any[] = []
        const roadNames = new Set<string>()
        const routeCount = Math.max(1, plan.getNumRoutes?.() || 1)
        for (let index = 0; index < routeCount; index += 1) {
          const route = plan.getRoute(index)
          route?.getPath?.().forEach((point: any) => path.push(point))
          const stepCount = route?.getNumSteps?.() || 0
          for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
            const description = String(route.getStep(stepIndex)?.getDescription?.() || '')
            const match = description.match(/(?:进入|沿|驶入)([^，。<]+)/)
            if (match?.[1]) roadNames.add(match[1].replace(/<[^>]+>/g, '').trim())
          }
        }
        const distanceKm = Number(((plan.getDistance?.(false) || 0) / 1000).toFixed(1))
        if (!isPlausibleRouteDistance(group, distanceKm)) {
          reject(new Error('百度路线距离异常'))
          return
        }
        resolve({
          path,
          distanceKm,
          durationMinutes: Math.max(1, Math.round((plan.getDuration?.(false) || 0) / 60)),
          roadNames: [...roadNames].slice(0, 8),
        })
      },
    })
    service.search(points[0], points.at(-1), { waypoints: points.slice(1, -1) })
  })
}

function searchBaiduRoute(
  BMapGL: any,
  map: any,
  group: RouteGroup,
  signal: AbortSignal,
  onRetry: () => void,
) {
  return queueBaiduRequest(
    () => requestBaiduRoute(BMapGL, map, group),
    { signal, onRetry },
  )
}

function fitPoints(BMapGL: any, map: any, stops: TripStop[]) {
  const points = stops.map((stop) => {
    const [lng, lat] = gcj02ToBd09(stop.location)
    return new BMapGL.Point(lng, lat)
  })
  if (points.length) map.setViewport(points, { margins: [90, 90, 90, 90] })
}

function createBaiduHtmlOverlay(
  BMapGL: any,
  point: any,
  element: HTMLElement,
  anchor: { x: number; y: number },
  zIndex: number,
) {
  const overlay = Object.create(BMapGL.Overlay.prototype)
  overlay.point = point
  overlay.element = element
  overlay.map = null
  overlay.initialize = (map: any) => {
    overlay.map = map
    element.classList.add('baidu-html-marker')
    element.style.zIndex = String(zIndex)
    map.getPanes().markerPane.appendChild(element)
    return element
  }
  overlay.draw = () => {
    const pixel = overlay.map.pointToOverlayPixel(point)
    element.style.left = `${pixel.x - anchor.x}px`
    element.style.top = `${pixel.y - anchor.y}px`
  }
  overlay.getPosition = () => point
  return overlay
}

export function BaiduMapCanvas({
  roadbook,
  activeDayId,
  selectedStopId,
  scope,
  onScopeChange,
  onSelectStop,
  onEditStop,
  onRoutesResolved,
  onAddPlacePhoto,
  onAddPlaceNote,
  onAddKnowledgePlace,
  readOnly,
}: BaiduMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const baiduRef = useRef<any>(null)
  const generationRef = useRef(0)
  const routeCacheRef = useRef(new Map<string, BaiduRouteResult>())
  const measurePointsRef = useRef<any[]>([])
  const measureOverlaysRef = useRef<any[]>([])
  const renderOverlaysRef = useRef<any[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [routeActivity, setRouteActivity] = useState({ pending: 0, retries: 0 })
  const [focusMode, setFocusMode] = useState<MapFocusMode>('overview')
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>('standard')
  const [visibility, setVisibility] = useState<MapVisibility>(DEFAULT_MAP_VISIBILITY)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [measuredDistance, setMeasuredDistance] = useState(0)
  const [measurePointCount, setMeasurePointCount] = useState(0)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [dismissedStopId, setDismissedStopId] = useState<string | null>(null)
  const [detailExpanded, setDetailExpanded] = useState(false)
  const knowledgePlaces = useMemo(() => knowledgePlacesForScope(roadbook), [roadbook])
  const externalSelectedDay = selectedStopId
    ? roadbook.days.find((day) => day.stops.some((stop) => stop.id === selectedStopId))
    : null
  const detailElement =
    selectedElement?.kind === 'knowledge'
      ? selectedElement
      : selectedElement && selectedElement.stopId === selectedStopId
        ? selectedElement
      : selectedStopId && externalSelectedDay && dismissedStopId !== selectedStopId
        ? { kind: 'stop' as const, dayId: externalSelectedDay.id, stopId: selectedStopId }
        : null
  const selectedKnowledge =
    detailElement?.kind === 'knowledge'
      ? knowledgePlaces.find((place) => place.id === detailElement.placeId)
      : null
  const selectedKnowledgeStop = selectedKnowledge
    ? knowledgePlaceToStop(selectedKnowledge, roadbook.travelers.map((traveler) => traveler.id))
    : null
  const selectedDay = detailElement && detailElement.kind !== 'knowledge'
    ? roadbook.days.find((day) => day.id === detailElement.dayId)
    : null
  const selectedStop =
    detailElement?.kind !== 'knowledge'
      ? selectedDay?.stops.find((stop) => stop.id === detailElement?.stopId)
      : null
  const selectedFrom =
    detailElement?.kind === 'leg'
      ? selectedDay?.stops.find((stop) => stop.id === detailElement.fromStopId)
      : null
  const selectedStopKnowledge = selectedStop
    ? knowledgePlaceForStop(selectedStop)
    : undefined
  const markerEntries = useMemo(
    () => markerEntriesForScope(roadbook, scope),
    [roadbook, scope],
  )

  useEffect(() => {
    let cancelled = false
    loadBaiduMap()
      .then((BMapGL) => {
        if (cancelled || !containerRef.current) return
        const map = new BMapGL.Map(containerRef.current)
        map.centerAndZoom(new BMapGL.Point(101.784, 36.623), 9)
        map.enableScrollWheelZoom(true)
        map.addControl(new BMapGL.ScaleControl({ anchor: BMapGL.BMAP_ANCHOR_BOTTOM_LEFT }))
        map.addControl(new BMapGL.ZoomControl({ anchor: BMapGL.BMAP_ANCHOR_BOTTOM_RIGHT }))
        baiduRef.current = BMapGL
        mapRef.current = map
        setMapReady(true)
      })
      .catch((error) => setMapError(error instanceof Error ? error.message : '百度地图加载失败'))
    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const BMapGL = baiduRef.current
    const map = mapRef.current
    if (!mapReady || !BMapGL || !map) return
    map.setMapType(
      baseLayer === 'satellite' ? BMapGL.BMAP_SATELLITE_MAP : BMapGL.BMAP_NORMAL_MAP,
    )
    if (visibility.traffic) map.setTrafficOn?.()
    else map.setTrafficOff?.()
  }, [baseLayer, mapReady, visibility.traffic])

  useEffect(() => {
    const BMapGL = baiduRef.current
    const map = mapRef.current
    const container = containerRef.current
    if (!mapReady || !BMapGL || !map || !container) return

    const clearMeasurementOverlays = () => {
      measureOverlaysRef.current.forEach((overlay) => map.removeOverlay?.(overlay))
      measureOverlaysRef.current = []
    }

    const renderMeasurement = () => {
      clearMeasurementOverlays()
      const points = measurePointsRef.current
      let totalDistance = 0

      points.forEach((point, index) => {
        const marker = new BMapGL.Marker(point)
        map.addOverlay(marker)
        measureOverlaysRef.current.push(marker)

        const deleteLabel = new BMapGL.Label(
          '<button type="button" class="baidu-measure-delete" aria-label="删除测量点">×</button>',
          {
            position: point,
            offset: new BMapGL.Size(10, -34),
          },
        )
        deleteLabel.setStyle({
          border: '0',
          background: 'transparent',
          padding: '0',
        })
        deleteLabel.addEventListener('click', (event: any) => {
          event?.domEvent?.preventDefault?.()
          event?.domEvent?.stopPropagation?.()
          measurePointsRef.current.splice(index, 1)
          renderMeasurement()
        })
        map.addOverlay(deleteLabel)
        measureOverlaysRef.current.push(deleteLabel)

        if (index === 0) return
        const segment = [points[index - 1], point]
        const line = new BMapGL.Polyline(segment, {
          strokeColor: '#172c36',
          strokeWeight: 3,
          strokeOpacity: 0.85,
          strokeStyle: 'dashed',
        })
        map.addOverlay(line)
        measureOverlaysRef.current.push(line)
        const distance = map.getDistance(segment[0], segment[1])
        totalDistance += distance
        const label = new BMapGL.Label(`${(distance / 1000).toFixed(2)} km`, {
          position: point,
          offset: new BMapGL.Size(8, -10),
        })
        label.setStyle({
          border: '1px solid #172c36',
          borderRadius: '3px',
          padding: '3px 5px',
          fontSize: '11px',
          color: '#172c36',
        })
        map.addOverlay(label)
        measureOverlaysRef.current.push(label)
      })

      setMeasurePointCount(points.length)
      setMeasuredDistance(totalDistance)
    }

    const handler = (event: MouseEvent) => {
      if (!measuring) return
      if ((event.target as Element | null)?.closest?.('.baidu-measure-delete')) return
      const bounds = container.getBoundingClientRect()
      const point = map.pixelToPoint(
        new BMapGL.Pixel(event.clientX - bounds.left, event.clientY - bounds.top),
      )
      measurePointsRef.current.push(point)
      renderMeasurement()
    }
    container.addEventListener('click', handler, true)
    return () => container.removeEventListener('click', handler, true)
  }, [mapReady, measuring])

  useEffect(() => {
    const BMapGL = baiduRef.current
    const map = mapRef.current
    if (!mapReady || !BMapGL || !map) return
    const generation = ++generationRef.current
    const requestController = new AbortController()
    renderOverlaysRef.current.forEach((overlay) => map.removeOverlay?.(overlay))
    renderOverlaysRef.current = []
    map.clearOverlays()
    measurePointsRef.current = []
    measureOverlaysRef.current = []
    setMeasuredDistance(0)
    setMeasurePointCount(0)
    const relevantGroups = routeGroupsForScope(roadbook, scope)
    const relevantGroupIds = new Set(relevantGroups.map((group) => group.id))
    const allGroups = displayDrivingGroups(roadbook, scope)
    const addRenderOverlay = (overlay: any) => {
      map.addOverlay(overlay)
      renderOverlaysRef.current.push(overlay)
    }
    const markerVisuals: Array<{
      id: string
      point: any
      element: HTMLElement
      priority: number
    }> = []

    markerEntries.forEach(({ day, dayIndex, stop, stopIndex, relevant }) => {
      if (scope.mode !== 'global' && day.id !== activeDayId) return
      const visible =
        visibilityAllowsStop(visibility, stop) &&
        focusAllowsStop(focusMode, stop) &&
        (focusMode !== 'cost' || visibility.costs)
      if (!visible) return
      const [lng, lat] = gcj02ToBd09(stop.location)
      const point = new BMapGL.Point(lng, lat)
      const emphasizeMarker =
        scope.mode === 'global' || relevant || day.id === activeDayId
      const content = createStopMarkerElement({
        dayIndex,
        stopIndex,
        stop,
        photos: placeLibraryEntry(roadbook, stop).photos,
        selected: selectedStopId === stop.id,
        dimmed: !emphasizeMarker,
        showNumber: scope.mode !== 'global',
        showLabel:
          scope.mode !== 'global' &&
          emphasizeMarker &&
          visibility.labels,
        focusMode,
      })
      content.addEventListener('click', () => {
        onSelectStop(stop.id)
        setDismissedStopId(null)
        setSelectedElement({
          kind: 'stop',
          dayId: roadbook.days[dayIndex].id,
          stopId: stop.id,
        })
      })
      const marker = createBaiduHtmlOverlay(
        BMapGL,
        point,
        content,
        { x: 21, y: scope.mode === 'global' ? 42 : 52 },
        selectedStopId === stop.id ? 160 : emphasizeMarker ? 130 : 110,
      )
      addRenderOverlay(marker)
      markerVisuals.push({
        id: `stop:${stop.id}`,
        point,
        element: content,
        priority: selectedStopId === stop.id ? 1000 : 500,
      })
    })

    if (visibility.knowledge && focusShowsKnowledge(focusMode)) {
      const scopeDayIndex =
        scope.mode === 'global'
          ? undefined
          : roadbook.days.findIndex((day) => day.id === scope.dayId)
      knowledgePlacesForScope(roadbook, scopeDayIndex).forEach((place) => {
        if (isKnowledgePlaceSelected(place, roadbook)) return
        const [lng, lat] = gcj02ToBd09(place.location)
        const point = new BMapGL.Point(lng, lat)
        const virtualStop = knowledgePlaceToStop(
          place,
          roadbook.travelers.map((traveler) => traveler.id),
        )
        const content = createKnowledgeMarkerElement(
          place,
          placeLibraryEntry(roadbook, virtualStop).photos,
        )
        content.addEventListener('click', () => {
          setSelectedElement({ kind: 'knowledge', placeId: place.id })
          setDismissedStopId(null)
        })
        const marker = createBaiduHtmlOverlay(
          BMapGL,
          point,
          content,
          { x: 17, y: 34 },
          place.isNiche ? 62 : 68,
        )
        addRenderOverlay(marker)
        markerVisuals.push({
          id: `knowledge:${place.id}`,
          point,
          element: content,
          priority: place.isNiche ? 50 : 100,
        })
      })
    }

    let collisionTimer = 0
    const updateMarkerCollisions = () => {
      if (generationRef.current !== generation || !map.pointToOverlayPixel) return
      const projected = markerVisuals.flatMap((item) => {
        const pixel = map.pointToOverlayPixel(item.point)
        const x = Number(pixel?.x)
        const y = Number(pixel?.y)
        return Number.isFinite(x) && Number.isFinite(y)
          ? [{ id: item.id, x, y, priority: item.priority }]
          : []
      })
      applyMarkerOffsets(markerVisuals, calculateMarkerOffsets(projected))
    }
    const scheduleMarkerCollisions = () => {
      window.clearTimeout(collisionTimer)
      collisionTimer = window.setTimeout(updateMarkerCollisions, 80)
    }
    map.addEventListener('zoomend', scheduleMarkerCollisions)
    map.addEventListener('moveend', scheduleMarkerCollisions)
    scheduleMarkerCollisions()

    const draw = async () => {
      if (!visibility.routes) {
        setRouteActivity({ pending: 0, retries: 0 })
        return
      }
      const resolved: ResolvedLeg[] = []
      const queue = [...allGroups].sort(
        (left, right) =>
          Number(relevantGroupIds.has(right.id)) - Number(relevantGroupIds.has(left.id)),
      )
      setRouteActivity({ pending: queue.length, retries: 0 })
      await Promise.all(
        queue.map(async (group) => {
          try {
            if (generationRef.current !== generation) return
            const cacheKey = group.stops.map((stop) => stop.location.join(',')).join('|')
            let result = routeCacheRef.current.get(cacheKey)
            if (result === undefined) {
              try {
                result = await searchBaiduRoute(
                  BMapGL,
                  map,
                  group,
                  requestController.signal,
                  () => {
                    if (generationRef.current === generation) {
                      setRouteActivity((current) => ({
                        ...current,
                        retries: current.retries + 1,
                      }))
                    }
                  },
                )
                routeCacheRef.current.set(cacheKey, result)
              } catch {
                return
              }
            }
            if (!result.path.length || generationRef.current !== generation) return
            const active = scope.mode === 'global' || relevantGroupIds.has(group.id)
            const color = DAY_COLORS[group.dayIndex % DAY_COLORS.length]
            const line = new BMapGL.Polyline(result.path, {
              strokeColor: color,
              strokeWeight: active || focusMode === 'driving' ? 7 : 4,
              strokeOpacity:
                focusMode === 'overview' || focusMode === 'driving'
                  ? active || focusMode === 'driving'
                    ? 0.9
                    : 0.48
                  : active
                    ? 0.28
                    : 0.16,
            })
            line.addEventListener('click', () => {
              if (scope.mode === 'global') {
                onScopeChange({ mode: 'day', dayId: group.dayId })
              }
            })
            addRenderOverlay(line)
            const labelPairs: Array<{
              stop: TripStop
              previous: TripStop
              text: string
              daySummary: boolean
            }> = []
            if (
              visibility.distances &&
              focusShowsDistances(focusMode) &&
              scope.mode === 'global'
            ) {
              labelPairs.push({
                stop: group.stops.at(-1)!,
                previous: group.stops[0],
                text: `第 ${group.dayIndex + 1} 天 · ${result.distanceKm.toFixed(0)} km`,
                daySummary: true,
              })
            } else if (
              visibility.distances &&
              focusShowsDistances(focusMode) &&
              active
            ) {
              labelPairs.push(
                ...group.stops.slice(1).map((stop, index) => ({
                  stop,
                  previous: group.stops[index],
                  text: `${(stop.legFromPrevious?.distanceKm || 0).toFixed(1)} km`,
                  daySummary: false,
                })),
              )
            }
            labelPairs.forEach(({ stop, previous, text, daySummary }) => {
              const midpoint: [number, number] = [
                (previous.location[0] + stop.location[0]) / 2,
                (previous.location[1] + stop.location[1]) / 2,
              ]
              const [labelLng, labelLat] = gcj02ToBd09(midpoint)
              const label = new BMapGL.Label(text, {
                position: new BMapGL.Point(labelLng, labelLat),
              })
              label.setStyle({
                border: `1px solid ${color}`,
                borderRadius: '4px',
                background: '#fff',
                color,
                cursor: 'pointer',
                fontSize: '10px',
                padding: '3px 5px',
                opacity: active ? '1' : '0.66',
              })
              label.addEventListener('click', () => {
                if (daySummary) {
                  onScopeChange({ mode: 'day', dayId: group.dayId })
                  return
                }
                const nextScope: MapScope = {
                  mode: 'leg',
                  dayId: group.dayId,
                  stopId: stop.id,
                  fromStopId: previous.id,
                }
                onScopeChange(nextScope)
                onSelectStop(stop.id)
                setDismissedStopId(null)
                setSelectedElement({
                  kind: 'leg',
                  dayId: group.dayId,
                  stopId: stop.id,
                  fromStopId: previous.id,
                })
              })
              addRenderOverlay(label)
            })
            if (group.stops.length === 2) {
              resolved.push({
                dayId: group.dayId,
                fromStopId: group.stops[0].id,
                stopId: group.stops[1].id,
                distanceKm: result.distanceKm,
                durationMinutes: result.durationMinutes,
                roadNames: result.roadNames,
              })
            }
          } finally {
            if (generationRef.current === generation) {
              setRouteActivity((current) => ({
                ...current,
                pending: Math.max(0, current.pending - 1),
              }))
            }
          }
        }),
      )
      if (generationRef.current === generation && scope.mode === 'leg') {
        onRoutesResolved(resolved)
      }
    }
    void draw()

    const fitStops = relevantGroups.flatMap((group) => group.stops)
    fitPoints(BMapGL, map, fitStops.length ? fitStops : markerEntries.map(({ stop }) => stop))
    return () => {
      window.clearTimeout(collisionTimer)
      map.removeEventListener?.('zoomend', scheduleMarkerCollisions)
      map.removeEventListener?.('moveend', scheduleMarkerCollisions)
      requestController.abort()
      if (generationRef.current === generation) generationRef.current += 1
    }
  }, [
    activeDayId,
    focusMode,
    mapReady,
    markerEntries,
    onRoutesResolved,
    onScopeChange,
    onSelectStop,
    roadbook,
    selectedStopId,
    scope,
    visibility,
  ])

  const selectedRelevantFrom = selectedFrom || null
  const resetMeasurement = () => {
    const map = mapRef.current
    measureOverlaysRef.current.forEach((overlay) => map?.removeOverlay?.(overlay))
    measurePointsRef.current = []
    measureOverlaysRef.current = []
    setMeasuredDistance(0)
    setMeasurePointCount(0)
  }
  const openPlace = () => {
    const place = selectedKnowledgeStop || selectedStop
    if (place) {
      window.open(buildBaiduPlaceUrl(place), '_blank', 'noopener,noreferrer')
    }
  }
  const openRoute = () => {
    if (selectedRelevantFrom && selectedStop) {
      window.open(
        buildBaiduNavigationUrl(selectedRelevantFrom, selectedStop),
        '_blank',
        'noopener,noreferrer',
      )
    }
  }
  const patchVisibility = (key: keyof MapVisibility) =>
    setVisibility((current) => ({ ...current, [key]: !current[key] }))

  return (
    <section className="map-shell baidu-map-shell" aria-label="百度路书地图">
      <div className="map-canvas" ref={containerRef} />
      {!mapReady && !mapError ? (
        <div className="map-loading">
          <LocateFixed size={20} />
          正在载入百度地图
        </div>
      ) : null}
      {mapError ? (
        <div className="map-error">
          <LocateFixed size={16} />
          {mapError}
        </div>
      ) : null}
      {mapReady && routeActivity.pending > 0 ? (
        <div className="map-route-activity" aria-live="polite">
          <LocateFixed size={15} />
          {routeActivity.retries > 0
            ? `导航重试 ${routeActivity.retries} · 待完成 ${routeActivity.pending}`
            : `导航排队中 · 待完成 ${routeActivity.pending}`}
        </div>
      ) : null}

      <div className="map-focus-bar" aria-label="地图专题">
        {focusModes.map((mode) => {
          const Icon = mode.icon
          return (
            <button
              type="button"
              key={mode.value}
              className={focusMode === mode.value ? 'is-active' : ''}
              onClick={() => {
                setFocusMode(mode.value)
                setVisibility((current) => visibilityForFocus(current, mode.value))
                setSelectedElement(null)
                setDetailExpanded(false)
                if (selectedStopId) setDismissedStopId(selectedStopId)
              }}
              title={`${mode.label}专题`}
            >
              <Icon size={15} />
              {mode.label}
            </button>
          )
        })}
      </div>

      <div className="map-tools">
        <button
          type="button"
          className={baseLayer === 'satellite' ? 'is-active' : ''}
          onClick={() =>
            setBaseLayer((current) => (current === 'standard' ? 'satellite' : 'standard'))
          }
          title="普通 / 卫星地图"
        >
          <Satellite size={17} />
        </button>
        <button
          type="button"
          className={visibility.traffic ? 'is-active' : ''}
          onClick={() => patchVisibility('traffic')}
          title="实时路况"
        >
          <TrafficCone size={17} />
        </button>
        <button
          type="button"
          className={measuring ? 'is-active' : ''}
          onClick={() =>
            setMeasuring((current) => {
              resetMeasurement()
              return !current
            })
          }
          title="点击地图逐点测距"
        >
          <Ruler size={17} />
        </button>
        <div className="map-layer-menu-wrap">
          <button
            type="button"
            className={layerMenuOpen ? 'is-active' : ''}
            onClick={() => setLayerMenuOpen((current) => !current)}
            title="地图图例"
            aria-expanded={layerMenuOpen}
            aria-controls="baidu-layer-legend"
          >
            <Layers3 size={17} />
            <ChevronDown size={12} />
          </button>
          {layerMenuOpen ? (
            <div
              className="map-layer-menu"
              id="baidu-layer-legend"
              role="group"
              aria-label="地图图例"
            >
              {(
                [
                  ['routes', '导航曲线'],
                  ['distances', '路段公里数'],
                  ['scenic', '景点'],
                  ['knowledge', '规划景点'],
                  ['hotels', '酒店'],
                  ['costs', '费用'],
                  ['labels', '地点标签'],
                ] as Array<[keyof MapVisibility, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={visibility[key]}
                    onChange={() => patchVisibility(key)}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!selectedStop && !selectedKnowledgeStop}
          onClick={openPlace}
          title="百度地图地点"
        >
          <Eye size={17} />
        </button>
      </div>

      {measuring ? (
        <div className="map-measure-status">
          <Ruler size={14} />
          <span>
            {measurePointCount
              ? `累计 ${(measuredDistance / 1000).toFixed(2)} km`
              : '点击地图添加测量点'}
          </span>
          <button type="button" onClick={resetMeasurement} title="清空测距">
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="map-summary">
        <MapPinned size={16} />
        <strong>{scopeLabel(roadbook, scope)}</strong>
        <span />
        驾车 <strong>{scopeDrivingDistance(roadbook, scope).toFixed(0)}</strong> 公里
        {scope.mode === 'global' &&
        visibility.knowledge &&
        focusShowsKnowledge(focusMode) &&
        knowledgePlaces.length ? (
          <>
            <span />
            <strong>{knowledgePlaces.length}</strong> 个规划点
          </>
        ) : null}
        {focusMode === 'cost' ? (
          <>
            <span />
            <strong>¥{totalCost(roadbook).toLocaleString('zh-CN')}</strong>
          </>
        ) : null}
      </div>

      {selectedKnowledge && selectedKnowledgeStop ? (
        <aside className={`map-detail-panel${detailExpanded ? ' is-expanded' : ''}`}>
          <button
            type="button"
            className="map-detail-expand"
            onClick={() => setDetailExpanded((current) => !current)}
            title={detailExpanded ? '缩小详情' : '放大详情'}
          >
            {detailExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="map-detail-close"
            onClick={() => {
              setSelectedElement(null)
              setDetailExpanded(false)
            }}
            aria-label="关闭地图详情"
          >
            <X size={16} />
          </button>
          <KnowledgePlaceDetails
            roadbook={roadbook}
            place={selectedKnowledge}
            stop={selectedKnowledgeStop}
            selected={isKnowledgePlaceSelected(selectedKnowledge, roadbook)}
            readOnly={readOnly}
            onAddPhoto={onAddPlacePhoto}
            onAddNote={onAddPlaceNote}
            onAddPlace={onAddKnowledgePlace}
            onOpenMap={openPlace}
          />
        </aside>
      ) : null}

      {detailElement && selectedStop && selectedDay ? (
        <aside className={`map-detail-panel${detailExpanded ? ' is-expanded' : ''}`}>
          <button
            type="button"
            className="map-detail-expand"
            onClick={() => setDetailExpanded((current) => !current)}
            title={detailExpanded ? '缩小详情' : '放大详情'}
          >
            {detailExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="map-detail-close"
            onClick={() => {
              setSelectedElement(null)
              setDismissedStopId(selectedStop.id)
              setDetailExpanded(false)
            }}
            aria-label="关闭地图详情"
          >
            <X size={16} />
          </button>
          <span className="map-detail-kicker">
            {detailElement.kind === 'leg' ? 'BAIDU ROUTE' : 'BAIDU PLACE'}
          </span>
          <h3>
            {detailElement.kind === 'leg' && selectedRelevantFrom
              ? `${selectedRelevantFrom.name} → ${selectedStop.name}`
              : selectedStop.name}
          </h3>
          <p className="map-detail-address">{selectedStop.address}</p>
          {detailElement.kind === 'leg' && selectedRelevantFrom ? (
            <>
              <PlaceMediaGallery
                roadbook={roadbook}
                stop={selectedStop}
                readOnly={readOnly}
                onAddPhoto={onAddPlacePhoto}
                onAddNote={onAddPlaceNote}
              />
              {selectedStopKnowledge ? (
                <KnowledgeReferencePanel place={selectedStopKnowledge} />
              ) : null}
              <div className="map-detail-metrics">
                <span>
                  <strong>{selectedStop.legFromPrevious?.distanceKm.toFixed(1)}</strong> km
                </span>
                <span>
                  <strong>{selectedStop.legFromPrevious?.durationMinutes}</strong> 分钟
                </span>
                <span>
                  <strong>¥{legCost(selectedStop.legFromPrevious)}</strong> 路段费
                </span>
              </div>
              <button type="button" className="map-detail-primary" onClick={openRoute}>
                <Navigation size={15} />
                在百度查看导航
              </button>
            </>
          ) : (
            <>
              <PlaceMediaGallery
                roadbook={roadbook}
                stop={selectedStop}
                readOnly={readOnly}
                onAddPhoto={onAddPlacePhoto}
                onAddNote={onAddPlaceNote}
              />
              {selectedStopKnowledge ? (
                <KnowledgeReferencePanel place={selectedStopKnowledge} />
              ) : null}
              <div className="map-detail-metrics">
                <span>
                  <strong>{selectedStop.arrivalTime}</strong> 到达
                </span>
                <span>
                  <strong>{selectedStop.stayMinutes}</strong> 分钟
                </span>
                <span>
                  <strong>¥{stopCost(selectedStop)}</strong> 费用
                </span>
              </div>
              <button type="button" className="map-detail-primary" onClick={openPlace}>
                <Eye size={15} />
                百度地图地点
              </button>
            </>
          )}
          <button
            type="button"
            className="map-detail-edit"
            onClick={() =>
              onEditStop(selectedStop, selectedRelevantFrom, selectedDay.id)
            }
          >
            编辑详情
          </button>
        </aside>
      ) : null}
    </section>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BedDouble,
  Car,
  ChevronDown,
  CircleDollarSign,
  Eye,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Navigation,
  Pencil,
  Ruler,
  Satellite,
  TrafficCone,
  X,
} from 'lucide-react'
import { PlaceMediaGallery } from '@/components/PlaceMediaGallery'
import {
  DAY_COLORS,
  legCost,
  stopCost,
  totalCost,
  visibleStops,
} from '@/lib/roadbooks'
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
  buildAmapNavigationUrl,
  buildAmapPlaceUrl,
  loadAMap,
  searchNearbyFuelStations,
} from '@/lib/amap'
import { placeLibraryEntry } from '@/lib/place-media'
import type {
  MapBaseLayer,
  MapFocusMode,
  MapScope,
  MapVisibility,
  ResolvedLeg,
  Roadbook,
  TripStop,
} from '@/types'

interface AmapCanvasProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  onSelectStop: (stopId: string) => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null, dayId: string) => void
  onRoutesResolved: (legs: ResolvedLeg[]) => void
  scope: MapScope
  onScopeChange: (scope: MapScope) => void
  onAddPlacePhoto: (stopId: string, file: File) => Promise<void>
  onAddPlaceNote: (stopId: string, text: string) => void
  readOnly: boolean
}

interface RouteResult {
  path: any[]
  distanceKm: number
  durationMinutes: number
  tolls?: number
  tollDistanceKm?: number
  roadNames?: string[]
  tollRoads?: string[]
}

interface SelectedElement {
  kind: 'stop' | 'leg'
  dayId: string
  stopId: string
  fromStopId?: string
}

const focusModes: Array<{ value: MapFocusMode; label: string; icon: typeof MapIcon }> = [
  { value: 'overview', label: '总览', icon: MapIcon },
  { value: 'scenic', label: '景点', icon: MapPinned },
  { value: 'cost', label: '费用', icon: CircleDollarSign },
  { value: 'driving', label: '驾车', icon: Car },
  { value: 'hotel', label: '酒店', icon: BedDouble },
]

const defaultVisibility: MapVisibility = {
  routes: true,
  distances: true,
  scenic: true,
  hotels: true,
  costs: true,
  fuel: false,
  labels: true,
  traffic: false,
}

const roadTypeLabels = {
  highway: '高速',
  national: '国道',
  provincial: '省道',
  county: '县乡道路',
  unpaved: '非铺装路',
  mixed: '混合道路',
  unknown: '待确认',
}

const signalLabels = {
  good: '信号良好',
  weak: '信号间歇',
  none: '无信号',
  unknown: '待确认',
}

function markerElement({
  dayIndex,
  stopIndex,
  stop,
  photoUrl,
  selected,
  dimmed,
  focusMode,
}: {
  dayIndex: number
  stopIndex: number
  stop: TripStop
  photoUrl?: string
  selected: boolean
  dimmed: boolean
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
  marker.style.setProperty('--marker-color', DAY_COLORS[dayIndex % DAY_COLORS.length])
  marker.setAttribute('aria-label', `第 ${dayIndex + 1} 天，第 ${stopIndex + 1} 站，${stop.name}`)

  const pin = document.createElement('span')
  pin.className = 'map-marker-pin'
  if (photoUrl) {
    const photo = document.createElement('img')
    photo.src = photoUrl
    photo.alt = ''
    photo.onload = () => {
      if (photo.naturalWidth === photo.naturalHeight) photo.remove()
    }
    pin.appendChild(photo)
  }
  const number = document.createElement('b')
  number.textContent = String(stopIndex + 1)
  pin.appendChild(number)
  marker.appendChild(pin)

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
  if (!dimmed) marker.appendChild(label)
  return marker
}

function fuelMarkerElement(name: string) {
  const marker = document.createElement('div')
  marker.className = 'map-fuel-marker'
  marker.title = name
  marker.innerHTML = '<span>油</span>'
  return marker
}

function findRoutePath(route: any) {
  const steps = route?.steps || route?.rides || []
  return steps.flatMap((step: any) => step.path || [])
}

function endpointRouteKey(group: RouteGroup, reverse = false) {
  const start = reverse ? group.stops.at(-1)! : group.stops[0]
  const end = reverse ? group.stops[0] : group.stops.at(-1)!
  return `${group.dayId}|${start.location.join(',')}|${end.location.join(',')}`
}

function searchRoute(
  AMap: any,
  group: RouteGroup,
): Promise<RouteResult | null> {
  const points = group.stops.map((stop) => new AMap.LngLat(...stop.location))
  if (points.length < 2) return Promise.resolve(null)
  const service = new AMap.Driving({ extensions: 'all', policy: 0 })

  return new Promise((resolve) => {
    service.search(
      points[0],
      points.at(-1),
      { waypoints: points.slice(1, -1) },
      (status: string, result: any) => {
        const route = result?.routes?.[0]
        if (status !== 'complete' || !route) {
          resolve(null)
          return
        }
        const distanceKm = Number(((route.distance || 0) / 1000).toFixed(1))
        if (!isPlausibleRouteDistance(group, distanceKm)) {
          resolve(null)
          return
        }
        const roadNames = [...new Set(
          (route.steps || []).map((step: any) => step.road).filter(Boolean),
        )] as string[]
        const tollRoads = [...new Set(
          (route.steps || [])
            .map((step: any) => step.tollsRoad)
            .filter(Boolean),
        )] as string[]
        resolve({
          path: findRoutePath(route),
          distanceKm,
          durationMinutes: Math.max(1, Math.round((route.time || route.duration || 0) / 60)),
          tolls: Number(route.tolls) || 0,
          tollDistanceKm: Number(((route.tollsDistance || 0) / 1000).toFixed(1)),
          roadNames,
          tollRoads,
        })
      },
    )
  })
}

function FallbackMap({
  roadbook,
  activeDayId,
  selectedStopId,
  onSelectStop,
  scope,
}: Pick<AmapCanvasProps, 'roadbook' | 'activeDayId' | 'selectedStopId' | 'onSelectStop' | 'scope'>) {
  const allStops = markerEntriesForScope(roadbook, scope).filter(
    ({ day }) => day.id === activeDayId,
  )
  const bounds = useMemo(() => {
    if (!allStops.length) return { minLng: 90, maxLng: 122, minLat: 27, maxLat: 42 }
    const lngs = allStops.map(({ stop }) => stop.location[0])
    const lats = allStops.map(({ stop }) => stop.location[1])
    return {
      minLng: Math.min(...lngs) - 0.3,
      maxLng: Math.max(...lngs) + 0.3,
      minLat: Math.min(...lats) - 0.3,
      maxLat: Math.max(...lats) + 0.3,
    }
  }, [allStops])
  const point = (location: [number, number]) => ({
    x: 7 + ((location[0] - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 86,
    y: 93 - ((location[1] - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 86,
  })

  return (
    <div className="fallback-map" aria-label="路线地图备用视图">
      {allStops.map(({ dayIndex, stop, stopIndex, relevant }) => {
        const position = point(stop.location)
        return (
          <button
            type="button"
            className={`fallback-marker${selectedStopId === stop.id ? ' is-selected' : ''}`}
            key={stop.id}
            style={
              {
                left: `${position.x}%`,
                top: `${position.y}%`,
                '--marker-color': DAY_COLORS[dayIndex % DAY_COLORS.length],
                opacity: relevant || scope.mode === 'global' ? 1 : 0.65,
              } as React.CSSProperties
            }
            onClick={() => onSelectStop(stop.id)}
            title={stop.name}
          >
            {stopIndex + 1}
          </button>
        )
      })}
      <div className="map-error">
        <AlertTriangle size={16} />
        地图服务暂不可用，导航路线未显示
      </div>
    </div>
  )
}

export function AmapCanvas({
  roadbook,
  activeDayId,
  selectedStopId,
  onSelectStop,
  onEditStop,
  onRoutesResolved,
  scope,
  onScopeChange,
  onAddPlacePhoto,
  onAddPlaceNote,
  readOnly,
}: AmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const amapRef = useRef<any>(null)
  const trafficLayerRef = useRef<any>(null)
  const satelliteLayersRef = useRef<any[]>([])
  const standardLayerRef = useRef<any>(null)
  const mouseToolRef = useRef<any>(null)
  const generationRef = useRef(0)
  const routeCacheRef = useRef(new Map<string, RouteResult | null>())
  const endpointRouteCacheRef = useRef(new Map<string, RouteResult>())
  const [mapError, setMapError] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [focusMode, setFocusMode] = useState<MapFocusMode>('overview')
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>('standard')
  const [visibility, setVisibility] = useState<MapVisibility>(defaultVisibility)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [dismissedStopId, setDismissedStopId] = useState<string | null>(null)
  const externalSelectedDay = selectedStopId
    ? roadbook.days.find((day) => day.stops.some((stop) => stop.id === selectedStopId))
    : null
  const detailElement =
    selectedElement && selectedElement.stopId === selectedStopId
      ? selectedElement
      : selectedStopId && externalSelectedDay && dismissedStopId !== selectedStopId
        ? { kind: 'stop' as const, dayId: externalSelectedDay.id, stopId: selectedStopId }
        : null
  const selectedDay = detailElement
    ? roadbook.days.find((day) => day.id === detailElement.dayId)
    : null
  const selectedStop = selectedDay?.stops.find((stop) => stop.id === detailElement?.stopId)
  const selectedFrom = selectedDay?.stops.find((stop) => stop.id === detailElement?.fromStopId)

  useEffect(() => {
    let cancelled = false
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return
        amapRef.current = AMap
        const standard = new AMap.TileLayer()
        const satellite = new AMap.TileLayer.Satellite()
        const roadNet = new AMap.TileLayer.RoadNet()
        const traffic = new AMap.TileLayer.Traffic({ zIndex: 16 })
        standardLayerRef.current = standard
        satelliteLayersRef.current = [satellite, roadNet]
        trafficLayerRef.current = traffic
        const map = new AMap.Map(containerRef.current, {
          zoom: 11,
          center: [101.7782, 36.6171],
          viewMode: '3D',
          pitch: 0,
          mapStyle: 'amap://styles/normal',
          resizeEnable: true,
          showLabel: true,
          layers: [standard],
        })
        map.addControl(new AMap.Scale({ position: 'LB' }))
        map.addControl(new AMap.ToolBar({ position: 'RB', liteStyle: true }))
        map.on('zoomchange', () => {
          containerRef.current?.classList.toggle('map-zoom-detail', map.getZoom() >= 11)
        })
        mapRef.current = map
        mouseToolRef.current = new AMap.MouseTool(map)
        setMapReady(true)
      })
      .catch(() => setMapError(true))

    return () => {
      cancelled = true
      mapRef.current?.destroy()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const layers =
      baseLayer === 'satellite' ? satelliteLayersRef.current : [standardLayerRef.current]
    mapRef.current.setLayers(layers)
    if (visibility.traffic) trafficLayerRef.current?.setMap(mapRef.current)
    else trafficLayerRef.current?.setMap(null)
  }, [baseLayer, mapReady, visibility.traffic])

  useEffect(() => {
    if (!mouseToolRef.current) return
    if (measuring) {
      mouseToolRef.current.rule({
        startMarkerOptions: { icon: undefined },
        endMarkerOptions: { icon: undefined },
      })
    } else {
      mouseToolRef.current.close(false)
    }
  }, [measuring])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !amapRef.current) return
    const generation = ++generationRef.current
    const map = mapRef.current
    const AMap = amapRef.current
    const resolvedLegs: ResolvedLeg[] = []
    map.clearMap()
    const globalGroups = displayDrivingGroups(roadbook, scope)
    const relevantGroups = routeGroupsForScope(roadbook, scope)
    const relevantGroupIds = new Set(relevantGroups.map((group) => group.id))
    const markerEntries = markerEntriesForScope(roadbook, scope)
    const selfDriveIds = new Set(markerEntries.map(({ stop }) => stop.id))
    const relevantStopIds = new Set(
      markerEntries.filter(({ relevant }) => relevant).map(({ stop }) => stop.id),
    )

    roadbook.days.forEach((day, dayIndex) => {
      if (day.id !== activeDayId) return
      const stops = visibleStops(day)

      stops.forEach((stop, stopIndex) => {
        if (!selfDriveIds.has(stop.id)) return
        const relevant =
          focusMode === 'overview' ||
          focusMode === 'cost' ||
          focusMode === 'driving' ||
          (focusMode === 'scenic' && stop.type === 'scenic') ||
          (focusMode === 'hotel' && stop.type === 'hotel')
        const emphasizeMarker =
          relevantStopIds.has(stop.id) &&
          relevant &&
          (scope.mode !== 'global' ||
            (focusMode === 'overview'
              ? stop.type === 'hotel' || stop.type === 'fuel'
              : focusMode === 'driving'
                ? stop.type === 'hotel' || stop.type === 'fuel'
                : true))
        const typeVisible =
          (stop.type !== 'scenic' || visibility.scenic) &&
          (stop.type !== 'hotel' || visibility.hotels)
        if (typeVisible) {
          const marker = new AMap.Marker({
            position: stop.location,
            content: markerElement({
              dayIndex,
              stopIndex,
              stop,
              photoUrl: placeLibraryEntry(roadbook, stop).photos[0]?.url,
              selected: selectedStopId === stop.id,
              dimmed: !emphasizeMarker,
              focusMode: focusMode === 'cost' && !visibility.costs ? 'overview' : focusMode,
            }),
            anchor: 'bottom-center',
            zIndex: selectedStopId === stop.id ? 160 : emphasizeMarker ? 130 : 110,
            title: stop.name,
          })
          marker.on('click', () => {
            onSelectStop(stop.id)
            setDismissedStopId(null)
            setSelectedElement({ kind: 'stop', dayId: day.id, stopId: stop.id })
          })
          marker.setMap(map)
        }

        if (
          day.id === activeDayId &&
          relevantStopIds.has(stop.id) &&
          visibility.labels &&
          focusMode !== 'cost' &&
          relevantGroups.some((group) => group.stops[0]?.id === stop.id)
        ) {
          const label = new AMap.Text({
            position: stop.location,
            text: `D${dayIndex + 1} · ${day.title}`,
            anchor: 'bottom-left',
            offset: new AMap.Pixel(16, -45),
            style: {
              border: '0',
              padding: '6px 9px',
              borderRadius: '4px',
              color: '#263041',
              boxShadow: '0 4px 14px rgba(18, 32, 51, .16)',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            },
          })
          label.setMap(map)
        }

      })
    })

    const drawRoutes = async () => {
      if (!visibility.routes) return
      const queue = [...globalGroups].sort(
        (left, right) =>
          Number(relevantGroupIds.has(right.id)) - Number(relevantGroupIds.has(left.id)),
      )
      const workers = Array.from({ length: 1 }, async () => {
        while (queue.length && generationRef.current === generation) {
          const group = queue.shift()
          if (!group) break
          const { dayId, dayIndex } = group
          const color = DAY_COLORS[dayIndex % DAY_COLORS.length]
          const active =
            scope.mode === 'global'
              ? dayId === activeDayId
              : relevantGroupIds.has(group.id)
          const cacheKey = group.stops.map((stop) => stop.location.join(',')).join('|')
          let route = routeCacheRef.current.get(cacheKey)
          if (route === undefined) {
            route = await searchRoute(AMap, group).catch(() => null)
            if (!route) {
              await new Promise((resolve) => window.setTimeout(resolve, 550))
              route = await searchRoute(AMap, group).catch(() => null)
            }
            routeCacheRef.current.set(cacheKey, route)
          }
          if (!route) {
            // AMap can return a four-digit detour for the reverse half of a remote
            // out-and-back. Reuse only the same day's resolved road geometry.
            const reverseRoute = endpointRouteCacheRef.current.get(
              endpointRouteKey(group, true),
            )
            if (reverseRoute) {
              route = {
                ...reverseRoute,
                path: [...reverseRoute.path].reverse(),
              }
            }
          }
          if (generationRef.current !== generation) return
          if (!route?.path?.length) continue
          endpointRouteCacheRef.current.set(endpointRouteKey(group), route)
          const path = route.path
          const line = new AMap.Polyline({
            path,
            strokeColor: color,
            strokeWeight: active || focusMode === 'driving' ? 6 : 4,
            strokeOpacity:
              focusMode === 'hotel' || focusMode === 'scenic'
                ? 0.18
                : active || focusMode === 'driving'
                  ? 0.86
                  : 0.42,
            strokeStyle: 'solid',
            lineJoin: 'round',
            lineCap: 'round',
            showDir: active || focusMode === 'driving',
            cursor: 'pointer',
            zIndex: active ? 90 : 70,
          })
          line.on('click', () => {
            if (scope.mode === 'global') onScopeChange({ mode: 'day', dayId })
          })
          line.setMap(map)

          if (group.stops.length === 2) {
            resolvedLegs.push({
              dayId,
              stopId: group.stops[1].id,
              fromStopId: group.stops[0].id,
              distanceKm: route.distanceKm,
              durationMinutes: route.durationMinutes,
              tolls: route.tolls,
              tollDistanceKm: route.tollDistanceKm,
              roadNames: route.roadNames,
              tollRoads: route.tollRoads,
            })
          }

          if (visibility.distances) {
            if (scope.mode === 'global') {
              if (dayId !== activeDayId) {
                await new Promise((resolve) => window.setTimeout(resolve, 180))
                continue
              }
              const middle = path[Math.floor(path.length / 2)]
              const content = document.createElement('button')
              content.type = 'button'
              content.className = 'map-distance-label'
              content.style.setProperty('--route-color', color)
              content.textContent = `D${dayIndex + 1} · ${route.distanceKm.toFixed(0)} km`
              content.addEventListener('click', (event) => {
                event.stopPropagation()
                onScopeChange({ mode: 'day', dayId })
              })
              const distanceLabel = new AMap.Marker({
                position: middle,
                anchor: 'center',
                content,
                zIndex: 120,
              })
              distanceLabel.setMap(map)
            } else if (active || focusMode === 'driving') {
              group.stops.slice(1).forEach((stop, index) => {
                const previous = group.stops[index]
                const midpoint: [number, number] = [
                  (previous.location[0] + stop.location[0]) / 2,
                  (previous.location[1] + stop.location[1]) / 2,
                ]
                const content = document.createElement('button')
                content.type = 'button'
                content.className = 'map-distance-label'
                content.style.setProperty('--route-color', color)
                content.textContent = `${(stop.legFromPrevious?.distanceKm || 0).toFixed(1)} km`
                content.addEventListener('click', (event) => {
                  event.stopPropagation()
                  onScopeChange({
                    mode: 'leg',
                    dayId,
                    stopId: stop.id,
                    fromStopId: previous.id,
                  })
                  onSelectStop(stop.id)
                  setDismissedStopId(null)
                  setSelectedElement({
                    kind: 'leg',
                    dayId,
                    stopId: stop.id,
                    fromStopId: previous.id,
                  })
                })
                const distanceLabel = new AMap.Marker({
                  position: midpoint,
                  anchor: 'center',
                  content,
                  zIndex: 120,
                })
                distanceLabel.setMap(map)
              })
            }
          }
          await new Promise((resolve) => window.setTimeout(resolve, 180))
        }
      })
      await Promise.all(workers)
      if (generationRef.current === generation && scope.mode === 'leg') {
        onRoutesResolved(resolvedLegs)
      }
    }

    void drawRoutes()

    if (visibility.fuel) {
      const activeDay = roadbook.days.find((day) => day.id === activeDayId)
      const stops = activeDay ? visibleStops(activeDay) : []
      const drivingPairs = stops
        .map((stop, index) => ({ stop, index }))
        .filter(({ stop, index }) => index > 0 && stop.legFromPrevious?.mode === 'driving')
        .slice(0, 4)
      void (async () => {
        const seen = new Set<string>()
        for (const { index } of drivingPairs) {
          const from = stops[index - 1]
          const to = stops[index]
          const midpoint: [number, number] = [
            (from.location[0] + to.location[0]) / 2,
            (from.location[1] + to.location[1]) / 2,
          ]
          const stations = await searchNearbyFuelStations(midpoint).catch(() => [])
          if (generationRef.current !== generation) return
          stations.forEach((station) => {
            if (seen.has(station.id)) return
            seen.add(station.id)
            const marker = new AMap.Marker({
              position: station.location,
              content: fuelMarkerElement(station.name),
              anchor: 'center',
              zIndex: 125,
              title: station.name,
            })
            marker.setMap(map)
          })
          await new Promise((resolve) => window.setTimeout(resolve, 220))
        }
      })()
    }

    const fitStops = relevantGroups.flatMap((group) => group.stops)
    const fitLocations = (fitStops.length ? fitStops : markerEntries.map(({ stop }) => stop))
      .map((stop) => stop.location)
    if (fitLocations.length) {
      window.setTimeout(() => {
        if (generationRef.current === generation) {
          const lngs = fitLocations.map(([lng]) => lng)
          const lats = fitLocations.map(([, lat]) => lat)
          const southWest = new AMap.LngLat(Math.min(...lngs), Math.min(...lats))
          const northEast = new AMap.LngLat(Math.max(...lngs), Math.max(...lats))
          map.setBounds(
            new AMap.Bounds(southWest, northEast),
            true,
            [95, 80, 80, 95],
          )
          if (map.getZoom() > 15) map.setZoom(15)
        }
      }, 120)
    }

    return () => {
      if (generationRef.current === generation) {
        generationRef.current += 1
      }
    }
  }, [
    activeDayId,
    focusMode,
    mapReady,
    onRoutesResolved,
    onSelectStop,
    onScopeChange,
    roadbook,
    scope,
    selectedStopId,
    visibility.costs,
    visibility.distances,
    visibility.fuel,
    visibility.hotels,
    visibility.labels,
    visibility.routes,
    visibility.scenic,
  ])

  const openSelectedInAmap = () => {
    if (!selectedStop) return
    window.open(buildAmapPlaceUrl(selectedStop), '_blank', 'noopener,noreferrer')
  }

  const openNavigation = () => {
    if (!selectedFrom || !selectedStop) return
    window.open(
      buildAmapNavigationUrl(selectedFrom, selectedStop),
      '_blank',
      'noopener,noreferrer',
    )
  }

  const patchVisibility = (key: keyof MapVisibility) =>
    setVisibility((current) => ({ ...current, [key]: !current[key] }))

  return (
    <section className="map-shell" aria-label="路书地图">
      <div className="map-canvas" ref={containerRef} />
      {mapError ? (
        <FallbackMap
          roadbook={roadbook}
          activeDayId={activeDayId}
          selectedStopId={selectedStopId}
          onSelectStop={onSelectStop}
          scope={scope}
        />
      ) : null}
      {!mapReady && !mapError ? (
        <div className="map-loading">
          <LocateFixed size={20} />
          正在载入地图
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
              onClick={() => setFocusMode(mode.value)}
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
          onClick={() => setBaseLayer((current) => (current === 'standard' ? 'satellite' : 'standard'))}
          title={baseLayer === 'standard' ? '切换卫星地图' : '切换普通地图'}
        >
          {baseLayer === 'standard' ? <Satellite size={17} /> : <MapIcon size={17} />}
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
          onClick={() => setMeasuring((current) => !current)}
          title="测距"
        >
          <Ruler size={17} />
        </button>
        <div className="map-layer-menu-wrap">
          <button
            type="button"
            className={layerMenuOpen ? 'is-active' : ''}
            onClick={() => setLayerMenuOpen((current) => !current)}
            title="地图要素"
          >
            <Layers3 size={17} />
            <ChevronDown size={12} />
          </button>
          {layerMenuOpen ? (
            <div className="map-layer-menu">
              {(
                [
                  ['routes', '导航曲线'],
                  ['distances', '路段公里数'],
                  ['scenic', '景点'],
                  ['hotels', '酒店'],
                  ['costs', '费用'],
                  ['fuel', '沿途加油站'],
                  ['labels', '日程标签'],
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
          disabled={!selectedStop}
          onClick={openSelectedInAmap}
          title="在高德地图打开当前地点实景"
        >
          <Eye size={17} />
        </button>
      </div>

      <div className="map-summary">
        <MapPinned size={16} />
        <strong>{scopeLabel(roadbook, scope)}</strong>
        <span />
        驾车 <strong>{scopeDrivingDistance(roadbook, scope).toFixed(0)}</strong> 公里
        {focusMode === 'cost' ? (
          <>
            <span />
            <strong>¥{totalCost(roadbook).toLocaleString('zh-CN')}</strong>
          </>
        ) : null}
      </div>

      {detailElement && selectedStop && selectedDay ? (
        <aside className="map-detail-panel">
          <button
            type="button"
            className="map-detail-close"
            onClick={() => {
              setSelectedElement(null)
              setDismissedStopId(selectedStop.id)
            }}
            aria-label="关闭地图详情"
          >
            <X size={16} />
          </button>
          <span className="map-detail-kicker">
            {detailElement.kind === 'leg' ? 'ROUTE DETAIL' : 'PLACE DETAIL'}
          </span>
          {detailElement.kind === 'leg' && selectedFrom ? (
            <>
              <h3>{selectedFrom.name} → {selectedStop.name}</h3>
              <div className="map-detail-metrics">
                <span><strong>{selectedStop.legFromPrevious?.distanceKm.toFixed(1)}</strong> km</span>
                <span><strong>{selectedStop.legFromPrevious?.durationMinutes}</strong> 分钟</span>
                <span><strong>¥{legCost(selectedStop.legFromPrevious)}</strong> 路段费</span>
              </div>
              <dl>
                <div>
                  <dt>道路</dt>
                  <dd>
                    {roadTypeLabels[selectedStop.legFromPrevious?.roadType || 'unknown']}
                  </dd>
                </div>
                <div>
                  <dt>信号</dt>
                  <dd>{signalLabels[selectedStop.legFromPrevious?.signal || 'unknown']}</dd>
                </div>
                {selectedStop.legFromPrevious?.roadNames?.length ? (
                  <div>
                    <dt>途经</dt>
                    <dd>{selectedStop.legFromPrevious.roadNames.slice(0, 3).join('、')}</dd>
                  </div>
                ) : null}
              </dl>
              {selectedStop.legFromPrevious?.notes.map((note) => (
                <div className="map-detail-note" key={note.id}>
                  {note.imageDataUrl ? <img src={note.imageDataUrl} alt="" /> : null}
                  <p>{note.text}</p>
                </div>
              ))}
              <button type="button" className="map-detail-primary" onClick={openNavigation}>
                <Navigation size={15} />
                在高德查看导航
              </button>
            </>
          ) : (
            <>
              <h3>{selectedStop.name}</h3>
              <p className="map-detail-address">{selectedStop.address}</p>
              <PlaceMediaGallery
                roadbook={roadbook}
                stop={selectedStop}
                readOnly={readOnly}
                onAddPhoto={onAddPlacePhoto}
                onAddNote={onAddPlaceNote}
              />
              <div className="map-detail-metrics">
                <span><strong>{selectedStop.arrivalTime}</strong> 到达</span>
                <span><strong>{selectedStop.stayMinutes}</strong> 分钟</span>
                <span><strong>¥{stopCost(selectedStop)}</strong> 费用</span>
              </div>
              {selectedStop.expenses.length ? (
                <dl>
                  {selectedStop.expenses.map((expense) => (
                    <div key={expense.id}>
                      <dt>{expense.label}</dt>
                      <dd>¥{expense.amount.toLocaleString('zh-CN')}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {selectedStop.notes.map((note) => (
                <div className="map-detail-note" key={note.id}>
                  {note.imageDataUrl ? <img src={note.imageDataUrl} alt="" /> : null}
                  <p>{note.text}</p>
                </div>
              ))}
              <button type="button" className="map-detail-primary" onClick={openSelectedInAmap}>
                <Eye size={15} />
                高德实景 / 地点
              </button>
            </>
          )}
          <button
            type="button"
            className="map-detail-edit"
            onClick={() => onEditStop(selectedStop, selectedFrom || null, selectedDay.id)}
          >
            <Pencil size={15} />
            编辑详情
          </button>
        </aside>
      ) : null}
    </section>
  )
}

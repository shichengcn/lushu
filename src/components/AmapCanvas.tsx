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
import {
  DAY_COLORS,
  legCost,
  stopCost,
  totalCost,
  totalDrivingDistance,
  visibleStops,
} from '@/lib/roadbooks'
import {
  buildAmapNavigationUrl,
  buildAmapPlaceUrl,
  estimateLeg,
  loadAMap,
  searchNearbyFuelStations,
} from '@/lib/amap'
import type {
  MapBaseLayer,
  MapFocusMode,
  MapVisibility,
  ResolvedLeg,
  Roadbook,
  TransportMode,
  TripStop,
} from '@/types'

interface AmapCanvasProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  onSelectStop: (stopId: string) => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null, dayId: string) => void
  onRoutesResolved: (legs: ResolvedLeg[]) => void
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
  selected,
  dimmed,
  focusMode,
}: {
  dayIndex: number
  stopIndex: number
  stop: TripStop
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
  pin.textContent = String(stopIndex + 1)
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

function searchRoute(
  AMap: any,
  from: [number, number],
  to: [number, number],
  mode: TransportMode,
): Promise<RouteResult | null> {
  if (mode === 'transit' || mode === 'train' || mode === 'flight') return Promise.resolve(null)
  const Service =
    mode === 'walking' ? AMap.Walking : mode === 'cycling' ? AMap.Riding : AMap.Driving
  const service = new Service({ extensions: 'all', policy: mode === 'driving' ? 0 : undefined })

  return new Promise((resolve) => {
    service.search(
      new AMap.LngLat(from[0], from[1]),
      new AMap.LngLat(to[0], to[1]),
      (status: string, result: any) => {
        const route = result?.routes?.[0]
        if (status !== 'complete' || !route) {
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
          distanceKm: Number(((route.distance || 0) / 1000).toFixed(1)),
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
}: Pick<AmapCanvasProps, 'roadbook' | 'activeDayId' | 'selectedStopId' | 'onSelectStop'>) {
  const allStops = roadbook.days.flatMap((day, dayIndex) =>
    visibleStops(day).map((stop, stopIndex) => ({ day, dayIndex, stop, stopIndex })),
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
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {roadbook.days.map((day, dayIndex) => {
          const points = visibleStops(day).map((stop) => {
            const position = point(stop.location)
            return `${position.x},${position.y}`
          })
          return points.length > 1 ? (
            <polyline
              key={day.id}
              points={points.join(' ')}
              fill="none"
              stroke={DAY_COLORS[dayIndex % DAY_COLORS.length]}
              strokeOpacity={day.id === activeDayId ? 0.9 : 0.35}
              strokeWidth={day.id === activeDayId ? 1.2 : 0.7}
              vectorEffect="non-scaling-stroke"
            />
          ) : null
        })}
      </svg>
      {allStops.map(({ day, dayIndex, stop, stopIndex }) => {
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
                opacity: day.id === activeDayId ? 1 : 0.65,
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
        地图服务暂不可用，已显示路线概览
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
  const [mapError, setMapError] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [focusMode, setFocusMode] = useState<MapFocusMode>('overview')
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>('standard')
  const [visibility, setVisibility] = useState<MapVisibility>(defaultVisibility)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)

  const selectedDay = selectedElement
    ? roadbook.days.find((day) => day.id === selectedElement.dayId)
    : null
  const selectedStop = selectedDay?.stops.find((stop) => stop.id === selectedElement?.stopId)
  const selectedFrom = selectedDay?.stops.find((stop) => stop.id === selectedElement?.fromStopId)

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
    const overlays: any[] = []
    const activeOverlays: any[] = []
    const routeOverlays: any[] = []
    const resolvedLegs: ResolvedLeg[] = []
    map.clearMap()

    const routeJobs: Array<{
      dayId: string
      dayIndex: number
      stop: TripStop
      stopIndex: number
      previous: TripStop
      color: string
      active: boolean
    }> = []

    roadbook.days.forEach((day, dayIndex) => {
      const stops = visibleStops(day)
      const color = DAY_COLORS[dayIndex % DAY_COLORS.length]
      const isActive = day.id === activeDayId

      stops.forEach((stop, stopIndex) => {
        const relevant =
          focusMode === 'overview' ||
          focusMode === 'cost' ||
          focusMode === 'driving' ||
          (focusMode === 'scenic' && stop.type === 'scenic') ||
          (focusMode === 'hotel' && stop.type === 'hotel')
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
              selected: selectedStopId === stop.id,
              dimmed: !relevant || !isActive,
              focusMode: focusMode === 'cost' && !visibility.costs ? 'overview' : focusMode,
            }),
            anchor: 'bottom-center',
            zIndex: selectedStopId === stop.id ? 160 : isActive ? 130 : 110,
            title: stop.name,
          })
          marker.on('click', () => {
            onSelectStop(stop.id)
            setSelectedElement({ kind: 'stop', dayId: day.id, stopId: stop.id })
          })
          marker.setMap(map)
          overlays.push(marker)
          if (isActive) activeOverlays.push(marker)
        }

        if (stopIndex === 0 && visibility.labels && focusMode !== 'cost' && isActive) {
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
          overlays.push(label)
          if (isActive) activeOverlays.push(label)
        }

        if (stopIndex > 0 && visibility.routes) {
          routeJobs.push({
            dayId: day.id,
            dayIndex,
            stop,
            stopIndex,
            previous: stops[stopIndex - 1],
            color,
            active: isActive,
          })
        }
      })
    })

    const drawRoutes = async () => {
      const queue = [...routeJobs]
      const workers = Array.from({ length: 3 }, async () => {
        while (queue.length && generationRef.current === generation) {
          const job = queue.shift()
          if (!job) break
          const { dayId, stop, previous, color, active } = job
          const mode = stop.legFromPrevious?.mode || 'driving'
          const fallback = estimateLeg(previous.location, stop.location, mode)
          const cacheKey = `${previous.location.join(',')}|${stop.location.join(',')}|${mode}`
          let route = routeCacheRef.current.get(cacheKey)
          if (route === undefined) {
            route = await searchRoute(AMap, previous.location, stop.location, mode).catch(() => null)
            routeCacheRef.current.set(cacheKey, route)
          }
          if (generationRef.current !== generation) return
          const path = route?.path?.length ? route.path : [previous.location, stop.location]
          const line = new AMap.Polyline({
            path,
            strokeColor: color,
            strokeWeight: active || focusMode === 'driving' ? 6 : 4,
            strokeOpacity:
              focusMode === 'hotel' || focusMode === 'scenic'
                ? 0.18
                : active || focusMode === 'driving'
                  ? 0.86
                  : 0.12,
            strokeStyle:
              mode === 'walking' || mode === 'transit' || mode === 'train' || mode === 'flight'
                ? 'dashed'
                : 'solid',
            lineJoin: 'round',
            lineCap: 'round',
            showDir: mode === 'driving' && (active || focusMode === 'driving'),
            cursor: 'pointer',
            zIndex: active ? 90 : 70,
          })
          line.on('click', () =>
            setSelectedElement({
              kind: 'leg',
              dayId,
              stopId: stop.id,
              fromStopId: previous.id,
            }),
          )
          line.setMap(map)
          routeOverlays.push(line)

          const distanceKm = route?.distanceKm || fallback.distanceKm
          const durationMinutes = route?.durationMinutes || fallback.durationMinutes
          resolvedLegs.push({
            dayId,
            stopId: stop.id,
            fromStopId: previous.id,
            distanceKm,
            durationMinutes,
            tolls: route?.tolls,
            tollDistanceKm: route?.tollDistanceKm,
            roadNames: route?.roadNames,
            tollRoads: route?.tollRoads,
          })

          if (visibility.distances && (active || focusMode === 'driving')) {
            const middle = path[Math.floor(path.length / 2)]
            if (middle) {
              const content = document.createElement('button')
              content.type = 'button'
              content.className = 'map-distance-label'
              content.style.setProperty('--route-color', color)
              content.textContent = `${distanceKm.toFixed(1)} km`
              content.addEventListener('click', (event) => {
                event.stopPropagation()
                setSelectedElement({
                  kind: 'leg',
                  dayId,
                  stopId: stop.id,
                  fromStopId: previous.id,
                })
              })
              const distanceLabel = new AMap.Marker({
                position: middle,
                anchor: 'center',
                content,
                zIndex: 120,
              })
              distanceLabel.setMap(map)
              routeOverlays.push(distanceLabel)
            }
          }
        }
      })
      await Promise.all(workers)
      if (generationRef.current === generation) onRoutesResolved(resolvedLegs)
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
            overlays.push(marker)
          })
          await new Promise((resolve) => window.setTimeout(resolve, 220))
        }
      })()
    }

    const fitOverlays = activeOverlays.length ? activeOverlays : overlays
    if (fitOverlays.length) {
      window.setTimeout(() => {
        if (generationRef.current === generation) {
          map.setFitView(fitOverlays, false, [95, 80, 80, 95], 15)
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
    roadbook,
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
        <strong>{roadbook.days.length}</strong> 天
        <span />
        驾车 <strong>{totalDrivingDistance(roadbook).toFixed(0)}</strong> 公里
        {focusMode === 'cost' ? (
          <>
            <span />
            <strong>¥{totalCost(roadbook).toLocaleString('zh-CN')}</strong>
          </>
        ) : null}
      </div>

      {selectedElement && selectedStop && selectedDay ? (
        <aside className="map-detail-panel">
          <button
            type="button"
            className="map-detail-close"
            onClick={() => setSelectedElement(null)}
            aria-label="关闭地图详情"
          >
            <X size={16} />
          </button>
          <span className="map-detail-kicker">
            {selectedElement.kind === 'leg' ? 'ROUTE DETAIL' : 'PLACE DETAIL'}
          </span>
          {selectedElement.kind === 'leg' && selectedFrom ? (
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

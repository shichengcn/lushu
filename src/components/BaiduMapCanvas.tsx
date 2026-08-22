import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BedDouble,
  Car,
  CircleDollarSign,
  Eye,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Navigation,
  Ruler,
  Satellite,
  TrafficCone,
  X,
} from 'lucide-react'
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
  DAY_COLORS,
  legCost,
  stopCost,
  totalCost,
} from '@/lib/roadbooks'
import { placeLibraryEntry } from '@/lib/place-media'
import type {
  MapBaseLayer,
  MapFocusMode,
  MapScope,
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
  onAddPlacePhoto: (stopId: string, file: File) => Promise<void>
  onAddPlaceNote: (stopId: string, text: string) => void
  readOnly: boolean
}

interface BaiduRouteResult {
  path: any[]
  distanceKm: number
  durationMinutes: number
  roadNames: string[]
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

function stopLabel(stop: TripStop, index: number, focusMode: MapFocusMode) {
  if (focusMode === 'cost') {
    return `${index + 1}  ${stop.name}  ¥${stopCost(stop).toLocaleString('zh-CN')}`
  }
  return `${index + 1}  ${stop.name}`
}

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
  const [traffic, setTraffic] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [measuredDistance, setMeasuredDistance] = useState(0)
  const [measurePointCount, setMeasurePointCount] = useState(0)
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
    if (traffic) map.setTrafficOn?.()
    else map.setTrafficOff?.()
  }, [baseLayer, mapReady, traffic])

  useEffect(() => {
    const BMapGL = baiduRef.current
    const map = mapRef.current
    const container = containerRef.current
    if (!mapReady || !BMapGL || !map || !container) return
    const handler = (event: MouseEvent) => {
      if (!measuring) return
      const bounds = container.getBoundingClientRect()
      const point = map.pixelToPoint(
        new BMapGL.Pixel(event.clientX - bounds.left, event.clientY - bounds.top),
      )
      measurePointsRef.current.push(point)
      setMeasurePointCount(measurePointsRef.current.length)
      const points = measurePointsRef.current
      const marker = new BMapGL.Marker(point)
      map.addOverlay(marker)
      measureOverlaysRef.current.push(marker)
      if (points.length > 1) {
        const segment = [points.at(-2), points.at(-1)]
        const line = new BMapGL.Polyline(segment, {
          strokeColor: '#172c36',
          strokeWeight: 3,
          strokeOpacity: 0.85,
          strokeStyle: 'dashed',
        })
        map.addOverlay(line)
        const distance = map.getDistance(segment[0], segment[1])
        setMeasuredDistance((current) => current + distance)
        const label = new BMapGL.Label(`${(distance / 1000).toFixed(2)} km`, {
          position: segment[1],
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
        measureOverlaysRef.current.push(line, label)
      }
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

    markerEntries.forEach(({ day, dayIndex, stop, stopIndex, relevant }) => {
      if (day.id !== activeDayId) return
      const [lng, lat] = gcj02ToBd09(stop.location)
      const point = new BMapGL.Point(lng, lat)
      const marker = new BMapGL.Marker(point)
      const photoUrl = placeLibraryEntry(roadbook, stop).photos[0]?.url
      if (photoUrl) {
        const preview = new Image()
        preview.onload = () => {
          if (preview.naturalWidth === preview.naturalHeight) return
          marker.setIcon(
            new BMapGL.Icon(photoUrl, new BMapGL.Size(46, 46), {
              anchor: new BMapGL.Size(23, 46),
              imageSize: new BMapGL.Size(46, 46),
            }),
          )
        }
        preview.src = photoUrl
      }
      marker.setTitle(stop.name)
      marker.addEventListener('click', () => {
        onSelectStop(stop.id)
        setDismissedStopId(null)
        setSelectedElement({
          kind: 'stop',
          dayId: roadbook.days[dayIndex].id,
          stopId: stop.id,
        })
      })
      addRenderOverlay(marker)
      const numberLabel = new BMapGL.Label(String(stopIndex + 1), {
        position: point,
        offset: new BMapGL.Size(-14, -58),
      })
      numberLabel.setStyle({
        width: '28px',
        height: '28px',
        border: '3px solid #fff',
        borderRadius: '50%',
        background: DAY_COLORS[dayIndex % DAY_COLORS.length],
        color: '#fff',
        fontSize: '14px',
        fontWeight: '800',
        lineHeight: '22px',
        textAlign: 'center',
        boxShadow: '0 3px 8px rgba(24,39,53,.28)',
      })
      numberLabel.addEventListener('click', () => {
        onSelectStop(stop.id)
        setDismissedStopId(null)
        setSelectedElement({
          kind: 'stop',
          dayId: roadbook.days[dayIndex].id,
          stopId: stop.id,
        })
      })
      addRenderOverlay(numberLabel)
      const selected = selectedStopId === stop.id
      const focused =
        (relevant || day.id === activeDayId) &&
        (focusMode === 'overview' ||
          focusMode === 'cost' ||
          focusMode === 'driving' ||
          (focusMode === 'scenic' && stop.type === 'scenic') ||
          (focusMode === 'hotel' && stop.type === 'hotel')) &&
        (scope.mode !== 'global' ||
          (focusMode === 'overview' || focusMode === 'driving'
            ? stop.type === 'hotel' || stop.type === 'fuel'
            : true))
      const label = new BMapGL.Label(stopLabel(stop, stopIndex, focusMode), {
        position: point,
        offset: new BMapGL.Size(13, -35),
      })
      label.setStyle({
        border: `${selected ? 2 : 1}px solid ${
          focused ? DAY_COLORS[dayIndex % DAY_COLORS.length] : '#9da8b1'
        }`,
        borderRadius: '4px',
        background: '#fff',
        color: '#26313f',
        fontSize: '11px',
        padding: '4px 7px',
        opacity: focused ? '1' : '0.7',
        boxShadow: selected
          ? '0 0 0 3px rgba(16,167,162,.2)'
          : focused
            ? '0 3px 10px rgba(20,35,48,.18)'
            : 'none',
      })
      label.addEventListener('click', () => {
        onSelectStop(stop.id)
        setDismissedStopId(null)
        setSelectedElement({
          kind: 'stop',
          dayId: roadbook.days[dayIndex].id,
          stopId: stop.id,
        })
      })
      if (focused) addRenderOverlay(label)
    })

    const draw = async () => {
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
            const active =
              scope.mode === 'global'
                ? group.dayId === activeDayId
                : relevantGroupIds.has(group.id)
            const color = DAY_COLORS[group.dayIndex % DAY_COLORS.length]
            const line = new BMapGL.Polyline(result.path, {
              strokeColor: color,
              strokeWeight: active ? 7 : 4,
              strokeOpacity: active ? 0.9 : 0.48,
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
            if (scope.mode === 'global' && group.dayId === activeDayId) {
              labelPairs.push({
                stop: group.stops.at(-1)!,
                previous: group.stops[0],
                text: `第 ${group.dayIndex + 1} 天 · ${result.distanceKm.toFixed(0)} km`,
                daySummary: true,
              })
            } else if (active) {
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
    if (selectedStop) {
      window.open(buildBaiduPlaceUrl(selectedStop), '_blank', 'noopener,noreferrer')
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
              onClick={() => setFocusMode(mode.value)}
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
          className={traffic ? 'is-active' : ''}
          onClick={() => setTraffic((current) => !current)}
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
        <button type="button" disabled={!selectedStop} onClick={openPlace} title="百度地图地点">
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

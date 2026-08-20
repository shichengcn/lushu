import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, LocateFixed, MapPinned } from 'lucide-react'
import { DAY_COLORS, totalDistance } from '@/lib/roadbooks'
import { estimateLeg, loadAMap } from '@/lib/amap'
import type { Roadbook, TransportMode } from '@/types'

interface ResolvedLeg {
  dayId: string
  stopId: string
  distanceKm: number
  durationMinutes: number
}

interface AmapCanvasProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  onSelectStop: (stopId: string) => void
  onRoutesResolved: (legs: ResolvedLeg[]) => void
}

interface RouteResult {
  path: any[]
  distanceKm: number
  durationMinutes: number
}

function markerElement(dayIndex: number, stopIndex: number, isSelected: boolean) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `map-marker${isSelected ? ' is-selected' : ''}`
  marker.style.setProperty('--marker-color', DAY_COLORS[dayIndex % DAY_COLORS.length])
  marker.setAttribute('aria-label', `第 ${dayIndex + 1} 天，第 ${stopIndex + 1} 站`)

  const dot = document.createElement('span')
  dot.textContent = String(stopIndex + 1)
  marker.appendChild(dot)
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
  if (mode === 'transit') return Promise.resolve(null)

  const Service =
    mode === 'walking' ? AMap.Walking : mode === 'cycling' ? AMap.Riding : AMap.Driving
  const service = new Service({ extensions: 'base' })

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

        const path = findRoutePath(route)
        resolve({
          path,
          distanceKm: Number(((route.distance || 0) / 1000).toFixed(1)),
          durationMinutes: Math.max(1, Math.round((route.time || route.duration || 0) / 60)),
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
}: Omit<AmapCanvasProps, 'onRoutesResolved'>) {
  const allStops = roadbook.days.flatMap((day, dayIndex) =>
    day.stops.map((stop, stopIndex) => ({ day, dayIndex, stop, stopIndex })),
  )
  const bounds = useMemo(() => {
    if (!allStops.length) return { minLng: 119.9, maxLng: 120.4, minLat: 30.1, maxLat: 30.4 }
    const lngs = allStops.map(({ stop }) => stop.location[0])
    const lats = allStops.map(({ stop }) => stop.location[1])
    return {
      minLng: Math.min(...lngs) - 0.02,
      maxLng: Math.max(...lngs) + 0.02,
      minLat: Math.min(...lats) - 0.02,
      maxLat: Math.max(...lats) + 0.02,
    }
  }, [allStops])
  const point = (location: [number, number]) => ({
    x: 8 + ((location[0] - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 84,
    y: 92 - ((location[1] - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 84,
  })

  return (
    <div className="fallback-map" aria-label="路线地图备用视图">
      <div className="fallback-map__district district-one">西湖区</div>
      <div className="fallback-map__district district-two">上城区</div>
      <div className="fallback-map__district district-three">拱墅区</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {roadbook.days.map((day, dayIndex) => {
          const points = day.stops.map((stop) => {
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
  onRoutesResolved,
}: AmapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const amapRef = useRef<any>(null)
  const generationRef = useRef(0)
  const [mapError, setMapError] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return
        amapRef.current = AMap
        const map = new AMap.Map(containerRef.current, {
          zoom: 11,
          center: [120.1551, 30.2741],
          viewMode: '2D',
          mapStyle: 'amap://styles/whitesmoke',
          resizeEnable: true,
          showLabel: true,
        })
        map.addControl(new AMap.Scale({ position: 'LB' }))
        map.addControl(new AMap.ToolBar({ position: 'RB', liteStyle: true }))
        mapRef.current = map
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
    if (!mapReady || !mapRef.current || !amapRef.current) return
    const generation = ++generationRef.current
    const map = mapRef.current
    const AMap = amapRef.current
    const overlays: any[] = []
    const routeJobs: Promise<ResolvedLeg | null>[] = []

    map.clearMap()

    roadbook.days.forEach((day, dayIndex) => {
      const color = DAY_COLORS[dayIndex % DAY_COLORS.length]
      const isActive = day.id === activeDayId

      day.stops.forEach((stop, stopIndex) => {
        const marker = new AMap.Marker({
          position: stop.location,
          content: markerElement(dayIndex, stopIndex, selectedStopId === stop.id),
          anchor: 'bottom-center',
          zIndex: isActive ? 130 : 110,
          title: stop.name,
        })
        marker.on('click', () => onSelectStop(stop.id))
        marker.setMap(map)
        overlays.push(marker)

        if (stopIndex === 0) {
          const label = new AMap.Text({
            position: stop.location,
            text: `第${dayIndex + 1}天`,
            anchor: 'bottom-left',
            offset: new AMap.Pixel(16, -38),
            style: {
              border: '0',
              padding: '6px 9px',
              borderRadius: '4px',
              color: '#263041',
              boxShadow: '0 4px 14px rgba(18, 32, 51, .16)',
              fontSize: '12px',
            },
          })
          label.setMap(map)
          overlays.push(label)
        }

        if (stopIndex > 0) {
          const previous = day.stops[stopIndex - 1]
          const mode = stop.legFromPrevious?.mode || 'driving'
          const fallback = estimateLeg(previous.location, stop.location, mode)
          const fallbackLine = new AMap.Polyline({
            path: [previous.location, stop.location],
            strokeColor: color,
            strokeWeight: isActive ? 6 : 4,
            strokeOpacity: isActive ? 0.72 : 0.28,
            strokeStyle: mode === 'walking' || mode === 'transit' ? 'dashed' : 'solid',
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: isActive ? 90 : 70,
          })
          fallbackLine.setMap(map)
          overlays.push(fallbackLine)

          routeJobs.push(
            searchRoute(AMap, previous.location, stop.location, mode)
              .then((route) => {
                if (generationRef.current !== generation) return null
                if (route?.path?.length) {
                  map.remove(fallbackLine)
                  const routeLine = new AMap.Polyline({
                    path: route.path,
                    strokeColor: color,
                    strokeWeight: isActive ? 6 : 4,
                    strokeOpacity: isActive ? 0.85 : 0.32,
                    strokeStyle: mode === 'walking' ? 'dashed' : 'solid',
                    lineJoin: 'round',
                    lineCap: 'round',
                    showDir: mode === 'driving' && isActive,
                    zIndex: isActive ? 90 : 70,
                  })
                  routeLine.setMap(map)
                  overlays.push(routeLine)
                }
                return {
                  dayId: day.id,
                  stopId: stop.id,
                  distanceKm: route?.distanceKm || fallback.distanceKm,
                  durationMinutes: route?.durationMinutes || fallback.durationMinutes,
                }
              })
              .catch(() => ({
                dayId: day.id,
                stopId: stop.id,
                ...fallback,
              })),
          )
        }
      })
    })

    if (overlays.length) {
      window.setTimeout(() => {
        if (generationRef.current === generation) {
          map.setFitView(overlays, false, [70, 70, 70, 70], 15)
        }
      }, 80)
    }

    Promise.all(routeJobs).then((resolved) => {
      if (generationRef.current === generation) {
        onRoutesResolved(resolved.filter((leg): leg is ResolvedLeg => Boolean(leg)))
      }
    })
  }, [activeDayId, mapReady, onRoutesResolved, onSelectStop, roadbook, selectedStopId])

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
      <div className="map-summary">
        <MapPinned size={16} />
        <strong>{roadbook.days.length}</strong> 天
        <span />
        约 <strong>{totalDistance(roadbook).toFixed(0)}</strong> 公里
      </div>
    </section>
  )
}

import AMapLoader from '@amap/amap-jsapi-loader'
import type { PlaceSuggestion, TransportMode } from '@/types'

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode: string
    }
  }
}

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'd883ed71b801d6ce344f7cd3a330535a'
const AMAP_SECURITY_CODE =
  import.meta.env.VITE_AMAP_SECURITY_CODE || 'acef0dccf36fa7c4adc3f9e90c18730d'

let amapPromise: Promise<any> | null = null

export function loadAMap() {
  if (!amapPromise) {
    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    amapPromise = AMapLoader.load({
      key: AMAP_KEY,
      version: '2.0',
      plugins: [
        'AMap.Scale',
        'AMap.ToolBar',
        'AMap.MapType',
        'AMap.MouseTool',
        'AMap.Driving',
        'AMap.Walking',
        'AMap.Riding',
        'AMap.PlaceSearch',
      ],
    })
  }
  return amapPromise
}

export async function searchPlaces(keyword: string): Promise<PlaceSuggestion[]> {
  if (!keyword.trim()) return []
  const AMap = await loadAMap()

  return new Promise((resolve, reject) => {
    const placeSearch = new AMap.PlaceSearch({
      city: '全国',
      citylimit: false,
      pageSize: 8,
      extensions: 'base',
    })

    placeSearch.search(keyword.trim(), (status: string, result: any) => {
      if (status !== 'complete' || !result?.poiList?.pois) {
        reject(new Error('没有找到相关地点'))
        return
      }

      resolve(
        result.poiList.pois.map((poi: any) => ({
          id: poi.id || `${poi.location.lng}-${poi.location.lat}`,
          name: poi.name,
          address: [poi.pname, poi.cityname, poi.adname, poi.address].filter(Boolean).join(''),
          location: [Number(poi.location.lng), Number(poi.location.lat)],
          type: poi.type,
        })),
      )
    })
  })
}

export async function searchNearbyFuelStations(
  location: [number, number],
  radius = 12000,
): Promise<PlaceSuggestion[]> {
  const AMap = await loadAMap()

  return new Promise((resolve) => {
    const placeSearch = new AMap.PlaceSearch({
      type: '汽车服务|加油站',
      pageSize: 3,
      extensions: 'base',
    })
    placeSearch.searchNearBy(
      '加油站',
      new AMap.LngLat(location[0], location[1]),
      radius,
      (status: string, result: any) => {
        if (status !== 'complete' || !result?.poiList?.pois) {
          resolve([])
          return
        }
        resolve(
          result.poiList.pois.map((poi: any) => ({
            id: poi.id || `${poi.location.lng}-${poi.location.lat}`,
            name: poi.name,
            address: [poi.pname, poi.cityname, poi.adname, poi.address]
              .filter(Boolean)
              .join(''),
            location: [Number(poi.location.lng), Number(poi.location.lat)],
            type: poi.type,
          })),
        )
      },
    )
  })
}

export function buildAmapNavigationUrl(
  from: { name: string; location: [number, number] },
  to: { name: string; location: [number, number] },
  policy = 0,
) {
  const url = new URL('https://uri.amap.com/navigation')
  url.searchParams.set('from', `${from.location[0]},${from.location[1]},${from.name}`)
  url.searchParams.set('to', `${to.location[0]},${to.location[1]},${to.name}`)
  url.searchParams.set('mode', 'car')
  url.searchParams.set('policy', String(policy))
  url.searchParams.set('src', 'tuji-roadbook')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

export function buildAmapPlaceUrl(place: {
  name: string
  location: [number, number]
}) {
  const url = new URL('https://uri.amap.com/marker')
  url.searchParams.set('position', `${place.location[0]},${place.location[1]}`)
  url.searchParams.set('name', place.name)
  url.searchParams.set('src', 'tuji-roadbook')
  url.searchParams.set('coordinate', 'gaode')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

export function estimateLeg(
  from: [number, number],
  to: [number, number],
  mode: TransportMode,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latDelta = toRadians(to[1] - from[1])
  const lngDelta = toRadians(to[0] - from[0])
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from[1])) *
      Math.cos(toRadians(to[1])) *
      Math.sin(lngDelta / 2) ** 2
  const directDistance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distanceFactor =
    mode === 'walking'
      ? 1.18
      : mode === 'cycling'
        ? 1.25
        : mode === 'flight'
          ? 1
          : mode === 'train'
            ? 1.12
            : 1.35
  const distanceKm = directDistance * distanceFactor
  const speed: Record<TransportMode, number> = {
    driving: 55,
    walking: 4.5,
    transit: 18,
    cycling: 13,
    train: 220,
    flight: 650,
  }

  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes: Math.max(1, Math.round((distanceKm / speed[mode]) * 60)),
  }
}

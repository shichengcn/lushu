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
  const distanceFactor = mode === 'walking' ? 1.18 : mode === 'cycling' ? 1.25 : 1.35
  const distanceKm = directDistance * distanceFactor
  const speed = { driving: 30, walking: 4.5, transit: 18, cycling: 13 }[mode]

  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    durationMinutes: Math.max(1, Math.round((distanceKm / speed) * 60)),
  }
}

import { RateLimitedRetryQueue, type QueueRunOptions } from '@/lib/async-request-queue'

const BAIDU_KEY =
  import.meta.env.VITE_BAIDU_MAP_KEY || 'RggonQuu8xGmZCLRMgpg4OLt5BaRr0Wd'

export const BAIDU_REQUEST_INTERVAL_MS = 500
export const BAIDU_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000] as const
const MAX_BROWSER_TIMEOUT_MS = 2_147_000_000

export function baiduRetryDelay(attempt: number) {
  return Math.min(1000 * 2 ** attempt, MAX_BROWSER_TIMEOUT_MS)
}

declare global {
  interface Window {
    BMapGL?: any
    __tujiBaiduMapLoaded?: () => void
  }
}

let baiduPromise: Promise<any> | null = null
const baiduRequestQueue = new RateLimitedRetryQueue({
  intervalMs: BAIDU_REQUEST_INTERVAL_MS,
  retryDelayMs: baiduRetryDelay,
})

export function queueBaiduRequest<T>(
  request: (attempt: number) => Promise<T>,
  options?: QueueRunOptions,
) {
  return baiduRequestQueue.run(request, options)
}

export function loadBaiduMap() {
  if (window.BMapGL) return Promise.resolve(window.BMapGL)
  if (baiduPromise) return baiduPromise

  baiduPromise = new Promise((resolve, reject) => {
    const callbackName = '__tujiBaiduMapLoaded'
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => {
      reject(new Error('百度地图加载超时'))
    }, 15000)

    window[callbackName] = () => {
      window.clearTimeout(timeout)
      delete window[callbackName]
      if (window.BMapGL) resolve(window.BMapGL)
      else reject(new Error('百度地图初始化失败'))
    }
    script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${BAIDU_KEY}&callback=${callbackName}`
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timeout)
      delete window[callbackName]
      reject(new Error('百度地图脚本加载失败'))
    }
    document.head.appendChild(script)
  })

  return baiduPromise
}

export function gcj02ToBd09(location: [number, number]): [number, number] {
  const [lng, lat] = location
  const xPi = (Math.PI * 3000) / 180
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * xPi)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * xPi)
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006]
}

export function buildBaiduNavigationUrl(
  from: { name: string; location: [number, number] },
  to: { name: string; location: [number, number] },
) {
  const start = gcj02ToBd09(from.location)
  const end = gcj02ToBd09(to.location)
  const url = new URL('https://api.map.baidu.com/direction')
  url.searchParams.set('origin', `latlng:${start[1]},${start[0]}|name:${from.name}`)
  url.searchParams.set('destination', `latlng:${end[1]},${end[0]}|name:${to.name}`)
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('region', '全国')
  url.searchParams.set('output', 'html')
  url.searchParams.set('src', 'tuji-roadbook')
  return url.toString()
}

export function buildBaiduPlaceUrl(place: {
  name: string
  location: [number, number]
}) {
  const point = gcj02ToBd09(place.location)
  const url = new URL('https://api.map.baidu.com/marker')
  url.searchParams.set('location', `${point[1]},${point[0]}`)
  url.searchParams.set('title', place.name)
  url.searchParams.set('content', place.name)
  url.searchParams.set('output', 'html')
  url.searchParams.set('src', 'tuji-roadbook')
  return url.toString()
}

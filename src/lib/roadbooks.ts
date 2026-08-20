import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
import type { Roadbook, TransportMode, TripDay, TripStop } from '@/types'

const STORAGE_KEY = 'tuji-roadbooks-v1'

export const DAY_COLORS = ['#11a8a5', '#f26b4a', '#e5a21a', '#3978f6', '#64748b']

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createLeg(mode: TransportMode, distanceKm: number, durationMinutes: number) {
  return { mode, distanceKm, durationMinutes }
}

const sampleDays: TripDay[] = [
  {
    id: 'day-hangzhou-1',
    date: '2026-09-18',
    title: '西湖初见',
    stops: [
      {
        id: 'stop-duanqiao',
        name: '断桥残雪',
        address: '杭州市西湖区北山街',
        location: [120.148902, 30.259284],
        type: 'scenic',
        arrivalTime: '09:00',
        departureTime: '10:20',
        stayMinutes: 80,
        cost: 0,
        notes: '沿白堤慢慢走，上午光线更适合拍照。',
      },
      {
        id: 'stop-lingyin',
        name: '灵隐飞来峰',
        address: '杭州市西湖区灵隐路法云弄1号',
        location: [120.101406, 30.240201],
        type: 'scenic',
        arrivalTime: '11:00',
        departureTime: '14:00',
        stayMinutes: 180,
        cost: 75,
        notes: '建议提前预约，寺内保持安静。',
        legFromPrevious: createLeg('driving', 8.6, 28),
      },
      {
        id: 'stop-longjing',
        name: '龙井村',
        address: '杭州市西湖区龙井路',
        location: [120.103657, 30.21104],
        type: 'food',
        arrivalTime: '14:25',
        departureTime: '16:10',
        stayMinutes: 105,
        cost: 128,
        notes: '午餐后沿茶园步道短途散步。',
        legFromPrevious: createLeg('driving', 5.1, 18),
      },
      {
        id: 'stop-hotel',
        name: '湖滨轻居酒店',
        address: '杭州市上城区湖滨商圈',
        location: [120.164782, 30.255433],
        type: 'hotel',
        arrivalTime: '17:00',
        departureTime: '09:00',
        stayMinutes: 960,
        cost: 520,
        notes: '已预订大床房，可寄存行李。',
        legFromPrevious: createLeg('driving', 9.8, 32),
      },
    ],
  },
  {
    id: 'day-hangzhou-2',
    date: '2026-09-19',
    title: '宋韵与烟火',
    stops: [
      {
        id: 'stop-museum',
        name: '中国丝绸博物馆',
        address: '杭州市西湖区玉皇山路73-1号',
        location: [120.155539, 30.224586],
        type: 'scenic',
        arrivalTime: '09:30',
        departureTime: '11:30',
        stayMinutes: 120,
        cost: 0,
        notes: '周一闭馆，需提前预约。',
      },
      {
        id: 'stop-hefang',
        name: '河坊街',
        address: '杭州市上城区河坊街',
        location: [120.173116, 30.240089],
        type: 'food',
        arrivalTime: '12:00',
        departureTime: '14:00',
        stayMinutes: 120,
        cost: 96,
        notes: '午餐和伴手礼采购。',
        legFromPrevious: createLeg('driving', 4.4, 16),
      },
      {
        id: 'stop-xiaoshan',
        name: '钱江新城城市阳台',
        address: '杭州市上城区之江路1078号',
        location: [120.212199, 30.243657],
        type: 'scenic',
        arrivalTime: '17:10',
        departureTime: '19:30',
        stayMinutes: 140,
        cost: 0,
        notes: '日落前抵达，晚间观看灯光秀。',
        legFromPrevious: createLeg('transit', 7.2, 34),
      },
    ],
  },
  {
    id: 'day-hangzhou-3',
    date: '2026-09-20',
    title: '运河慢行',
    stops: [
      {
        id: 'stop-gongchen',
        name: '拱宸桥',
        address: '杭州市拱墅区桥弄街',
        location: [120.141544, 30.31926],
        type: 'scenic',
        arrivalTime: '09:00',
        departureTime: '10:30',
        stayMinutes: 90,
        cost: 0,
        notes: '从桥西历史街区开始步行。',
      },
      {
        id: 'stop-canal',
        name: '京杭大运河博物馆',
        address: '杭州市拱墅区运河文化广场1号',
        location: [120.143131, 30.323197],
        type: 'scenic',
        arrivalTime: '10:40',
        departureTime: '12:00',
        stayMinutes: 80,
        cost: 0,
        notes: '了解运河历史，馆内可盖章。',
        legFromPrevious: createLeg('walking', 0.7, 10),
      },
      {
        id: 'stop-airport',
        name: '杭州东站',
        address: '杭州市上城区全福桥路2号',
        location: [120.212006, 30.290052],
        type: 'transport',
        arrivalTime: '14:20',
        departureTime: '15:18',
        stayMinutes: 58,
        cost: 38,
        notes: '预留安检和取票时间。',
        legFromPrevious: createLeg('transit', 11.8, 42),
      },
    ],
  },
]

export const sampleRoadbook: Roadbook = {
  id: 'roadbook-hangzhou',
  title: '杭州 · 山水与宋韵',
  summary: '三天两晚，从西湖到大运河，在山水之间感受杭州的日常。',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  days: sampleDays,
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
}

export function loadRoadbooks(): Roadbook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return [sampleRoadbook]
    }
    const parsed = JSON.parse(raw) as Roadbook[]
    return Array.isArray(parsed) && parsed.length ? parsed : [sampleRoadbook]
  } catch {
    return [sampleRoadbook]
  }
}

export function saveRoadbooks(roadbooks: Roadbook[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roadbooks))
}

export function createRoadbook(): Roadbook {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const timestamp = now.toISOString()

  return {
    id: createId('roadbook'),
    title: '未命名路书',
    summary: '记录这段旅程的路线、时间与花费。',
    startDate: date,
    endDate: date,
    days: [{ id: createId('day'), date, title: '第 1 天', stops: [] }],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createStop(): TripStop {
  return {
    id: createId('stop'),
    name: '',
    address: '',
    location: [120.1551, 30.2741],
    type: 'scenic',
    arrivalTime: '09:00',
    departureTime: '10:00',
    stayMinutes: 60,
    cost: 0,
    notes: '',
    legFromPrevious: createLeg('driving', 0, 0),
  }
}

export function createDay(index: number, date: string): TripDay {
  return {
    id: createId('day'),
    date,
    title: `第 ${index + 1} 天`,
    stops: [],
  }
}

export function totalDistance(roadbook: Roadbook) {
  return roadbook.days.reduce(
    (total, day) =>
      total +
      day.stops.reduce((subtotal, stop) => subtotal + (stop.legFromPrevious?.distanceKm ?? 0), 0),
    0,
  )
}

export function totalCost(roadbook: Roadbook) {
  return roadbook.days.reduce(
    (total, day) => total + day.stops.reduce((subtotal, stop) => subtotal + stop.cost, 0),
    0,
  )
}

export function reverseDay(day: TripDay): TripDay {
  const reversed = [...day.stops].reverse().map((stop, index) => ({
    ...stop,
    legFromPrevious:
      index === 0
        ? undefined
        : {
            mode: 'driving' as const,
            distanceKm: 0,
            durationMinutes: 0,
          },
  }))
  return { ...day, stops: reversed }
}

export function buildShareUrl(roadbook: Roadbook) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`
  const compact = {
    v: 1,
    t: roadbook.title,
    s: roadbook.summary,
    b: roadbook.startDate,
    e: roadbook.endDate,
    d: roadbook.days.map((day) => ({
      d: day.date,
      t: day.title,
      s: day.stops.map((stop) => [
        stop.name,
        stop.address,
        stop.location[0],
        stop.location[1],
        stop.type,
        stop.arrivalTime,
        stop.departureTime,
        stop.stayMinutes,
        stop.cost,
        stop.notes,
        stop.legFromPrevious?.mode || '',
        stop.legFromPrevious?.distanceKm || 0,
        stop.legFromPrevious?.durationMinutes || 0,
      ]),
    })),
  }
  return `${baseUrl}#share=${compressToEncodedURIComponent(JSON.stringify(compact))}`
}

export function parseSharedRoadbook(): Roadbook | null {
  const match = window.location.hash.match(/^#share=(.+)$/)
  if (!match) return null

  try {
    const decompressed = decompressFromEncodedURIComponent(match[1])
    if (!decompressed) return null
    const compact = JSON.parse(decompressed) as {
      v: number
      t: string
      s: string
      b: string
      e: string
      d: Array<{
        d: string
        t: string
        s: Array<
          [
            string,
            string,
            number,
            number,
            TripStop['type'],
            string,
            string,
            number,
            number,
            string,
            TransportMode | '',
            number,
            number,
          ]
        >
      }>
    }
    if (compact.v !== 1 || !compact.t || !Array.isArray(compact.d) || !compact.d.length) return null
    const now = new Date().toISOString()
    const roadbook: Roadbook = {
      id: createId('shared'),
      title: `${compact.t}（分享）`,
      summary: compact.s,
      startDate: compact.b,
      endDate: compact.e,
      createdAt: now,
      updatedAt: now,
      days: compact.d.map((day) => ({
        id: createId('day'),
        date: day.d,
        title: day.t,
        stops: day.s.map((stop, index) => ({
          id: createId('stop'),
          name: stop[0],
          address: stop[1],
          location: [stop[2], stop[3]],
          type: stop[4],
          arrivalTime: stop[5],
          departureTime: stop[6],
          stayMinutes: stop[7],
          cost: stop[8],
          notes: stop[9],
          legFromPrevious:
            index > 0 && stop[10]
              ? {
                  mode: stop[10],
                  distanceKm: stop[11],
                  durationMinutes: stop[12],
                }
              : undefined,
        })),
      })),
    }
    return {
      ...roadbook,
    }
  } catch {
    return null
  }
}

export function downloadRoadbook(roadbook: Roadbook) {
  const blob = new Blob([JSON.stringify(roadbook, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${roadbook.title.replace(/[\\/:*?"<>|]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importRoadbook(file: File): Promise<Roadbook> {
  const parsed = JSON.parse(await file.text()) as Roadbook
  if (!parsed.title || !Array.isArray(parsed.days) || !parsed.days.length) {
    throw new Error('文件不是有效的路书')
  }
  const now = new Date().toISOString()
  return { ...parsed, id: createId('imported'), createdAt: now, updatedAt: now }
}

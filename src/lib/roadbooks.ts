import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
import { ensurePlaceLibraryEntry, normalizePlaceLibrary } from '@/lib/place-media'
import {
  buildQingganV10Roadbook,
  mergeQingganV10Library,
  QINGGAN_V10_ROADBOOK_ID,
} from '@/lib/qinggan-v10'
import type {
  ExpenseCategory,
  ExpenseItem,
  PlaceType,
  Roadbook,
  RoadType,
  SignalLevel,
  TransportMode,
  TripDay,
  TripLeg,
  TripNote,
  TripStop,
} from '@/types'

const STORAGE_KEY = 'tuji-roadbooks-v2'
const BACKUP_STORAGE_KEY = 'tuji-roadbooks-v2-backup'
const LEGACY_STORAGE_KEY = 'tuji-roadbooks-v1'
const STORAGE_SAVED_AT_KEY = 'tuji-roadbooks-v2-saved-at'

export const DAY_COLORS = [
  '#10a7a2',
  '#ef6548',
  '#e4a11b',
  '#3978f6',
  '#7c5cc4',
  '#1b8a5a',
  '#d34f79',
  '#52717d',
]

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ticket: '门票',
  meal: '餐饮',
  hotel: '住宿',
  transport: '交通',
  fuel: '油费',
  toll: '高速费',
  rental: '租车',
  shopping: '购物',
  other: '其他',
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createExpense(
  label = '费用',
  amount = 0,
  category: ExpenseCategory = 'other',
  payerId?: string,
): ExpenseItem {
  return { id: createId('expense'), label, amount, category, payerId }
}

export function createNote(text = '', imageDataUrl?: string): TripNote {
  return {
    id: createId('note'),
    text,
    imageDataUrl,
    createdAt: new Date().toISOString(),
  }
}

export function createLeg(
  mode: TransportMode,
  distanceKm: number,
  durationMinutes: number,
  options: Partial<TripLeg> = {},
): TripLeg {
  return {
    mode,
    distanceKm,
    durationMinutes,
    roadType: options.roadType || 'unknown',
    signal: options.signal || 'unknown',
    expenses: options.expenses || [],
    notes: options.notes || [],
    roadNames: options.roadNames,
    tollRoads: options.tollRoads,
  }
}

interface StopSeed {
  id: string
  name: string
  address: string
  location: [number, number]
  type: PlaceType
  arrivalTime?: string
  departureTime?: string
  stayMinutes?: number
  expenses?: ExpenseItem[]
  notes?: TripNote[]
  participantIds?: string[]
  leg?: TripLeg
  hidden?: boolean
}

function seedExpense(
  id: string,
  label: string,
  amount: number,
  category: ExpenseCategory,
  payerId?: string,
): ExpenseItem {
  return { id, label, amount, category, payerId }
}

function seedNote(id: string, text: string): TripNote {
  return { id, text, createdAt: '2026-08-20T08:00:00.000Z' }
}

function seedStop(seed: StopSeed): TripStop {
  return {
    id: seed.id,
    name: seed.name,
    address: seed.address,
    location: seed.location,
    type: seed.type,
    arrivalTime: seed.arrivalTime || '09:00',
    departureTime: seed.departureTime || '10:00',
    stayMinutes: seed.stayMinutes ?? 60,
    hidden: seed.hidden || false,
    expenses: seed.expenses || [],
    notes: seed.notes || [],
    participantIds: seed.participantIds || [],
    legFromPrevious: seed.leg,
  }
}

const sampleDays: TripDay[] = [
  {
    id: 'day-hangzhou-1',
    date: '2026-09-18',
    title: '西湖初见',
    stops: [
      seedStop({
        id: 'stop-duanqiao',
        name: '断桥残雪',
        address: '杭州市西湖区北山街',
        location: [120.148902, 30.259284],
        type: 'scenic',
        arrivalTime: '09:00',
        departureTime: '10:20',
        stayMinutes: 80,
        notes: [seedNote('note-duanqiao', '沿白堤慢慢走，上午光线更适合拍照。')],
      }),
      seedStop({
        id: 'stop-lingyin',
        name: '灵隐飞来峰',
        address: '杭州市西湖区灵隐路法云弄1号',
        location: [120.101406, 30.240201],
        type: 'scenic',
        arrivalTime: '11:00',
        departureTime: '14:00',
        stayMinutes: 180,
        expenses: [seedExpense('exp-lingyin-ticket', '景区门票', 75, 'ticket')],
        notes: [seedNote('note-lingyin', '建议提前预约，寺内保持安静。')],
        leg: createLeg('driving', 8.6, 28, {
          roadType: 'mixed',
          signal: 'good',
          expenses: [seedExpense('exp-lingyin-parking', '停车费', 10, 'transport')],
        }),
      }),
      seedStop({
        id: 'stop-longjing',
        name: '龙井村',
        address: '杭州市西湖区龙井路',
        location: [120.103657, 30.21104],
        type: 'food',
        arrivalTime: '14:25',
        departureTime: '16:10',
        stayMinutes: 105,
        expenses: [seedExpense('exp-longjing-meal', '茶园午餐', 128, 'meal')],
        notes: [seedNote('note-longjing', '午餐后沿茶园步道短途散步。')],
        leg: createLeg('driving', 5.1, 18, {
          roadType: 'county',
          signal: 'good',
        }),
      }),
      seedStop({
        id: 'stop-hotel',
        name: '湖滨轻居酒店',
        address: '杭州市上城区湖滨商圈',
        location: [120.164782, 30.255433],
        type: 'hotel',
        arrivalTime: '17:00',
        departureTime: '09:00',
        stayMinutes: 960,
        expenses: [seedExpense('exp-hangzhou-hotel', '大床房', 520, 'hotel')],
        notes: [seedNote('note-hangzhou-hotel', '已预订大床房，可寄存行李。')],
        leg: createLeg('driving', 9.8, 32, {
          roadType: 'mixed',
          signal: 'good',
        }),
      }),
    ],
  },
  {
    id: 'day-hangzhou-2',
    date: '2026-09-19',
    title: '宋韵与烟火',
    stops: [
      seedStop({
        id: 'stop-museum',
        name: '中国丝绸博物馆',
        address: '杭州市西湖区玉皇山路73-1号',
        location: [120.155539, 30.224586],
        type: 'scenic',
        arrivalTime: '09:30',
        departureTime: '11:30',
        stayMinutes: 120,
        notes: [seedNote('note-museum', '周一闭馆，需提前预约。')],
      }),
      seedStop({
        id: 'stop-hefang',
        name: '河坊街',
        address: '杭州市上城区河坊街',
        location: [120.173116, 30.240089],
        type: 'food',
        arrivalTime: '12:00',
        departureTime: '14:00',
        stayMinutes: 120,
        expenses: [
          seedExpense('exp-hefang-meal', '午餐', 68, 'meal'),
          seedExpense('exp-hefang-shopping', '伴手礼', 28, 'shopping'),
        ],
        notes: [seedNote('note-hefang', '午餐和伴手礼采购。')],
        leg: createLeg('driving', 4.4, 16, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'stop-xiaoshan',
        name: '钱江新城城市阳台',
        address: '杭州市上城区之江路1078号',
        location: [120.212199, 30.243657],
        type: 'scenic',
        arrivalTime: '17:10',
        departureTime: '19:30',
        stayMinutes: 140,
        notes: [seedNote('note-city-balcony', '日落前抵达，晚间观看灯光秀。')],
        leg: createLeg('transit', 7.2, 34, {
          signal: 'good',
          expenses: [seedExpense('exp-city-transit', '地铁', 6, 'transport')],
        }),
      }),
    ],
  },
  {
    id: 'day-hangzhou-3',
    date: '2026-09-20',
    title: '运河慢行',
    stops: [
      seedStop({
        id: 'stop-gongchen',
        name: '拱宸桥',
        address: '杭州市拱墅区桥弄街',
        location: [120.141544, 30.31926],
        type: 'scenic',
        arrivalTime: '09:00',
        departureTime: '10:30',
        stayMinutes: 90,
        notes: [seedNote('note-gongchen', '从桥西历史街区开始步行。')],
      }),
      seedStop({
        id: 'stop-canal',
        name: '京杭大运河博物馆',
        address: '杭州市拱墅区运河文化广场1号',
        location: [120.143131, 30.323197],
        type: 'scenic',
        arrivalTime: '10:40',
        departureTime: '12:00',
        stayMinutes: 80,
        notes: [seedNote('note-canal', '了解运河历史，馆内可盖章。')],
        leg: createLeg('walking', 0.7, 10, { signal: 'good' }),
      }),
      seedStop({
        id: 'stop-airport',
        name: '杭州东站',
        address: '杭州市上城区全福桥路2号',
        location: [120.212006, 30.290052],
        type: 'transport',
        arrivalTime: '14:20',
        departureTime: '15:18',
        stayMinutes: 58,
        expenses: [seedExpense('exp-hz-train', '返程车票', 38, 'transport')],
        notes: [seedNote('note-hz-station', '预留安检和取票时间。')],
        leg: createLeg('transit', 11.8, 42, {
          signal: 'good',
          expenses: [seedExpense('exp-hz-metro', '地铁', 5, 'transport')],
        }),
      }),
    ],
  },
]

export const sampleRoadbook: Roadbook = {
  id: 'roadbook-hangzhou',
  title: '杭州 · 山水与宋韵',
  summary: '三天两晚，从西湖到大运河，在山水之间感受杭州的日常。',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  travelers: [
    { id: 'traveler-hangzhou-1', name: '我', color: '#10a7a2' },
    { id: 'traveler-hangzhou-2', name: '同行人', color: '#ef6548' },
  ],
  days: sampleDays,
  placeLibrary: {},
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
}

export const qingganRoadbook: Roadbook = buildQingganV10Roadbook()

function normalizeExpense(raw: any): ExpenseItem {
  return {
    id: raw?.id || createId('expense'),
    label: String(raw?.label || '费用'),
    amount: Number(raw?.amount) || 0,
    category: raw?.category || 'other',
    payerId: raw?.payerId || undefined,
  }
}

function normalizeNote(raw: any): TripNote {
  if (typeof raw === 'string') return createNote(raw)
  return {
    id: raw?.id || createId('note'),
    text: String(raw?.text || ''),
    imageDataUrl: raw?.imageDataUrl || undefined,
    createdAt: raw?.createdAt || new Date().toISOString(),
  }
}

function normalizeLeg(raw: any): TripLeg | undefined {
  if (!raw) return undefined
  return createLeg(
    raw.mode || 'driving',
    Number(raw.distanceKm) || 0,
    Number(raw.durationMinutes) || 0,
    {
      roadType: (raw.roadType || 'unknown') as RoadType,
      signal: (raw.signal || 'unknown') as SignalLevel,
      expenses: Array.isArray(raw.expenses) ? raw.expenses.map(normalizeExpense) : [],
      notes: Array.isArray(raw.notes) ? raw.notes.map(normalizeNote) : [],
      roadNames: Array.isArray(raw.roadNames) ? raw.roadNames : undefined,
      tollRoads: Array.isArray(raw.tollRoads) ? raw.tollRoads : undefined,
    },
  )
}

function normalizeStop(raw: any): TripStop {
  const legacyCost = Number(raw?.cost) || 0
  const expenses = Array.isArray(raw?.expenses)
    ? raw.expenses.map(normalizeExpense)
    : legacyCost > 0
      ? [createExpense('费用', legacyCost, 'other')]
      : []
  const notes = Array.isArray(raw?.notes)
    ? raw.notes.map(normalizeNote)
    : typeof raw?.notes === 'string' && raw.notes
      ? [createNote(raw.notes)]
      : []

  return {
    id: raw?.id || createId('stop'),
    name: String(raw?.name || '未命名地点'),
    address: String(raw?.address || ''),
    location:
      Array.isArray(raw?.location) && raw.location.length === 2
        ? [Number(raw.location[0]), Number(raw.location[1])]
        : [120.1551, 30.2741],
    type: raw?.type || 'other',
    arrivalTime: raw?.arrivalTime || '09:00',
    departureTime: raw?.departureTime || '10:00',
    stayMinutes: Number(raw?.stayMinutes) || 0,
    hidden: Boolean(raw?.hidden),
    expenses,
    notes,
    participantIds: Array.isArray(raw?.participantIds) ? raw.participantIds : [],
    legFromPrevious: normalizeLeg(raw?.legFromPrevious),
  }
}

export function normalizeRoadbook(raw: any): Roadbook {
  const now = new Date().toISOString()
  const days = Array.isArray(raw?.days)
    ? raw.days.map((day: any, index: number) => ({
        id: day?.id || createId('day'),
        date: day?.date || raw?.startDate || new Date().toISOString().slice(0, 10),
        title: day?.title || `第 ${index + 1} 天`,
        stops: Array.isArray(day?.stops) ? day.stops.map(normalizeStop) : [],
      }))
    : []
  const fallbackDate = new Date().toISOString().slice(0, 10)

  return {
    id: raw?.id || createId('roadbook'),
    dataVersion: Number(raw?.dataVersion) || undefined,
    title: String(raw?.title || '未命名路书'),
    summary: String(raw?.summary || ''),
    startDate: raw?.startDate || days[0]?.date || fallbackDate,
    endDate: raw?.endDate || days.at(-1)?.date || fallbackDate,
    travelers: Array.isArray(raw?.travelers)
      ? raw.travelers.map((traveler: any, index: number) => ({
          id: traveler?.id || createId('traveler'),
          name: String(traveler?.name || `成员 ${index + 1}`),
          color: traveler?.color || DAY_COLORS[index % DAY_COLORS.length],
        }))
      : [],
    days: days.length
      ? days
      : [{ id: createId('day'), date: fallbackDate, title: '第 1 天', stops: [] }],
    placeLibrary: normalizePlaceLibrary(raw?.placeLibrary),
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || now,
  }
}

export function migrateRoadbookV6(roadbook: Roadbook): Roadbook {
  if (
    roadbook.id !== QINGGAN_V10_ROADBOOK_ID ||
    (roadbook.dataVersion || 0) >= 10
  ) {
    return roadbook
  }
  const hasRemovedDay = roadbook.days.some(
    (day) =>
      day.id === 'qg-day-10' ||
      day.title.includes('可可西里') ||
      day.title.includes('昆仑山口'),
  )
  const hasRemovedText =
    roadbook.title.includes('12 日') ||
    roadbook.summary.includes('可可西里') ||
    Object.keys(roadbook.placeLibrary).some(
      (key) => key.includes('可可西里') || key.includes('昆仑山口'),
    )
  if (!hasRemovedDay && !hasRemovedText) return roadbook

  const days = roadbook.days
    .filter(
      (day) =>
        day.id !== 'qg-day-10' &&
        !day.title.includes('可可西里') &&
        !day.title.includes('昆仑山口'),
    )
    .map((day) => ({
      ...day,
      date:
        day.id === 'qg-day-11'
          ? '2026-10-04'
          : day.id === 'qg-day-12'
            ? '2026-10-05'
            : day.date,
      stops: day.stops.map((stop) => ({
        ...stop,
        notes: stop.notes.filter(
          (note) => !note.text.includes('可可西里') && !note.text.includes('昆仑山口'),
        ),
      })),
    }))
  const placeLibrary = Object.fromEntries(
    Object.entries(roadbook.placeLibrary).filter(
      ([key, entry]) =>
        !key.includes('可可西里') &&
        !key.includes('昆仑山口') &&
        !entry.name.includes('可可西里') &&
        !entry.name.includes('昆仑山口'),
    ),
  )

  return {
    ...roadbook,
    title: roadbook.title.replace(/反向\s*12\s*日/, '反向 11 日'),
    summary: roadbook.summary
      .replace(/[，,]?含可可西里[^。]*[。.]?/, '。')
      .replace(/可可西里[^，。]*[，。]?/g, ''),
    endDate: '2026-10-05',
    days,
    placeLibrary,
    updatedAt: new Date().toISOString(),
  }
}

export function migrateRoadbookV10(roadbook: Roadbook): Roadbook {
  if (
    roadbook.id !== QINGGAN_V10_ROADBOOK_ID ||
    (roadbook.dataVersion || 0) >= 10
  ) {
    return roadbook
  }
  const next = buildQingganV10Roadbook()
  return {
    ...next,
    placeLibrary: mergeQingganV10Library(next.placeLibrary, roadbook.placeLibrary),
    createdAt: roadbook.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

export function migrateRoadbookV11(roadbook: Roadbook): Roadbook {
  if (
    roadbook.id !== QINGGAN_V10_ROADBOOK_ID ||
    (roadbook.dataVersion || 0) >= 11
  ) {
    return roadbook
  }
  const next = buildQingganV10Roadbook()
  return {
    ...next,
    placeLibrary: mergeQingganV10Library(next.placeLibrary, roadbook.placeLibrary),
    createdAt: roadbook.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

export function hydratePlaceLibrary(roadbook: Roadbook): Roadbook {
  const placeLibrary = roadbook.days
    .flatMap((day) => day.stops)
    .reduce(
      (library, stop) => ensurePlaceLibraryEntry(library, stop),
      roadbook.placeLibrary,
    )
  return { ...roadbook, placeLibrary }
}

export function loadRoadbooks(): Roadbook[] {
  let candidates: Array<string | null>
  try {
    candidates = [
      localStorage.getItem(STORAGE_KEY),
      localStorage.getItem(BACKUP_STORAGE_KEY),
      localStorage.getItem(LEGACY_STORAGE_KEY),
    ]
  } catch {
    return [qingganRoadbook, sampleRoadbook]
  }

  for (const raw of candidates) {
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.length) continue
      const normalized = parsed.map((roadbook) =>
        hydratePlaceLibrary(
          migrateRoadbookV11(
            migrateRoadbookV10(migrateRoadbookV6(normalizeRoadbook(roadbook))),
          ),
        ),
      )
      if (!normalized.some((roadbook) => roadbook.id === qingganRoadbook.id)) {
        normalized.unshift(qingganRoadbook)
      }

      if (raw !== candidates[0]) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
        } catch {
          // The recovered in-memory data is still usable when storage is unavailable.
        }
      }
      return normalized
    } catch {
      continue
    }
  }

  return [hydratePlaceLibrary(qingganRoadbook), hydratePlaceLibrary(sampleRoadbook)]
}

export function hasStoredRoadbooks() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return false
  }
}

export function storedRoadbooksSavedAt() {
  try {
    const explicit = localStorage.getItem(STORAGE_SAVED_AT_KEY)
    if (explicit) return explicit
    return loadRoadbooks()
      .map((roadbook) => roadbook.updatedAt)
      .sort()
      .at(-1) || ''
  } catch {
    return ''
  }
}

export function saveRoadbooks(roadbooks: Roadbook[]) {
  const next = JSON.stringify(roadbooks)
  const current = localStorage.getItem(STORAGE_KEY)

  if (current && current !== next) {
    try {
      const parsed = JSON.parse(current)
      if (Array.isArray(parsed) && parsed.length) {
        localStorage.setItem(BACKUP_STORAGE_KEY, current)
      }
    } catch {
      // Keep the last valid backup when the current value is already damaged.
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, next)
    localStorage.setItem(STORAGE_SAVED_AT_KEY, new Date().toISOString())
  } catch {
    // A backup can consume the remaining localStorage quota. Current data wins.
    try {
      localStorage.removeItem(BACKUP_STORAGE_KEY)
    } catch {
      // Retry the primary write even if backup cleanup is unavailable.
    }
    localStorage.setItem(STORAGE_KEY, next)
    localStorage.setItem(STORAGE_SAVED_AT_KEY, new Date().toISOString())
  }
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
    travelers: [{ id: createId('traveler'), name: '我', color: DAY_COLORS[0] }],
    days: [{ id: createId('day'), date, title: '第 1 天', stops: [] }],
    placeLibrary: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createStop(participantIds: string[] = []): TripStop {
  return {
    id: createId('stop'),
    name: '',
    address: '',
    location: [120.1551, 30.2741],
    type: 'scenic',
    arrivalTime: '09:00',
    departureTime: '10:00',
    stayMinutes: 60,
    hidden: false,
    expenses: [],
    notes: [],
    participantIds,
    legFromPrevious: createLeg('driving', 0, 0),
  }
}

export function createDay(index: number, date: string): TripDay {
  return { id: createId('day'), date, title: `第 ${index + 1} 天`, stops: [] }
}

export function stopCost(stop: TripStop) {
  return stop.expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

export function legCost(leg?: TripLeg) {
  return leg?.expenses.reduce((sum, expense) => sum + expense.amount, 0) || 0
}

export function visibleStops(day: TripDay) {
  return day.stops.filter((stop) => !stop.hidden)
}

export function totalDistance(roadbook: Roadbook) {
  return roadbook.days.reduce((total, day) => {
    const stops = visibleStops(day)
    return (
      total +
      stops.reduce(
        (subtotal, stop, index) =>
          subtotal + (index > 0 ? stop.legFromPrevious?.distanceKm || 0 : 0),
        0,
      )
    )
  }, 0)
}

export function totalDrivingDistance(roadbook: Roadbook) {
  return roadbook.days.reduce((total, day) => {
    const stops = visibleStops(day)
    return (
      total +
      stops.reduce(
        (subtotal, stop, index) =>
          subtotal +
          (index > 0 && stop.legFromPrevious?.mode === 'driving'
            ? stop.legFromPrevious.distanceKm
            : 0),
        0,
      )
    )
  }, 0)
}

export function totalDuration(roadbook: Roadbook) {
  return roadbook.days.reduce((total, day) => {
    const stops = visibleStops(day)
    return (
      total +
      stops.reduce(
        (subtotal, stop, index) =>
          subtotal + stop.stayMinutes + (index > 0 ? stop.legFromPrevious?.durationMinutes || 0 : 0),
        0,
      )
    )
  }, 0)
}

export function totalCost(roadbook: Roadbook) {
  return roadbook.days.reduce((total, day) => {
    const stops = visibleStops(day)
    return (
      total +
      stops.reduce(
        (subtotal, stop, index) =>
          subtotal + stopCost(stop) + (index > 0 ? legCost(stop.legFromPrevious) : 0),
        0,
      )
    )
  }, 0)
}

export function expensesByCategory(roadbook: Roadbook) {
  const totals = new Map<ExpenseCategory, number>()
  roadbook.days.forEach((day) => {
    visibleStops(day).forEach((stop, index) => {
      const expenses = [
        ...stop.expenses,
        ...(index > 0 ? stop.legFromPrevious?.expenses || [] : []),
      ]
      expenses.forEach((expense) => {
        totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount)
      })
    })
  })
  return [...totals.entries()].map(([category, value]) => ({
    category,
    name: EXPENSE_CATEGORY_LABELS[category],
    value,
  }))
}

export function addDays(dateValue: string, amount: number) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function recalculateDayDates(days: TripDay[], startDate: string) {
  return days.map((day, index) => ({ ...day, date: addDays(startDate, index) }))
}

export function reverseDay(day: TripDay): TripDay {
  const reversed = [...day.stops].reverse().map((stop, index) => ({
    ...stop,
    legFromPrevious:
      index === 0
        ? undefined
        : createLeg('driving', 0, 0, {
            roadType: 'unknown',
            signal: 'unknown',
          }),
  }))
  return { ...day, stops: reversed }
}

export function serializeRoadbookForShare(roadbook: Roadbook) {
  return {
    ...roadbook,
    placeLibrary: Object.fromEntries(
      Object.entries(roadbook.placeLibrary).map(([key, entry]) => [
        key,
        {
          ...entry,
          photos: entry.photos.filter((photo) => photo.source !== 'upload'),
          notes: entry.notes.map(({ imageDataUrl: _image, ...note }) => note),
        },
      ]),
    ),
    days: roadbook.days.map((day) => ({
      ...day,
      stops: day.stops.map((stop) => ({
        ...stop,
        notes: stop.notes.map(({ imageDataUrl: _image, ...note }) => note),
        legFromPrevious: stop.legFromPrevious
          ? {
              ...stop.legFromPrevious,
              notes: stop.legFromPrevious.notes.map(({ imageDataUrl: _image, ...note }) => note),
            }
          : undefined,
      })),
    })),
  }
}

export function buildShareUrl(roadbook: Roadbook) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`
  return `${baseUrl}#share=${compressToEncodedURIComponent(
    JSON.stringify(serializeRoadbookForShare(roadbook)),
  )}`
}

export function parseSharedRoadbook(): Roadbook | null {
  const match = window.location.hash.match(/^#share=(.+)$/)
  if (!match) return null
  try {
    const decompressed = decompressFromEncodedURIComponent(match[1])
    if (!decompressed) return null
    const roadbook = normalizeRoadbook(JSON.parse(decompressed))
    const now = new Date().toISOString()
    return {
      ...roadbook,
      id: createId('shared'),
      title: `${roadbook.title}（分享）`,
      createdAt: now,
      updatedAt: now,
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
  const parsed = JSON.parse(await file.text())
  if (!parsed?.title || !Array.isArray(parsed?.days) || !parsed.days.length) {
    throw new Error('文件不是有效的路书')
  }
  const now = new Date().toISOString()
  return {
    ...normalizeRoadbook(parsed),
    id: createId('imported'),
    createdAt: now,
    updatedAt: now,
  }
}

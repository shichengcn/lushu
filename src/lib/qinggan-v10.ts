import knowledgeData from '@/data/qinggan-v10.json'
import routeLocationsData from '@/data/qinggan-route-locations.json'
import { defaultPlacePhotos, placeLibraryKey } from '@/lib/place-media'
import type {
  ExpenseCategory,
  ExpenseItem,
  KnowledgePlace,
  KnowledgeReference,
  PlaceLibraryEntry,
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

const CREATED_AT = '2026-08-22T00:00:00.000Z'
const TRAVELER_IDS = [
  'traveler-shicheng',
  'traveler-shijingjing',
  'traveler-companion-a',
  'traveler-companion-b',
]

interface RawKnowledgePlace {
  id: string
  name: string
  aliases: string
  region: string
  category: string
  is_niche: number
  ticket_cny: string
  shuttle_cny: string
  altitude_m: string
  visit_hours: string
  best_time: string
  road_requirement: string
  signal: string
  rating: string
  recommendation: string
  suggested_day: string
  detour_note: string
  summary: string
  travelogue: string
  photo_tips: string
  open_time: string
  ref_url: string
  images: Array<{ caption: string; url: string }>
  references: KnowledgeReference[]
  address: string
  location: number[]
}

interface RawItineraryDay {
  day: number
  date: string
  theme: string
  distance_km: number
  drive_hours: number
  play_hours: number
  tickets: string
  meals: string
  fuel_stop: string
  signal_risk: string
  notes: string[]
  key_notes: string[]
  hotel: {
    name: string
    city: string
    price_cny: number | null
    alternative: string
  }
}

interface RouteLocation {
  location: [number, number]
  address: string
}

interface RouteStopSeed {
  id: string
  name: string
  locationKey?: string
  location?: [number, number]
  type: PlaceType
  arrivalTime: string
  departureTime: string
  stayMinutes: number
  distanceKm?: number
  durationMinutes?: number
  mode?: TransportMode
  road?: string
  knowledgeName?: string
  chargeHotel?: boolean
  expenses?: Array<{
    label: string
    amount: number
    category: ExpenseCategory
  }>
}

const rawKnowledge = knowledgeData as unknown as {
  meta: {
    title: string
    direction: string
    last_verified: string
    disclaimer: string
  }
  itinerary: RawItineraryDay[]
  pois: RawKnowledgePlace[]
}

const routeLocations = routeLocationsData as unknown as Record<string, RouteLocation>

export const QINGGAN_V10_ROADBOOK_ID = 'roadbook-qinggan-reverse'

export const qingganKnowledgePlaces: KnowledgePlace[] = rawKnowledge.pois.map((place) => ({
  id: place.id,
  name: place.name,
  aliases: place.aliases,
  region: place.region,
  category: place.category,
  isNiche: Boolean(place.is_niche),
  ticketCny: place.ticket_cny,
  shuttleCny: place.shuttle_cny,
  altitudeM: place.altitude_m,
  visitHours: place.visit_hours,
  bestTime: place.best_time,
  roadRequirement: place.road_requirement,
  signal: place.signal,
  rating: place.rating,
  recommendation: place.recommendation,
  suggestedDay: place.suggested_day,
  detourNote: place.detour_note,
  summary: place.summary,
  travelogue: place.travelogue,
  photoTips: place.photo_tips,
  openTime: place.open_time,
  refUrl: place.ref_url,
  images: place.images,
  references: place.references,
  address: place.address,
  location: [Number(place.location[0]), Number(place.location[1])],
}))

const knowledgeByName = new Map(qingganKnowledgePlaces.map((place) => [place.name, place]))

function note(id: string, text: string): TripNote {
  return { id, text, createdAt: CREATED_AT }
}

function expense(
  id: string,
  label: string,
  amount: number,
  category: ExpenseCategory,
): ExpenseItem {
  return { id, label, amount, category }
}

function parseFirstPrice(value: string) {
  const match = value.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function roadType(road = ''): RoadType {
  if (/G30|G3011|高速/.test(road)) return 'highway'
  if (/G109|G213|G215|G227|G315|国道/.test(road)) return 'national'
  if (/S\\d+|省道/.test(road)) return 'provincial'
  if (/县道|支线|景区道路/.test(road)) return 'county'
  return 'mixed'
}

function signalLevel(value: string): SignalLevel {
  if (/完全无|无信号|无服务/.test(value)) return 'none'
  if (/弱|间断|较差|差/.test(value)) return 'weak'
  if (/满格|良好|有信号/.test(value)) return 'good'
  return 'unknown'
}

function knowledgeNotes(place: KnowledgePlace): TripNote[] {
  return [
    place.summary ? note(`${place.id}-summary`, place.summary) : null,
    place.recommendation
      ? note(`${place.id}-recommendation`, `规划建议：${place.recommendation}`)
      : null,
    place.ticketCny || place.shuttleCny
      ? note(
          `${place.id}-price`,
          `参考价格：门票 ${place.ticketCny || '未覆盖'} 元；交通 ${place.shuttleCny || '无'} 元。出行前复核。`,
        )
      : null,
    place.bestTime ? note(`${place.id}-best-time`, `最佳拍摄时间：${place.bestTime}`) : null,
    place.photoTips ? note(`${place.id}-photo-tips`, `拍摄建议：${place.photoTips}`) : null,
    place.travelogue ? note(`${place.id}-travelogue`, `游记评价：${place.travelogue}`) : null,
    place.roadRequirement
      ? note(`${place.id}-road`, `道路与车型：${place.roadRequirement}`)
      : null,
    place.signal ? note(`${place.id}-signal`, `通信：${place.signal}`) : null,
    place.openTime ? note(`${place.id}-open`, `开放时间：${place.openTime}`) : null,
    place.detourNote ? note(`${place.id}-detour`, `绕行成本：${place.detourNote}`) : null,
  ].filter((item): item is TripNote => Boolean(item))
}

export function knowledgePlaceToStop(
  place: KnowledgePlace,
  participantIds = TRAVELER_IDS,
): TripStop {
  return {
    id: `knowledge-${place.id}`,
    name: place.name,
    address: place.address,
    location: place.location,
    type: 'scenic',
    arrivalTime: '09:00',
    departureTime: '10:00',
    stayMinutes: 60,
    hidden: false,
    expenses: [],
    notes: [note(`${place.id}-planning`, `规划候选：${place.recommendation}`)],
    participantIds,
  }
}

export function knowledgePlacesForRoadbook(roadbook: Roadbook) {
  return roadbook.id === QINGGAN_V10_ROADBOOK_ID ? qingganKnowledgePlaces : []
}

function matchKeys(place: KnowledgePlace) {
  return [place.name, ...place.aliases.split(/[、，。/]/)]
    .map((name) => placeLibraryKey({ name }))
    .filter((key) => key.length >= 3)
}

export function isKnowledgePlaceSelected(place: KnowledgePlace, roadbook: Roadbook) {
  const stopKeys = roadbook.days.flatMap((day) =>
    day.stops.filter((stop) => !stop.hidden).map((stop) => placeLibraryKey(stop)),
  )
  return matchKeys(place).some((key) =>
    stopKeys.some((stopKey) => stopKey === key || stopKey.includes(key) || key.includes(stopKey)),
  )
}

export function knowledgePlaceForStop(stop: TripStop) {
  const stopKey = placeLibraryKey(stop)
  return qingganKnowledgePlaces.find((place) =>
    matchKeys(place).some(
      (key) => stopKey === key || stopKey.includes(key) || key.includes(stopKey),
    ),
  )
}

export function knowledgePlacesForScope(
  roadbook: Roadbook,
  scopeDayIndex?: number,
) {
  const places = knowledgePlacesForRoadbook(roadbook)
  if (scopeDayIndex === undefined) return places
  const dayToken = `D${scopeDayIndex + 1}`
  const dayPattern = new RegExp(`(?:^|[^A-Z0-9])${dayToken}(?!\\d)`)
  return places.filter((place) => dayPattern.test(place.suggestedDay))
}

function placeExpenses(place?: KnowledgePlace) {
  if (!place) return []
  const ticket = parseFirstPrice(place.ticketCny)
  const shuttle = parseFirstPrice(place.shuttleCny)
  return [
    ticket > 0
      ? expense(`${place.id}-ticket`, `${place.name}门票（4 人参考）`, ticket * 4, 'ticket')
      : null,
    shuttle > 0
      ? expense(`${place.id}-shuttle`, `${place.name}景交（4 人参考）`, shuttle * 4, 'transport')
      : null,
  ].filter((item): item is ExpenseItem => Boolean(item))
}

function leg(
  seed: RouteStopSeed,
  day: RawItineraryDay,
  index: number,
): TripLeg | undefined {
  if (index === 0) return undefined
  const mode = seed.mode || 'driving'
  return {
    mode,
    distanceKm: seed.distanceKm || 0,
    durationMinutes: seed.durationMinutes || 0,
    roadType: roadType(seed.road),
    signal: signalLevel(day.signal_risk),
    expenses: [],
    notes:
      index === 1 && mode === 'driving'
        ? [
            note(`v10-d${day.day}-fuel`, `补能：${day.fuel_stop}`),
            note(`v10-d${day.day}-signal`, `信号：${day.signal_risk}`),
          ]
        : [],
    roadNames: seed.road ? seed.road.split(/\s*→\s*|\s*\/\s*/).filter(Boolean) : undefined,
  }
}

function stop(seed: RouteStopSeed, day: RawItineraryDay, index: number): TripStop {
  const location = seed.location ||
    routeLocations[seed.locationKey || seed.name]?.location
  if (!location) throw new Error(`缺少路线坐标：${seed.name}`)
  const locationEntry = routeLocations[seed.locationKey || seed.name]
  const place = seed.knowledgeName ? knowledgeByName.get(seed.knowledgeName) : undefined
  const notes = [
    ...(place?.bestTime
      ? [note(`v10-d${day.day}-${seed.id}-best-time`, `最佳拍摄时间：${place.bestTime}`)]
      : []),
    ...(index === 0
      ? day.notes.map((text, noteIndex) =>
          note(`v10-d${day.day}-note-${noteIndex + 1}`, text),
        )
      : []),
    ...(seed.chargeHotel && day.hotel.alternative
      ? [note(`v10-d${day.day}-hotel-alt`, `备选住宿：${day.hotel.alternative}`)]
      : []),
  ]
  const expenses = [
    ...placeExpenses(place),
    ...(seed.chargeHotel && day.hotel.price_cny
      ? [
          expense(
            `v10-d${day.day}-hotel`,
            `${day.hotel.name}（2 间参考）`,
            day.hotel.price_cny * 2,
            'hotel',
          ),
        ]
      : []),
    ...(seed.expenses || []).map((item, expenseIndex) =>
      expense(`v10-d${day.day}-${seed.id}-expense-${expenseIndex}`, item.label, item.amount, item.category),
    ),
  ]

  return {
    id: `v10-d${day.day}-${seed.id}`,
    name: seed.name,
    address: locationEntry?.address || place?.address || '',
    location,
    type: seed.type,
    arrivalTime: seed.arrivalTime,
    departureTime: seed.departureTime,
    stayMinutes: seed.stayMinutes,
    hidden: false,
    expenses,
    notes,
    participantIds: TRAVELER_IDS,
    legFromPrevious: leg(seed, day, index),
  }
}

const routeSeeds: RouteStopSeed[][] = [
  [
    { id: 'shanghai-airport', name: '上海虹桥国际机场', location: [121.336319, 31.197875], type: 'transport', arrivalTime: '08:30', departureTime: '10:00', stayMinutes: 90 },
    { id: 'xining-airport', name: '西宁曹家堡国际机场', type: 'transport', arrivalTime: '12:00', departureTime: '13:00', stayMinutes: 60, mode: 'flight', distanceKm: 1900, durationMinutes: 180 },
    { id: 'rental', name: '神州租车西宁曹家堡机场店', type: 'transport', arrivalTime: '13:10', departureTime: '14:00', stayMinutes: 50, distanceKm: 3, durationMinutes: 8, expenses: [{ label: 'SUV 租车预算下限', amount: 3000, category: 'rental' }] },
    { id: 'culture-museum', name: '青海藏文化博物院', type: 'scenic', arrivalTime: '14:40', departureTime: '16:20', stayMinutes: 100, distanceKm: 34, durationMinutes: 45, road: '机场高速', knowledgeName: '青海藏文化博物院' },
    { id: 'shuijingxiang', name: '水井巷', locationKey: '西宁水井巷', type: 'food', arrivalTime: '17:00', departureTime: '18:30', stayMinutes: 90, distanceKm: 9, durationMinutes: 25, knowledgeName: '西宁新千夜市 / 莫家街 / 水井巷' },
    { id: 'hotel', name: '桔子酒店·西宁城东万达广场店', locationKey: '桔子酒店西宁城东万达广场店', type: 'hotel', arrivalTime: '19:00', departureTime: '08:00', stayMinutes: 780, distanceKm: 8, durationMinutes: 25, chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '桔子酒店·西宁城东万达广场店', locationKey: '桔子酒店西宁城东万达广场店', type: 'hotel', arrivalTime: '07:30', departureTime: '08:00', stayMinutes: 30 },
    { id: 'heiquan', name: '黑泉水库', type: 'scenic', arrivalTime: '09:20', departureTime: '09:40', stayMinutes: 20, distanceKm: 70, durationMinutes: 80, road: 'G227', knowledgeName: '黑泉水库' },
    { id: 'daban', name: '达坂山观景台', type: 'scenic', arrivalTime: '10:00', departureTime: '10:30', stayMinutes: 30, distanceKm: 20, durationMinutes: 25, road: 'G227', knowledgeName: '达坂山观景台（大坂山垭口）' },
    { id: 'menyuan', name: '门源县', type: 'food', arrivalTime: '12:00', departureTime: '12:45', stayMinutes: 45, distanceKm: 80, durationMinutes: 85, road: 'G227', knowledgeName: '门源（油菜花海 / 岗什卡雪峰方向）' },
    { id: 'xianmi', name: '仙米国家森林公园·聚阳沟', locationKey: '仙米国家森林公园聚阳沟', type: 'scenic', arrivalTime: '13:30', departureTime: '15:30', stayMinutes: 120, distanceKm: 50, durationMinutes: 45, road: '门仙公路', knowledgeName: '仙米国家森林公园 · 聚阳沟' },
    { id: 'jingyang', name: '景阳岭垭口', type: 'scenic', arrivalTime: '17:00', departureTime: '17:15', stayMinutes: 15, distanceKm: 140, durationMinutes: 100, road: '门仙公路 → S302', knowledgeName: '景阳岭垭口' },
    { id: 'hotel', name: '祁连宾馆', type: 'hotel', arrivalTime: '18:30', departureTime: '08:00', stayMinutes: 810, distanceKm: 60, durationMinutes: 70, road: 'S302', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '祁连宾馆', type: 'hotel', arrivalTime: '07:30', departureTime: '08:00', stayMinutes: 30 },
    { id: 'zhuoer', name: '卓尔山风景区', type: 'scenic', arrivalTime: '08:20', departureTime: '10:20', stayMinutes: 120, distanceKm: 8, durationMinutes: 20, road: '县道', knowledgeName: '卓尔山' },
    { id: 'arou', name: '阿柔大寺', type: 'scenic', arrivalTime: '10:50', departureTime: '11:40', stayMinutes: 50, distanceKm: 24, durationMinutes: 30, road: 'S302', knowledgeName: '阿柔大寺' },
    { id: 'route-9', name: '祁连 9 号公路观景点', locationKey: '祁连9号公路', type: 'scenic', arrivalTime: '13:00', departureTime: '13:20', stayMinutes: 20, distanceKm: 86, durationMinutes: 90, road: 'G213 祁连 9 号公路', knowledgeName: '祁连 9 号公路（G213 祁连段）' },
    { id: 'erga', name: '二尕公路观景点', locationKey: '二尕公路', type: 'scenic', arrivalTime: '14:00', departureTime: '14:40', stayMinutes: 40, distanceKm: 12, durationMinutes: 20, road: '二尕公路', knowledgeName: '二尕公路（二尕线）' },
    { id: 'heihe', name: '黑河大峡谷观景点', locationKey: '祁连黑河大峡谷', type: 'scenic', arrivalTime: '15:30', departureTime: '16:00', stayMinutes: 30, distanceKm: 48, durationMinutes: 55, road: 'G213', knowledgeName: '黑河大峡谷' },
    { id: 'sunan', name: '肃南县', type: 'other', arrivalTime: '17:00', departureTime: '17:20', stayMinutes: 20, distanceKm: 120, durationMinutes: 110, road: 'G213', knowledgeName: '肃南（裕固族自治县）' },
    { id: 'hotel', name: '星程酒店·张掖西站区政府店', locationKey: '星程酒店张掖西站区政府店', type: 'hotel', arrivalTime: '19:00', departureTime: '07:00', stayMinutes: 720, distanceKm: 70, durationMinutes: 80, road: 'G213', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '星程酒店·张掖西站区政府店', locationKey: '星程酒店张掖西站区政府店', type: 'hotel', arrivalTime: '06:40', departureTime: '07:00', stayMinutes: 20 },
    { id: 'danxia', name: '张掖七彩丹霞', locationKey: '张掖七彩丹霞景区西入口', type: 'scenic', arrivalTime: '07:40', departureTime: '10:30', stayMinutes: 170, distanceKm: 40, durationMinutes: 40, road: '丹霞景区道路', knowledgeName: '张掖七彩丹霞' },
    { id: 'jiayuguan', name: '嘉峪关市', type: 'food', arrivalTime: '14:00', departureTime: '14:45', stayMinutes: 45, distanceKm: 210, durationMinutes: 180, road: 'G30 连霍高速' },
    { id: 'earth-son', name: '瓜州大地之子', type: 'scenic', arrivalTime: '16:40', departureTime: '17:20', stayMinutes: 40, distanceKm: 190, durationMinutes: 120, road: 'G30 连霍高速', knowledgeName: '瓜州大地之子 / 无界雕塑群' },
    { id: 'guazhou-service', name: '瓜州服务区', type: 'fuel', arrivalTime: '17:30', departureTime: '17:45', stayMinutes: 15, distanceKm: 15, durationMinutes: 15, road: 'G30 连霍高速' },
    { id: 'hotel', name: '汉庭酒店·敦煌沙洲夜市敦湖花园店', locationKey: '汉庭酒店敦煌沙洲夜市敦湖花园店', type: 'hotel', arrivalTime: '20:00', departureTime: '08:00', stayMinutes: 720, distanceKm: 125, durationMinutes: 135, road: 'G30 → G3011', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '汉庭酒店·敦煌沙洲夜市敦湖花园店', locationKey: '汉庭酒店敦煌沙洲夜市敦湖花园店', type: 'hotel', arrivalTime: '07:30', departureTime: '08:00', stayMinutes: 30 },
    { id: 'mogao', name: '莫高窟', locationKey: '莫高窟景区', type: 'scenic', arrivalTime: '09:00', departureTime: '12:30', stayMinutes: 210, distanceKm: 25, durationMinutes: 35, road: '市区道路', knowledgeName: '莫高窟' },
    { id: 'mingsha', name: '鸣沙山·月牙泉', locationKey: '鸣沙山月牙泉', type: 'scenic', arrivalTime: '16:30', departureTime: '19:30', stayMinutes: 180, distanceKm: 15, durationMinutes: 25, road: '市区道路', knowledgeName: '鸣沙山 · 月牙泉' },
    { id: 'night-market', name: '沙洲夜市', locationKey: '敦煌沙洲夜市', type: 'food', arrivalTime: '20:00', departureTime: '21:30', stayMinutes: 90, distanceKm: 5, durationMinutes: 15, knowledgeName: '沙洲夜市' },
    { id: 'hotel', name: '汉庭酒店·敦煌沙洲夜市敦湖花园店', locationKey: '汉庭酒店敦煌沙洲夜市敦湖花园店', type: 'hotel', arrivalTime: '21:45', departureTime: '08:00', stayMinutes: 615, distanceKm: 3, durationMinutes: 10, chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '汉庭酒店·敦煌沙洲夜市敦湖花园店', locationKey: '汉庭酒店敦煌沙洲夜市敦湖花园店', type: 'hotel', arrivalTime: '07:30', departureTime: '08:00', stayMinutes: 30 },
    { id: 'sugan', name: '苏干湖', locationKey: '大苏干湖', type: 'scenic', arrivalTime: '11:00', departureTime: '11:30', stayMinutes: 30, distanceKm: 170, durationMinutes: 180, road: 'G215', knowledgeName: '苏干湖（大苏干湖）' },
    { id: 'akesai', name: '阿克塞石油小镇', locationKey: '阿克塞博罗转井影视基地', type: 'scenic', arrivalTime: '12:30', departureTime: '13:30', stayMinutes: 60, distanceKm: 45, durationMinutes: 50, road: 'G215', knowledgeName: '阿克塞石油小镇（博罗转井影视基地）' },
    { id: 'dangjin', name: '当金山口', type: 'scenic', arrivalTime: '14:20', departureTime: '14:40', stayMinutes: 20, distanceKm: 55, durationMinutes: 50, road: 'G215', knowledgeName: '当金山垭口' },
    { id: 'heidushan', name: '黑独山', locationKey: '青海黑独山', type: 'scenic', arrivalTime: '16:00', departureTime: '17:00', stayMinutes: 60, distanceKm: 130, durationMinutes: 105, road: 'G215 → S305', knowledgeName: '黑独山' },
    { id: 'hotel', name: '桔子酒店·大柴旦翡翠湖步行街店', locationKey: '桔子酒店大柴旦翡翠湖步行街店', type: 'hotel', arrivalTime: '19:00', departureTime: '07:30', stayMinutes: 750, distanceKm: 100, durationMinutes: 120, road: 'S305 → G215', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '桔子酒店·大柴旦翡翠湖步行街店', locationKey: '桔子酒店大柴旦翡翠湖步行街店', type: 'hotel', arrivalTime: '07:00', departureTime: '07:30', stayMinutes: 30 },
    { id: 'jade-lake', name: '大柴旦翡翠湖', type: 'scenic', arrivalTime: '08:00', departureTime: '09:30', stayMinutes: 90, distanceKm: 15, durationMinutes: 20, road: '景区道路', knowledgeName: '大柴旦翡翠湖' },
    { id: 'water-yadan', name: '乌素特水上雅丹', type: 'scenic', arrivalTime: '11:30', departureTime: '13:30', stayMinutes: 120, distanceKm: 145, durationMinutes: 125, road: 'G315', knowledgeName: '乌素特水上雅丹' },
    { id: 'east-tai', name: '东台吉乃尔湖', type: 'scenic', arrivalTime: '14:10', departureTime: '14:50', stayMinutes: 40, distanceKm: 45, durationMinutes: 45, road: 'G315', knowledgeName: '东台吉乃尔湖' },
    { id: 'u-road', name: 'G315 U 型公路', locationKey: 'G315 U型公路', type: 'scenic', arrivalTime: '16:20', departureTime: '16:40', stayMinutes: 20, distanceKm: 100, durationMinutes: 90, road: 'G315', knowledgeName: 'G315 U 型公路（网红公路）' },
    { id: 'hotel', name: '宜必思酒店·格尔木八一路昆仑广场店', locationKey: '宜必思酒店格尔木八一路昆仑广场店', type: 'hotel', arrivalTime: '19:30', departureTime: '08:00', stayMinutes: 750, distanceKm: 195, durationMinutes: 180, road: 'G315', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '宜必思酒店·格尔木八一路昆仑广场店', locationKey: '宜必思酒店格尔木八一路昆仑广场店', type: 'hotel', arrivalTime: '08:00', departureTime: '08:30', stayMinutes: 30 },
    { id: 'dragon-palace', name: '无极龙凤宫', type: 'scenic', arrivalTime: '09:15', departureTime: '09:35', stayMinutes: 20, distanceKm: 35, durationMinutes: 45, road: 'G109', knowledgeName: '昆仑山深度段：无极龙凤宫 / 不冻泉 / 昆仑山口 / 玉珠峰 / 西王母瑶池' },
    { id: 'budongquan', name: '不冻泉', locationKey: '格尔木不冻泉', type: 'scenic', arrivalTime: '10:40', departureTime: '11:00', stayMinutes: 20, distanceKm: 100, durationMinutes: 70, road: 'G109' },
    { id: 'kunlun-pass', name: '昆仑山口', type: 'scenic', arrivalTime: '11:30', departureTime: '12:00', stayMinutes: 30, distanceKm: 15, durationMinutes: 25, road: 'G109', knowledgeName: '昆仑山深度段：无极龙凤宫 / 不冻泉 / 昆仑山口 / 玉珠峰 / 西王母瑶池' },
    { id: 'yuzhu', name: '玉珠峰观景点', location: [94.235, 35.668], type: 'scenic', arrivalTime: '12:15', departureTime: '12:35', stayMinutes: 20, distanceKm: 15, durationMinutes: 20, road: 'G109' },
    { id: 'yaochi', name: '西王母瑶池', type: 'scenic', arrivalTime: '13:30', departureTime: '14:30', stayMinutes: 60, distanceKm: 45, durationMinutes: 55, road: 'G109 → 瑶池支线', knowledgeName: '昆仑山深度段：无极龙凤宫 / 不冻泉 / 昆仑山口 / 玉珠峰 / 西王母瑶池' },
    { id: 'hotel', name: '宜必思酒店·格尔木八一路昆仑广场店', locationKey: '宜必思酒店格尔木八一路昆仑广场店', type: 'hotel', arrivalTime: '18:00', departureTime: '08:00', stayMinutes: 840, distanceKm: 190, durationMinutes: 210, road: 'G109', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '宜必思酒店·格尔木八一路昆仑广场店', locationKey: '宜必思酒店格尔木八一路昆仑广场店', type: 'hotel', arrivalTime: '07:30', departureTime: '08:00', stayMinutes: 30 },
    { id: 'qarhan', name: '察尔汗盐湖', type: 'scenic', arrivalTime: '09:30', departureTime: '12:00', stayMinutes: 150, distanceKm: 60, durationMinutes: 70, road: 'G3011 → 景区道路', knowledgeName: '察尔汗盐湖' },
    { id: 'keluke', name: '可鲁克湖·托素湖', locationKey: '可鲁克湖旅游景区', type: 'scenic', arrivalTime: '15:00', departureTime: '16:20', stayMinutes: 80, distanceKm: 190, durationMinutes: 170, road: 'G315', knowledgeName: '可鲁克湖 · 托素湖' },
    { id: 'haizi', name: '海子诗歌陈列馆', type: 'scenic', arrivalTime: '16:45', departureTime: '17:20', stayMinutes: 35, distanceKm: 15, durationMinutes: 25, knowledgeName: '德令哈（海子诗歌陈列馆 / 巴音河）' },
    { id: 'hotel', name: '全季酒店·德令哈巴音河畔店', locationKey: '全季酒店德令哈巴音河畔店', type: 'hotel', arrivalTime: '17:40', departureTime: '07:00', stayMinutes: 800, distanceKm: 5, durationMinutes: 15, chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '全季酒店·德令哈巴音河畔店', locationKey: '全季酒店德令哈巴音河畔店', type: 'hotel', arrivalTime: '06:40', departureTime: '07:00', stayMinutes: 20 },
    { id: 'chaka', name: '茶卡盐湖', type: 'scenic', arrivalTime: '10:30', departureTime: '12:30', stayMinutes: 120, distanceKm: 200, durationMinutes: 200, road: 'G315', knowledgeName: '茶卡盐湖' },
    { id: 'heimahe', name: '黑马河镇', locationKey: '青海湖黑马河镇', type: 'food', arrivalTime: '14:00', departureTime: '14:40', stayMinutes: 40, distanceKm: 90, durationMinutes: 90, road: 'G315 → G109' },
    { id: 'donggeer', name: '青海湖东格尔观景台', type: 'scenic', arrivalTime: '15:20', departureTime: '15:45', stayMinutes: 25, distanceKm: 35, durationMinutes: 40, road: '环湖西路', knowledgeName: '青海湖（二郎剑 / 仙女湾 / 环湖西路 / 尕海 / 黑马河日出 / 东格尔观景台 / 尕日拉寺）' },
    { id: 'west-road', name: '青海湖环湖西路观景点', locationKey: '青海湖环湖西路', type: 'scenic', arrivalTime: '16:00', departureTime: '16:35', stayMinutes: 35, distanceKm: 35, durationMinutes: 35, road: '环湖西路', knowledgeName: '青海湖（二郎剑 / 仙女湾 / 环湖西路 / 尕海 / 黑马河日出 / 东格尔观景台 / 尕日拉寺）' },
    { id: 'dangeer', name: '湟源丹噶尔古城', locationKey: '丹噶尔古城', type: 'scenic', arrivalTime: '18:00', departureTime: '18:45', stayMinutes: 45, distanceKm: 100, durationMinutes: 95, road: 'G109', knowledgeName: '湟源丹噶尔古城' },
    { id: 'hotel', name: '桔子酒店·西宁城东万达广场店', locationKey: '桔子酒店西宁城东万达广场店', type: 'hotel', arrivalTime: '20:00', departureTime: '09:00', stayMinutes: 780, distanceKm: 40, durationMinutes: 55, road: 'G109', chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '桔子酒店·西宁城东万达广场店', locationKey: '桔子酒店西宁城东万达广场店', type: 'hotel', arrivalTime: '08:30', departureTime: '09:00', stayMinutes: 30 },
    { id: 'xining-station', name: '西宁站', type: 'transport', arrivalTime: '09:25', departureTime: '10:00', stayMinutes: 35, mode: 'transit', distanceKm: 8, durationMinutes: 25 },
    { id: 'lanzhou-west', name: '兰州西站', type: 'transport', arrivalTime: '11:30', departureTime: '12:00', stayMinutes: 30, mode: 'train', distanceKm: 216, durationMinutes: 90, expenses: [{ label: '西宁至兰州高铁（4 人）', amount: 240, category: 'transport' }] },
    { id: 'yellow-river-mother', name: '黄河母亲雕塑', type: 'scenic', arrivalTime: '14:00', departureTime: '14:30', stayMinutes: 30, mode: 'transit', distanceKm: 8, durationMinutes: 25 },
    { id: 'zhongshan-bridge', name: '兰州中山桥', type: 'scenic', arrivalTime: '15:00', departureTime: '15:40', stayMinutes: 40, mode: 'walking', distanceKm: 2, durationMinutes: 25 },
    { id: 'baita', name: '白塔山公园', locationKey: '兰州白塔山公园', type: 'scenic', arrivalTime: '15:50', departureTime: '17:20', stayMinutes: 90, mode: 'walking', distanceKm: 1, durationMinutes: 10 },
    { id: 'night-market', name: '正宁路夜市', locationKey: '兰州正宁路夜市', type: 'food', arrivalTime: '18:30', departureTime: '20:00', stayMinutes: 90, mode: 'transit', distanceKm: 3, durationMinutes: 20 },
    { id: 'hotel', name: '全季酒店·兰州南关十字亚欧国际店', locationKey: '全季酒店兰州南关十字亚欧国际店', type: 'hotel', arrivalTime: '20:20', departureTime: '10:00', stayMinutes: 820, mode: 'walking', distanceKm: 1, durationMinutes: 10, chargeHotel: true },
  ],
  [
    { id: 'hotel-start', name: '全季酒店·兰州南关十字亚欧国际店', locationKey: '全季酒店兰州南关十字亚欧国际店', type: 'hotel', arrivalTime: '09:30', departureTime: '10:00', stayMinutes: 30 },
    { id: 'lanzhou-airport', name: '兰州中川国际机场', type: 'transport', arrivalTime: '11:00', departureTime: '14:00', stayMinutes: 180, mode: 'transit', distanceKm: 75, durationMinutes: 60 },
    { id: 'shanghai-airport', name: '上海虹桥国际机场', location: [121.336319, 31.197875], type: 'transport', arrivalTime: '17:00', departureTime: '17:30', stayMinutes: 30, mode: 'flight', distanceKm: 1700, durationMinutes: 180 },
  ],
]

function buildKnowledgeLibrary(): Record<string, PlaceLibraryEntry> {
  return Object.fromEntries(
    qingganKnowledgePlaces.map((place) => {
      const virtualStop = knowledgePlaceToStop(place)
      const key = placeLibraryKey(virtualStop)
      const referencePhotos = place.images.map((image, index) => ({
        id: `${place.id}-reference-${index + 1}`,
        url: image.url,
        caption: image.caption || `${place.name}资料图片 ${index + 1}`,
        source: 'reference' as const,
        createdAt: CREATED_AT,
      }))
      return [
        key,
        {
          key,
          name: place.name,
          address: place.address,
          photos: [...referencePhotos, ...defaultPlacePhotos(virtualStop)],
          notes: knowledgeNotes(place),
          updatedAt: CREATED_AT,
        },
      ]
    }),
  )
}

function buildDays(): TripDay[] {
  return rawKnowledge.itinerary.map((day, dayIndex) => ({
    id: `qg-v10-day-${day.day}`,
    date: day.date,
    title: day.theme,
    stops: routeSeeds[dayIndex].map((seed, stopIndex) => stop(seed, day, stopIndex)),
  }))
}

export function buildQingganV10Roadbook(): Roadbook {
  return {
    id: QINGGAN_V10_ROADBOOK_ID,
    dataVersion: 11,
    title: '青甘大环线 · 知识库 12 日',
    summary: `${rawKnowledge.meta.direction}。4 名成人，SUV 自驾约 3,580 公里；资料核验于 ${rawKnowledge.meta.last_verified}。`,
    startDate: rawKnowledge.itinerary[0].date,
    endDate: rawKnowledge.itinerary.at(-1)!.date,
    travelers: [
      { id: TRAVELER_IDS[0], name: '石成', color: '#10a7a2' },
      { id: TRAVELER_IDS[1], name: '石晶晶', color: '#ef6548' },
      { id: TRAVELER_IDS[2], name: '同行人 A', color: '#3978f6' },
      { id: TRAVELER_IDS[3], name: '同行人 B', color: '#e4a11b' },
    ],
    days: buildDays(),
    placeLibrary: buildKnowledgeLibrary(),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

export function mergeQingganV10Library(
  base: Record<string, PlaceLibraryEntry>,
  existing: Record<string, PlaceLibraryEntry>,
) {
  const merged = { ...base }
  Object.entries(existing).forEach(([key, entry]) => {
    const baseline = merged[key]
    if (!baseline) {
      merged[key] = entry
      return
    }
    const uploaded = entry.photos.filter((photo) => photo.source === 'upload')
    const customNotes = entry.notes.filter((item) => !item.id.startsWith('qinggan-poi-'))
    merged[key] = {
      ...baseline,
      photos: [...baseline.photos, ...uploaded],
      notes: [...baseline.notes, ...customNotes],
      updatedAt: entry.updatedAt > baseline.updatedAt ? entry.updatedAt : baseline.updatedAt,
    }
  })
  return merged
}

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
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
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
}

const SHI_CHENG = 'traveler-shicheng'
const SHI_JINGJING = 'traveler-shijingjing'
const BOTH = [SHI_CHENG, SHI_JINGJING]

function qingganExpense(
  id: string,
  label: string,
  amount: number,
  category: ExpenseCategory,
  payerId?: string,
) {
  return seedExpense(`qg-${id}`, label, amount, category, payerId)
}

function qingganNote(id: string, text: string) {
  return seedNote(`qg-${id}`, text)
}

const qingganDays: TripDay[] = [
  {
    id: 'qg-day-1',
    date: '2026-09-24',
    title: '长沙集合 · 次日飞西宁',
    stops: [
      seedStop({
        id: 'qg-shanghai-hongqiao',
        name: '上海虹桥站',
        address: '上海市闵行区申贵路1500号',
        location: [121.327105, 31.199515],
        type: 'transport',
        arrivalTime: '17:20',
        departureTime: '18:00',
        stayMinutes: 40,
        participantIds: [SHI_CHENG],
        expenses: [qingganExpense('sh-train', '上海至长沙高铁', 478, 'transport', SHI_CHENG)],
        notes: [qingganNote('sh-depart', '石成晚间乘高铁前往长沙，提前45分钟进站。')],
      }),
      seedStop({
        id: 'qg-changde-station',
        name: '常德站',
        address: '湖南省常德市武陵区武陵大道',
        location: [111.691951, 29.076977],
        type: 'transport',
        arrivalTime: '18:10',
        departureTime: '18:40',
        stayMinutes: 30,
        participantIds: [SHI_JINGJING],
        expenses: [qingganExpense('cd-train', '常德至长沙高铁', 83, 'transport', SHI_JINGJING)],
        notes: [qingganNote('cd-depart', '石晶晶晚间从常德出发，在长沙与石成会合。')],
        leg: createLeg('train', 196, 85, { signal: 'good' }),
      }),
      seedStop({
        id: 'qg-changsha-south',
        name: '长沙南站',
        address: '长沙市雨花区花侯路',
        location: [113.06551, 28.147093],
        type: 'transport',
        arrivalTime: '22:40',
        departureTime: '23:05',
        stayMinutes: 25,
        participantIds: BOTH,
        notes: [qingganNote('cs-meet', '两人在长沙南站会合，确认证件、驾驶证和高原用品。')],
        leg: createLeg('train', 1080, 285, {
          signal: 'good',
          notes: [qingganNote('train-signal', '高铁沿线信号总体良好。')],
        }),
      }),
      seedStop({
        id: 'qg-changsha-hotel',
        name: '长沙机场凯悦嘉轩酒店',
        address: '长沙市长沙县临空南路1号',
        location: [113.214303, 28.188521],
        type: 'hotel',
        arrivalTime: '23:40',
        departureTime: '07:00',
        stayMinutes: 440,
        participantIds: BOTH,
        expenses: [qingganExpense('cs-hotel', '机场酒店一晚', 468, 'hotel', SHI_CHENG)],
        leg: createLeg('driving', 23, 35, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('cs-taxi', '网约车', 72, 'transport', SHI_JINGJING)],
        }),
      }),
      seedStop({
        id: 'qg-changsha-airport',
        name: '长沙黄花国际机场',
        address: '长沙市长沙县黄花镇机场大道308号',
        location: [113.235474, 28.179749],
        type: 'transport',
        arrivalTime: '07:20',
        departureTime: '10:00',
        stayMinutes: 160,
        participantIds: BOTH,
        expenses: [
          qingganExpense('flight-sc', '长沙至西宁机票', 980, 'transport', SHI_CHENG),
          qingganExpense('flight-sj', '长沙至西宁机票', 980, 'transport', SHI_JINGJING),
        ],
        leg: createLeg('driving', 5, 12, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-xining-airport',
        name: '西宁曹家堡国际机场',
        address: '海东市互助土族自治县中关村东路8号',
        location: [102.041555, 36.527142],
        type: 'transport',
        arrivalTime: '12:45',
        departureTime: '13:30',
        stayMinutes: 45,
        participantIds: BOTH,
        notes: [qingganNote('xining-arrival', '落地后先适应海拔，避免快速奔跑和饮酒。')],
        leg: createLeg('flight', 1500, 165, { signal: 'unknown' }),
      }),
      seedStop({
        id: 'qg-car-rental',
        name: '神州租车西宁取车点',
        address: '西宁曹家堡机场附近',
        location: [102.0261, 36.5294],
        type: 'transport',
        arrivalTime: '13:40',
        departureTime: '14:30',
        stayMinutes: 50,
        participantIds: BOTH,
        expenses: [
          qingganExpense('rental', '四驱SUV 12天', 5400, 'rental', SHI_CHENG),
          qingganExpense('insurance', '车辆全险', 960, 'rental', SHI_JINGJING),
        ],
        notes: [qingganNote('car-check', '检查备胎、千斤顶、拖车绳、胎压和玻璃水，确认救援电话。')],
        leg: createLeg('driving', 3, 8, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-shuijingxiang',
        name: '水井巷',
        address: '西宁市城中区水井巷',
        location: [101.775828, 36.618183],
        type: 'food',
        arrivalTime: '15:30',
        departureTime: '17:30',
        stayMinutes: 120,
        participantIds: BOTH,
        expenses: [qingganExpense('xining-meal', '西宁首餐', 180, 'meal', SHI_JINGJING)],
        notes: [qingganNote('xining-meal-note', '清淡饮食、多补水，采购氧气瓶、饮用水与高热量食品。')],
        leg: createLeg('driving', 39, 48, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('first-fuel', '首次加满油', 520, 'fuel', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-xining-hotel-1',
        name: '西宁新华联索菲特大酒店',
        address: '西宁市城西区五四西路63号',
        location: [101.721513, 36.643067],
        type: 'hotel',
        arrivalTime: '18:10',
        departureTime: '07:30',
        stayMinutes: 800,
        participantIds: BOTH,
        expenses: [qingganExpense('xining-hotel-1', '西宁住宿', 620, 'hotel', SHI_CHENG)],
        notes: [qingganNote('altitude', '首晚海拔约2260米，出现持续头痛或胸闷应停止后续高海拔行程。')],
        leg: createLeg('driving', 8, 22, { roadType: 'mixed', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-2',
    date: '2026-09-26',
    title: '门源花海 · 卓尔山',
    stops: [
      seedStop({
        id: 'qg-xining-start',
        name: '西宁新华联索菲特大酒店',
        address: '西宁市城西区五四西路63号',
        location: [101.721513, 36.643067],
        type: 'hotel',
        arrivalTime: '07:10',
        departureTime: '07:30',
        stayMinutes: 20,
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-menyuan',
        name: '门源百里油菜花景区',
        address: '海北州门源县青石嘴镇克苏公路',
        location: [101.440474, 37.477289],
        type: 'scenic',
        arrivalTime: '10:30',
        departureTime: '12:20',
        stayMinutes: 110,
        participantIds: BOTH,
        expenses: [qingganExpense('menyuan-ticket', '景区门票', 120, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('menyuan-season', '9月底花期通常已过，重点观看祁连秋色；出发前确认景区开放情况。')],
        leg: createLeg('driving', 155, 175, {
          roadType: 'national',
          signal: 'good',
          notes: [qingganNote('daban-road', '经达坂山，弯道和长下坡较多。')],
        }),
      }),
      seedStop({
        id: 'qg-zhuoer',
        name: '卓尔山风景区',
        address: '海北州祁连县八宝镇',
        location: [100.275949, 38.183355],
        type: 'scenic',
        arrivalTime: '15:30',
        departureTime: '18:00',
        stayMinutes: 150,
        participantIds: BOTH,
        expenses: [qingganExpense('zhuoer-ticket', '门票与区间车', 160, 'ticket', SHI_CHENG)],
        notes: [qingganNote('zhuoer-view', '傍晚拍摄丹霞、雪山和八宝河谷，注意山顶大风。')],
        leg: createLeg('driving', 169, 190, {
          roadType: 'national',
          signal: 'weak',
          expenses: [qingganExpense('qilian-fuel', '祁连补油', 320, 'fuel', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-qilian-hotel',
        name: '祁连慕山丽璟商务宾馆',
        address: '祁连县人民路北',
        location: [100.245548, 38.1829],
        type: 'hotel',
        arrivalTime: '18:30',
        departureTime: '08:00',
        stayMinutes: 810,
        participantIds: BOTH,
        expenses: [qingganExpense('qilian-hotel', '祁连住宿', 420, 'hotel', SHI_JINGJING)],
        leg: createLeg('driving', 5, 15, { roadType: 'county', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-3',
    date: '2026-09-27',
    title: '祁连草原 · 七彩丹霞',
    stops: [
      seedStop({
        id: 'qg-qilian-depart',
        name: '祁连县',
        address: '海北州祁连县八宝镇',
        location: [100.245548, 38.1829],
        type: 'other',
        arrivalTime: '07:40',
        departureTime: '08:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-qilian-grassland',
        name: '祁连山草原观景带',
        address: 'G227国道峨堡至张掖段',
        location: [100.7208, 38.4622],
        type: 'scenic',
        arrivalTime: '09:30',
        departureTime: '10:20',
        stayMinutes: 50,
        participantIds: BOTH,
        notes: [qingganNote('grassland-stop', '只在安全停车区停靠，牧区道路注意牛羊穿行。')],
        leg: createLeg('driving', 95, 100, { roadType: 'national', signal: 'weak' }),
      }),
      seedStop({
        id: 'qg-danxia',
        name: '张掖七彩丹霞景区',
        address: '张掖市临泽县213省道',
        location: [100.062804, 38.97201],
        type: 'scenic',
        arrivalTime: '14:30',
        departureTime: '18:30',
        stayMinutes: 240,
        participantIds: BOTH,
        expenses: [qingganExpense('danxia-ticket', '门票与观光车', 186, 'ticket', SHI_CHENG)],
        notes: [qingganNote('danxia-sunset', '日落前两小时进入，雨后色彩更饱和。')],
        leg: createLeg('driving', 180, 210, {
          roadType: 'national',
          signal: 'good',
          expenses: [qingganExpense('zhangye-toll', '路桥费', 35, 'toll', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-zhangye-hotel',
        name: '张掖宾馆',
        address: '张掖市甘州区玉水街179号',
        location: [100.41811, 38.9683],
        type: 'hotel',
        arrivalTime: '19:20',
        departureTime: '08:00',
        stayMinutes: 760,
        participantIds: BOTH,
        expenses: [qingganExpense('zhangye-hotel', '张掖住宿', 520, 'hotel', SHI_JINGJING)],
        leg: createLeg('driving', 42, 48, { roadType: 'provincial', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-4',
    date: '2026-09-28',
    title: '河西走廊 · 嘉峪关',
    stops: [
      seedStop({
        id: 'qg-zhangye-start',
        name: '张掖宾馆',
        address: '张掖市甘州区玉水街179号',
        location: [100.41811, 38.9683],
        type: 'hotel',
        arrivalTime: '07:40',
        departureTime: '08:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-zhangye-fuel',
        name: '中国石油张掖城西加油站',
        address: '张掖市甘州区',
        location: [100.371, 38.949],
        type: 'fuel',
        arrivalTime: '08:15',
        departureTime: '08:30',
        stayMinutes: 15,
        participantIds: BOTH,
        expenses: [qingganExpense('zhangye-fuel', '加满油', 430, 'fuel', SHI_CHENG)],
        leg: createLeg('driving', 8, 15, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-jiayuguan',
        name: '嘉峪关关城',
        address: '嘉峪关市峪泉镇',
        location: [98.227762, 39.800827],
        type: 'scenic',
        arrivalTime: '12:00',
        departureTime: '16:00',
        stayMinutes: 240,
        participantIds: BOTH,
        expenses: [qingganExpense('jiayu-ticket', '关城门票', 220, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('jiayu-note', '连霍高速货车较多，保持车距；下午游览关城与长城博物馆。')],
        leg: createLeg('driving', 230, 200, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('jiayu-toll', '高速费', 92, 'toll', SHI_CHENG)],
          tollRoads: ['连霍高速'],
        }),
      }),
      seedStop({
        id: 'qg-jiayu-hotel',
        name: '嘉峪关国际大酒店',
        address: '嘉峪关市和诚东路',
        location: [98.297353, 39.76999],
        type: 'hotel',
        arrivalTime: '17:00',
        departureTime: '08:00',
        stayMinutes: 900,
        participantIds: BOTH,
        expenses: [qingganExpense('jiayu-hotel', '嘉峪关住宿', 480, 'hotel', SHI_CHENG)],
        leg: createLeg('driving', 13, 24, { roadType: 'mixed', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-5',
    date: '2026-09-29',
    title: '嘉峪关至敦煌',
    stops: [
      seedStop({
        id: 'qg-jiayu-start',
        name: '嘉峪关国际大酒店',
        address: '嘉峪关市和诚东路',
        location: [98.297353, 39.76999],
        type: 'hotel',
        arrivalTime: '07:40',
        departureTime: '08:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-guazhou-service',
        name: '瓜州服务区',
        address: '连霍高速瓜州段',
        location: [95.7422, 40.5251],
        type: 'fuel',
        arrivalTime: '11:00',
        departureTime: '11:30',
        stayMinutes: 30,
        participantIds: BOTH,
        expenses: [qingganExpense('guazhou-fuel', '服务区补油', 360, 'fuel', SHI_CHENG)],
        notes: [qingganNote('guazhou-wind', '河西走廊横风明显，服务区检查胎压和剩余续航。')],
        leg: createLeg('driving', 250, 180, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('guazhou-toll', '高速费', 105, 'toll', SHI_CHENG)],
          tollRoads: ['连霍高速'],
        }),
      }),
      seedStop({
        id: 'qg-dunhuang-city',
        name: '敦煌市',
        address: '酒泉市敦煌市阳关中路',
        location: [94.662328, 40.142066],
        type: 'scenic',
        arrivalTime: '14:20',
        departureTime: '18:30',
        stayMinutes: 250,
        participantIds: BOTH,
        expenses: [
          qingganExpense('dunhuang-meal', '沙洲夜市晚餐', 220, 'meal', SHI_JINGJING),
          qingganExpense('dunhuang-shopping', '补给与防沙用品', 160, 'shopping', SHI_CHENG),
        ],
        notes: [qingganNote('dunhuang-rest', '本次以城市休整和补给为主，莫高窟需另行提前预约。')],
        leg: createLeg('driving', 127, 105, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('dunhuang-toll', '高速费', 42, 'toll', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-dunhuang-hotel',
        name: '敦煌山庄',
        address: '敦煌市敦月路',
        location: [94.669199, 40.104885],
        type: 'hotel',
        arrivalTime: '19:00',
        departureTime: '07:00',
        stayMinutes: 720,
        participantIds: BOTH,
        expenses: [qingganExpense('dunhuang-hotel', '敦煌住宿', 680, 'hotel', SHI_JINGJING)],
        leg: createLeg('driving', 7, 18, { roadType: 'mixed', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-6',
    date: '2026-09-30',
    title: '当金山 · 黑独山',
    stops: [
      seedStop({
        id: 'qg-dunhuang-start',
        name: '敦煌山庄',
        address: '敦煌市敦月路',
        location: [94.669199, 40.104885],
        type: 'hotel',
        arrivalTime: '06:40',
        departureTime: '07:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-akesai',
        name: '阿克塞博罗转井影视基地',
        address: '酒泉市阿克塞县博罗转井镇',
        location: [94.2702, 39.4037],
        type: 'scenic',
        arrivalTime: '09:20',
        departureTime: '10:30',
        stayMinutes: 70,
        participantIds: BOTH,
        expenses: [qingganExpense('akesai-ticket', '影视基地门票', 80, 'ticket', SHI_CHENG)],
        leg: createLeg('driving', 105, 120, { roadType: 'national', signal: 'weak' }),
      }),
      seedStop({
        id: 'qg-heidushan',
        name: '黑独山景区',
        address: '海西州茫崖市冷湖镇G215国道附近',
        location: [93.401038, 38.812435],
        type: 'scenic',
        arrivalTime: '13:30',
        departureTime: '16:00',
        stayMinutes: 150,
        participantIds: BOTH,
        notes: [
          qingganNote('heidushan-rule', '遵守现场管控，只在开放区域徒步；不驶入雅丹脆弱地表。'),
          qingganNote('heidushan-signal', '景区周边信号弱，提前下载离线地图并向家人报备。'),
        ],
        leg: createLeg('driving', 170, 180, {
          roadType: 'national',
          signal: 'weak',
          notes: [qingganNote('dangjin', '翻越当金山口，注意长下坡、低温与横风。')],
        }),
      }),
      seedStop({
        id: 'qg-lenghu-fuel',
        name: '冷湖镇加油站',
        address: '海西州茫崖市冷湖镇',
        location: [93.337, 38.737],
        type: 'fuel',
        arrivalTime: '17:00',
        departureTime: '17:20',
        stayMinutes: 20,
        participantIds: BOTH,
        expenses: [qingganExpense('lenghu-fuel', '冷湖加满油', 480, 'fuel', SHI_CHENG)],
        notes: [qingganNote('lenghu-fuel-note', '进入柴达木西段前必须加满，检查备胎和饮用水。')],
        leg: createLeg('driving', 28, 35, { roadType: 'national', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-lenghu-hotel',
        name: '冷湖镇住宿点',
        address: '海西州茫崖市冷湖镇兴湖街',
        location: [93.334715, 38.733254],
        type: 'hotel',
        arrivalTime: '17:30',
        departureTime: '07:30',
        stayMinutes: 840,
        participantIds: BOTH,
        expenses: [qingganExpense('lenghu-hotel', '冷湖住宿', 360, 'hotel', SHI_JINGJING)],
        leg: createLeg('driving', 2, 6, { roadType: 'mixed', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-7',
    date: '2026-10-01',
    title: '冷湖至大柴旦翡翠湖',
    stops: [
      seedStop({
        id: 'qg-lenghu-start',
        name: '冷湖镇',
        address: '海西州茫崖市冷湖镇',
        location: [93.334715, 38.733254],
        type: 'other',
        arrivalTime: '07:10',
        departureTime: '07:30',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-dachaidan-fuel',
        name: '中国石油大柴旦加油站',
        address: '大柴旦新汽配城',
        location: [95.353031, 37.864097],
        type: 'fuel',
        arrivalTime: '11:30',
        departureTime: '11:50',
        stayMinutes: 20,
        participantIds: BOTH,
        expenses: [qingganExpense('dachaidan-fuel', '加满油', 460, 'fuel', SHI_CHENG)],
        leg: createLeg('driving', 235, 240, {
          roadType: 'national',
          signal: 'weak',
          notes: [qingganNote('lenghu-dachaidan', 'G315沿线补给稀少，不偏离主路，不驶入无标识便道。')],
        }),
      }),
      seedStop({
        id: 'qg-dachaidan-lake',
        name: '大柴旦翡翠湖',
        address: '大柴旦镇西南约4公里',
        location: [95.265841, 37.866427],
        type: 'scenic',
        arrivalTime: '13:00',
        departureTime: '17:00',
        stayMinutes: 240,
        participantIds: BOTH,
        expenses: [qingganExpense('jade-ticket', '门票与小火车', 220, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('jade-lake', '盐湖反光强，佩戴墨镜；不要越过围栏进入盐壳薄弱区。')],
        leg: createLeg('driving', 14, 25, { roadType: 'county', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-dachaidan-hotel',
        name: '大柴旦守信龙之梦大酒店',
        address: '大柴旦镇团结路',
        location: [95.359222, 37.849728],
        type: 'hotel',
        arrivalTime: '17:40',
        departureTime: '07:00',
        stayMinutes: 800,
        participantIds: BOTH,
        expenses: [qingganExpense('dachaidan-hotel', '大柴旦住宿', 560, 'hotel', SHI_CHENG)],
        leg: createLeg('driving', 16, 28, { roadType: 'county', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-8',
    date: '2026-10-02',
    title: 'U型公路 · 水上雅丹',
    stops: [
      seedStop({
        id: 'qg-dachaidan-start',
        name: '大柴旦镇',
        address: '海西州大柴旦行政区',
        location: [95.359222, 37.849728],
        type: 'other',
        arrivalTime: '06:40',
        departureTime: '07:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-u-road',
        name: 'G315 U型公路',
        address: 'G315国道780公里处',
        location: [94.965896, 37.389371],
        type: 'scenic',
        arrivalTime: '09:00',
        departureTime: '09:30',
        stayMinutes: 30,
        participantIds: BOTH,
        notes: [qingganNote('u-road-safety', '严禁站在公路中央拍照，只在合法停车区远距离取景。')],
        leg: createLeg('driving', 115, 120, {
          roadType: 'national',
          signal: 'weak',
        }),
      }),
      seedStop({
        id: 'qg-water-yadan',
        name: '乌素特水上雅丹地质公园',
        address: '大柴旦行政委员会西台2号',
        location: [93.773859, 37.617639],
        type: 'scenic',
        arrivalTime: '12:30',
        departureTime: '18:00',
        stayMinutes: 330,
        participantIds: BOTH,
        expenses: [qingganExpense('water-yadan-ticket', '门票与观光车', 236, 'ticket', SHI_CHENG)],
        notes: [qingganNote('water-yadan-sunset', '安排日落时段，风大时注意相机防沙。')],
        leg: createLeg('driving', 210, 190, {
          roadType: 'national',
          signal: 'weak',
          notes: [qingganNote('g315-signal', 'G315部分路段信号间歇，离线导航必须提前下载。')],
        }),
      }),
      seedStop({
        id: 'qg-water-yadan-camp',
        name: '水上雅丹房车营地',
        address: 'G315国道900公里处',
        location: [93.774655, 37.622144],
        type: 'hotel',
        arrivalTime: '18:10',
        departureTime: '07:00',
        stayMinutes: 770,
        participantIds: BOTH,
        expenses: [qingganExpense('yadan-camp', '星空房车', 860, 'hotel', SHI_JINGJING)],
        leg: createLeg('walking', 0.8, 12, { signal: 'weak' }),
      }),
    ],
  },
  {
    id: 'qg-day-9',
    date: '2026-10-03',
    title: '察尔汗盐湖 · 格尔木',
    stops: [
      seedStop({
        id: 'qg-water-yadan-start',
        name: '水上雅丹房车营地',
        address: 'G315国道900公里处',
        location: [93.774655, 37.622144],
        type: 'hotel',
        arrivalTime: '06:40',
        departureTime: '07:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-xiaochaidan-fuel',
        name: '小柴旦湖服务区加油站',
        address: 'G315与柳格高速附近',
        location: [95.1805, 37.5003],
        type: 'fuel',
        arrivalTime: '10:20',
        departureTime: '10:40',
        stayMinutes: 20,
        participantIds: BOTH,
        expenses: [qingganExpense('xiaochaidan-fuel', '补油', 430, 'fuel', SHI_CHENG)],
        leg: createLeg('driving', 220, 200, {
          roadType: 'national',
          signal: 'weak',
        }),
      }),
      seedStop({
        id: 'qg-qarhan',
        name: '察尔汗盐湖',
        address: '格尔木市察尔汗镇',
        location: [95.192077, 36.949738],
        type: 'scenic',
        arrivalTime: '12:30',
        departureTime: '16:00',
        stayMinutes: 210,
        participantIds: BOTH,
        expenses: [qingganExpense('qarhan-ticket', '门票与摆渡车', 200, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('qarhan-check', '工业盐湖区域以当日开放公告为准，不进入生产禁区。')],
        leg: createLeg('driving', 88, 85, { roadType: 'highway', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-golmud-hotel',
        name: '格尔木凯邦大酒店',
        address: '格尔木市察尔汗南路8号',
        location: [94.924954, 36.392885],
        type: 'hotel',
        arrivalTime: '17:30',
        departureTime: '06:30',
        stayMinutes: 780,
        participantIds: BOTH,
        expenses: [qingganExpense('golmud-hotel-1', '格尔木住宿', 460, 'hotel', SHI_CHENG)],
        notes: [qingganNote('kekexili-prepare', '前台确认次日G109路况，准备氧气、保暖衣和热水。')],
        leg: createLeg('driving', 66, 80, { roadType: 'highway', signal: 'good' }),
      }),
    ],
  },
  {
    id: 'qg-day-10',
    date: '2026-10-04',
    title: '可可西里北缘 · 昆仑山口往返',
    stops: [
      seedStop({
        id: 'qg-golmud-start',
        name: '格尔木凯邦大酒店',
        address: '格尔木市察尔汗南路8号',
        location: [94.924954, 36.392885],
        type: 'hotel',
        arrivalTime: '06:10',
        departureTime: '06:30',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-golmud-fuel',
        name: '中国石油南郊加油站',
        address: '格尔木市盐桥南路110号',
        location: [94.857992, 36.370666],
        type: 'fuel',
        arrivalTime: '06:45',
        departureTime: '07:05',
        stayMinutes: 20,
        participantIds: BOTH,
        expenses: [qingganExpense('golmud-fuel', '可可西里前加满', 500, 'fuel', SHI_CHENG)],
        notes: [qingganNote('kekexili-fuel', '确认油量、备胎、氧气和离线地图，不离开G109主路。')],
        leg: createLeg('driving', 8, 16, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-sonamdajie',
        name: '可可西里国家级自然保护区（昆仑山口）',
        address: '格尔木市郭勒木德镇G109昆仑山口',
        location: [94.067003, 35.639114],
        type: 'scenic',
        arrivalTime: '10:40',
        departureTime: '12:40',
        stayMinutes: 120,
        participantIds: BOTH,
        notes: [
          qingganNote('kekexili-rule', '只在G109昆仑山口的开放区域停留，不驶入保护区腹地，不追逐野生动物。'),
          qingganNote('kekexili-altitude', '海拔约4700米，如有明显高反立即返程。'),
        ],
        leg: createLeg('driving', 151, 205, {
          roadType: 'national',
          signal: 'none',
          notes: [qingganNote('g109-signal', '昆仑山口以南长距离无稳定信号，保持车辆结伴与离线导航。')],
        }),
      }),
      seedStop({
        id: 'qg-golmud-hotel-return',
        name: '格尔木凯邦大酒店',
        address: '格尔木市察尔汗南路8号',
        location: [94.924954, 36.392885],
        type: 'hotel',
        arrivalTime: '16:20',
        departureTime: '07:00',
        stayMinutes: 780,
        participantIds: BOTH,
        expenses: [qingganExpense('golmud-hotel-2', '格尔木续住', 460, 'hotel', SHI_JINGJING)],
        leg: createLeg('driving', 159, 220, {
          roadType: 'national',
          signal: 'none',
        }),
      }),
    ],
  },
  {
    id: 'qg-day-11',
    date: '2026-10-05',
    title: '格尔木至乌兰',
    stops: [
      seedStop({
        id: 'qg-golmud-depart',
        name: '格尔木凯邦大酒店',
        address: '格尔木市察尔汗南路8号',
        location: [94.924954, 36.392885],
        type: 'hotel',
        arrivalTime: '06:40',
        departureTime: '07:00',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-delingha-service',
        name: '德令哈服务区',
        address: '德小高速德令哈段',
        location: [97.3615, 37.3274],
        type: 'fuel',
        arrivalTime: '11:00',
        departureTime: '11:40',
        stayMinutes: 40,
        participantIds: BOTH,
        expenses: [
          qingganExpense('delingha-fuel', '德令哈补油', 390, 'fuel', SHI_CHENG),
          qingganExpense('delingha-meal', '服务区午餐', 100, 'meal', SHI_JINGJING),
        ],
        leg: createLeg('driving', 290, 220, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('delingha-toll', '高速费', 138, 'toll', SHI_CHENG)],
          tollRoads: ['柳格高速', '德小高速'],
        }),
      }),
      seedStop({
        id: 'qg-ulan-hotel',
        name: '乌兰驼泉商务宾馆',
        address: '乌兰县希里沟镇东大街12号',
        location: [98.479155, 36.929319],
        type: 'hotel',
        arrivalTime: '15:10',
        departureTime: '07:30',
        stayMinutes: 980,
        participantIds: BOTH,
        expenses: [qingganExpense('ulan-hotel', '乌兰住宿', 360, 'hotel', SHI_CHENG)],
        notes: [qingganNote('ulan-rest', '在乌兰提前休息，避免格尔木到茶卡单日驾驶超过500公里。')],
        leg: createLeg('driving', 115, 95, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('ulan-toll', '高速费', 48, 'toll', SHI_CHENG)],
        }),
      }),
    ],
  },
  {
    id: 'qg-day-12',
    date: '2026-10-06',
    title: '青海湖 · 返回西宁',
    stops: [
      seedStop({
        id: 'qg-ulan-start',
        name: '乌兰驼泉商务宾馆',
        address: '乌兰县希里沟镇东大街12号',
        location: [98.479155, 36.929319],
        type: 'hotel',
        arrivalTime: '07:10',
        departureTime: '07:30',
        participantIds: BOTH,
      }),
      seedStop({
        id: 'qg-chaka-lake',
        name: '茶卡盐湖景区',
        address: '海西州乌兰县茶卡镇盐湖路9号',
        location: [99.078336, 36.75991],
        type: 'scenic',
        arrivalTime: '08:40',
        departureTime: '11:20',
        stayMinutes: 160,
        participantIds: BOTH,
        expenses: [qingganExpense('chaka-ticket', '门票与小火车', 240, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('chaka-note', '10月天气寒冷，盐湖风大，关注闭园和结冰通知。')],
        leg: createLeg('driving', 75, 65, {
          roadType: 'highway',
          signal: 'good',
          expenses: [qingganExpense('chaka-toll', '高速费', 28, 'toll', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-qinghai-lake',
        name: '青海湖二郎剑景区',
        address: '海南州共和县109国道151号',
        location: [100.495767, 36.578633],
        type: 'scenic',
        arrivalTime: '13:40',
        departureTime: '16:00',
        stayMinutes: 180,
        participantIds: BOTH,
        expenses: [qingganExpense('qinghai-ticket', '景区门票', 180, 'ticket', SHI_JINGJING)],
        notes: [qingganNote('qinghai-lake-note', '沿途仅在正规观景点停车，尊重牧场边界。')],
        leg: createLeg('driving', 150, 140, { roadType: 'national', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-xining-return-fuel',
        name: '西宁城西加油站',
        address: '西宁市城西区',
        location: [101.7075, 36.6278],
        type: 'fuel',
        arrivalTime: '18:40',
        departureTime: '19:00',
        stayMinutes: 20,
        participantIds: BOTH,
        expenses: [qingganExpense('return-fuel', '还车前补油', 360, 'fuel', SHI_CHENG)],
        leg: createLeg('driving', 155, 165, {
          roadType: 'national',
          signal: 'good',
          expenses: [qingganExpense('return-toll', '路桥费', 45, 'toll', SHI_CHENG)],
        }),
      }),
      seedStop({
        id: 'qg-xining-station',
        name: '西宁站',
        address: '西宁市城东区祁连路2号',
        location: [101.814362, 36.620233],
        type: 'transport',
        arrivalTime: '19:40',
        departureTime: '20:20',
        stayMinutes: 40,
        participantIds: BOTH,
        notes: [qingganNote('trip-end', '环线结束。还车后按后续交通安排返程，保留半天机动时间。')],
        leg: createLeg('driving', 14, 32, { roadType: 'mixed', signal: 'good' }),
      }),
      seedStop({
        id: 'qg-xining-airport-return',
        name: '西宁曹家堡国际机场',
        address: '海东市互助土族自治县中关村东路8号',
        location: [102.041555, 36.527142],
        type: 'transport',
        arrivalTime: '21:10',
        departureTime: '22:20',
        stayMinutes: 70,
        participantIds: BOTH,
        expenses: [
          qingganExpense('return-flight-sc', '西宁至长沙机票', 1080, 'transport', SHI_CHENG),
          qingganExpense(
            'return-flight-sj',
            '西宁至长沙机票',
            1080,
            'transport',
            SHI_JINGJING,
          ),
        ],
        notes: [qingganNote('return-car', '机场还车并预留验车、安检时间。')],
        leg: createLeg('driving', 31, 42, {
          roadType: 'highway',
          signal: 'good',
        }),
      }),
      seedStop({
        id: 'qg-changsha-airport-return',
        name: '长沙黄花国际机场',
        address: '长沙市长沙县黄花镇机场大道308号',
        location: [113.235474, 28.179749],
        type: 'transport',
        arrivalTime: '00:50',
        departureTime: '01:20',
        stayMinutes: 30,
        participantIds: BOTH,
        notes: [qingganNote('return-arrival', '返回长沙，青甘反向环线结束。')],
        leg: createLeg('flight', 1500, 150, { signal: 'unknown' }),
      }),
    ],
  },
]

export const qingganRoadbook: Roadbook = {
  id: 'roadbook-qinggan-reverse',
  title: '青甘大环线 · 反向 12 日',
  summary: '石成与石晶晶长沙会合后飞西宁，沿门源、祁连、河西走廊和柴达木盆地反向环行，含可可西里保护站往返。',
  startDate: '2026-09-24',
  endDate: '2026-10-06',
  travelers: [
    { id: SHI_CHENG, name: '石成', color: '#10a7a2' },
    { id: SHI_JINGJING, name: '石晶晶', color: '#ef6548' },
  ],
  days: qingganDays,
  createdAt: '2026-08-20T08:00:00.000Z',
  updatedAt: '2026-08-20T08:00:00.000Z',
}

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
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || now,
  }
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
      const normalized = parsed.map(normalizeRoadbook)
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

  return [qingganRoadbook, sampleRoadbook]
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
  } catch {
    // A backup can consume the remaining localStorage quota. Current data wins.
    try {
      localStorage.removeItem(BACKUP_STORAGE_KEY)
    } catch {
      // Retry the primary write even if backup cleanup is unavailable.
    }
    localStorage.setItem(STORAGE_KEY, next)
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

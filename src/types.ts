export type PlaceType =
  | 'scenic'
  | 'food'
  | 'hotel'
  | 'transport'
  | 'fuel'
  | 'other'

export type TransportMode =
  | 'driving'
  | 'walking'
  | 'transit'
  | 'cycling'
  | 'train'
  | 'flight'

export type ExpenseCategory =
  | 'ticket'
  | 'meal'
  | 'hotel'
  | 'transport'
  | 'fuel'
  | 'toll'
  | 'rental'
  | 'shopping'
  | 'other'

export type RoadType =
  | 'highway'
  | 'national'
  | 'provincial'
  | 'county'
  | 'unpaved'
  | 'mixed'
  | 'unknown'

export type SignalLevel = 'good' | 'weak' | 'none' | 'unknown'

export interface ExpenseItem {
  id: string
  label: string
  amount: number
  category: ExpenseCategory
  payerId?: string
}

export interface TripNote {
  id: string
  text: string
  imageDataUrl?: string
  createdAt: string
}

export interface PlacePhoto {
  id: string
  url: string
  caption: string
  source: 'generated' | 'upload'
  createdAt: string
}

export interface PlaceLibraryEntry {
  key: string
  name: string
  address: string
  photos: PlacePhoto[]
  notes: TripNote[]
  updatedAt: string
}

export interface Traveler {
  id: string
  name: string
  color: string
}

export interface TripLeg {
  mode: TransportMode
  distanceKm: number
  durationMinutes: number
  roadType: RoadType
  signal: SignalLevel
  expenses: ExpenseItem[]
  notes: TripNote[]
  roadNames?: string[]
  tollRoads?: string[]
}

export interface TripStop {
  id: string
  name: string
  address: string
  location: [number, number]
  type: PlaceType
  arrivalTime: string
  departureTime: string
  stayMinutes: number
  hidden: boolean
  expenses: ExpenseItem[]
  notes: TripNote[]
  participantIds: string[]
  legFromPrevious?: TripLeg
}

export interface TripDay {
  id: string
  date: string
  title: string
  stops: TripStop[]
}

export interface Roadbook {
  id: string
  title: string
  summary: string
  startDate: string
  endDate: string
  travelers: Traveler[]
  days: TripDay[]
  placeLibrary: Record<string, PlaceLibraryEntry>
  createdAt: string
  updatedAt: string
}

export interface PlaceSuggestion {
  id: string
  name: string
  address: string
  location: [number, number]
  type?: string
}

export type MapBaseLayer = 'standard' | 'satellite'

export type MapProvider = 'amap' | 'baidu'

export type MapScope =
  | { mode: 'global' }
  | { mode: 'day'; dayId: string }
  | { mode: 'leg'; dayId: string; stopId: string; fromStopId: string }

export type MapFocusMode = 'overview' | 'scenic' | 'cost' | 'driving' | 'hotel'

export interface MapVisibility {
  routes: boolean
  distances: boolean
  scenic: boolean
  hotels: boolean
  costs: boolean
  fuel: boolean
  labels: boolean
  traffic: boolean
}

export interface ResolvedLeg {
  dayId: string
  stopId: string
  fromStopId: string
  distanceKm: number
  durationMinutes: number
  tolls?: number
  tollDistanceKm?: number
  roadNames?: string[]
  tollRoads?: string[]
}

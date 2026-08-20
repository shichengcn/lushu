export type PlaceType = 'scenic' | 'food' | 'hotel' | 'transport' | 'other'

export type TransportMode = 'driving' | 'walking' | 'transit' | 'cycling'

export interface TripLeg {
  mode: TransportMode
  distanceKm: number
  durationMinutes: number
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
  cost: number
  notes: string
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
  days: TripDay[]
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

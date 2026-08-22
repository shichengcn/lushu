import type {
  PlaceLibraryEntry,
  PlacePhoto,
  Roadbook,
  TripNote,
  TripStop,
} from '@/types'

const IMAGE_ENDPOINT = 'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image'

export function placeLibraryKey(place: Pick<TripStop, 'name'>) {
  return place.name
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s·•、，,。./\\_-]+/g, '')
}

function generatedPhotoUrl(stop: Pick<TripStop, 'name' | 'address' | 'type'>, view: string) {
  const prompt = [
    `Realistic travel editorial photograph of ${stop.name}`,
    stop.address,
    `place type ${stop.type}`,
    view,
    'natural daylight, accurate geography, clear subject, documentary photography',
    'no text, no watermark, suitable for a professional travel itinerary website',
  ].join(', ')
  const params = new URLSearchParams({
    prompt,
    image_size: 'landscape_4_3',
  })
  return `${IMAGE_ENDPOINT}?${params.toString()}`
}

export function defaultPlacePhotos(
  stop: Pick<TripStop, 'name' | 'address' | 'type'>,
): PlacePhoto[] {
  const key = placeLibraryKey(stop)
  const createdAt = '2026-08-21T00:00:00.000Z'
  return [
    ['overview', 'wide establishing view showing the real destination', `${stop.name}全景`],
    ['detail', 'closer visitor viewpoint highlighting recognizable details', `${stop.name}旅行视角`],
    ['photo-spot', 'best photography viewpoint during golden hour', `${stop.name}推荐机位`],
    ['journey', 'traveler eye-level documentary view with surrounding road and landscape', `${stop.name}沿途视角`],
  ].map(([suffix, view, caption]) => ({
    id: `${key}-${suffix}`,
    url: generatedPhotoUrl(stop, view),
    caption,
    source: 'generated' as const,
    createdAt,
  }))
}

export function placeLibraryEntry(
  roadbook: Roadbook,
  stop: TripStop,
): PlaceLibraryEntry {
  const key = placeLibraryKey(stop)
  const existing = roadbook.placeLibrary[key]
  return existing
    ? {
        ...existing,
        photos: existing.photos.length ? existing.photos : defaultPlacePhotos(stop),
      }
    : {
      key,
      name: stop.name,
      address: stop.address,
      photos: defaultPlacePhotos(stop),
      notes: [],
      updatedAt: stop.notes.at(-1)?.createdAt || roadbook.updatedAt,
    }
}

export function ensurePlaceLibraryEntry(
  library: Record<string, PlaceLibraryEntry>,
  stop: TripStop,
) {
  const key = placeLibraryKey(stop)
  const existing = library[key]
  if (existing) {
    const defaults = defaultPlacePhotos(stop)
    const existingIds = new Set(existing.photos.map((photo) => photo.id))
    return {
      ...library,
      [key]: {
        ...existing,
        name: stop.name,
        address: stop.address,
        photos: [
          ...existing.photos,
          ...defaults.filter((photo) => !existingIds.has(photo.id)),
        ],
      },
    }
  }
  return {
    ...library,
    [key]: {
      key,
      name: stop.name,
      address: stop.address,
      photos: defaultPlacePhotos(stop),
      notes: [],
      updatedAt: new Date().toISOString(),
    },
  }
}

export function normalizePlaceLibrary(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      const entry = value as Partial<PlaceLibraryEntry>
      if (!entry?.name) return []
      const photos = Array.isArray(entry.photos)
        ? entry.photos
            .filter((photo): photo is PlacePhoto => Boolean(photo?.url))
            .map((photo) => ({
              id: photo.id || `${key}-${Math.random().toString(36).slice(2, 8)}`,
              url: photo.url,
              caption: photo.caption || entry.name || '地点照片',
              source:
                photo.source === 'upload'
                  ? 'upload' as const
                  : photo.source === 'reference'
                    ? 'reference' as const
                    : 'generated' as const,
              createdAt: photo.createdAt || new Date().toISOString(),
            }))
        : []
      const notes = Array.isArray(entry.notes)
        ? entry.notes.filter((note): note is TripNote => Boolean(note?.id))
        : []
      return [[key, {
        key,
        name: entry.name,
        address: entry.address || '',
        photos,
        notes,
        updatedAt: entry.updatedAt || new Date().toISOString(),
      } satisfies PlaceLibraryEntry]]
    }),
  )
}

export async function compressPlacePhoto(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error('图片不能超过 8 MB')
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('图片解析失败'))
    element.src = source
  })
  const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.78)
}

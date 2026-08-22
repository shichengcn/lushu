import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Plus } from 'lucide-react'
import { placeLibraryEntry } from '@/lib/place-media'
import type { PlacePhoto, Roadbook, TripStop } from '@/types'

interface PlaceMediaGalleryProps {
  roadbook: Roadbook
  stop: TripStop
  readOnly?: boolean
  onAddPhoto: (stop: TripStop, file: File) => Promise<void>
  onAddNote: (stop: TripStop, text: string) => void
}

export function PlaceThumbnail({ photo }: { photo: PlacePhoto }) {
  const [visible, setVisible] = useState(photo.source !== 'generated')
  return (
    <img
      src={photo.url}
      alt=""
      hidden={!visible}
      loading="lazy"
      onLoad={(event) => {
        const image = event.currentTarget
        setVisible(photo.source !== 'generated' || image.naturalWidth !== image.naturalHeight)
      }}
      onError={() => setVisible(false)}
    />
  )
}

function PlacePhotoFigure({
  photo,
  onUnavailable,
}: {
  photo: PlacePhoto
  onUnavailable: (photoId: string) => void
}) {
  const [visible, setVisible] = useState(photo.source !== 'generated')
  return (
    <figure hidden={!visible}>
      <img
        src={photo.url}
        alt={photo.caption}
        loading="lazy"
        onLoad={(event) => {
          const image = event.currentTarget
          const available =
            photo.source !== 'generated' || image.naturalWidth !== image.naturalHeight
          setVisible(available)
          if (!available) onUnavailable(photo.id)
        }}
        onError={() => onUnavailable(photo.id)}
      />
      <figcaption>{photo.caption}</figcaption>
    </figure>
  )
}

export function PlaceMediaGallery({
  roadbook,
  stop,
  readOnly,
  onAddPhoto,
  onAddNote,
}: PlaceMediaGalleryProps) {
  const entry = placeLibraryEntry(roadbook, stop)
  const inputRef = useRef<HTMLInputElement>(null)
  const touchStartRef = useRef<number | null>(null)
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [unavailablePhotoIds, setUnavailablePhotoIds] = useState<string[]>([])
  const photos = entry.photos.filter((photo) => !unavailablePhotoIds.includes(photo.id))
  const currentPhotoIndex = Math.min(activePhotoIndex, Math.max(0, photos.length - 1))
  const activePhoto = photos[currentPhotoIndex]

  const movePhoto = (direction: -1 | 1) => {
    if (photos.length < 2) return
    setActivePhotoIndex((current) => (current + direction + photos.length) % photos.length)
  }

  const markUnavailable = (photoId: string) => {
    setUnavailablePhotoIds((current) =>
      current.includes(photoId) ? current : [...current, photoId],
    )
    setActivePhotoIndex(0)
  }

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      await onAddPhoto(stop, file)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const addNote = () => {
    if (!note.trim()) return
    onAddNote(stop, note)
    setNote('')
  }

  return (
    <div className="place-media-library">
      <div
        className="place-photo-carousel"
        onTouchStart={(event) => {
          touchStartRef.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          if (touchStartRef.current === null) return
          const distance = event.changedTouches[0]?.clientX - touchStartRef.current
          touchStartRef.current = null
          if (Math.abs(distance) < 36) return
          movePhoto(distance > 0 ? -1 : 1)
        }}
      >
        {activePhoto ? (
          <PlacePhotoFigure photo={activePhoto} onUnavailable={markUnavailable} />
        ) : (
          <div className="place-photo-empty">
            <ImagePlus size={22} />
            暂无可用图片
          </div>
        )}
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              className="place-photo-previous"
              onClick={() => movePhoto(-1)}
              title="上一张"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="place-photo-next"
              onClick={() => movePhoto(1)}
              title="下一张"
            >
              <ChevronRight size={18} />
            </button>
            <span className="place-photo-counter">
              {currentPhotoIndex + 1} / {photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="place-photo-thumbnails">
          {photos.map((photo, index) => (
            <button
              type="button"
              className={index === currentPhotoIndex ? 'is-active' : ''}
              key={photo.id}
              onClick={() => setActivePhotoIndex(index)}
              title={photo.caption}
            >
              <PlaceThumbnail photo={photo} />
            </button>
          ))}
        </div>
      ) : null}
      {!readOnly ? (
        <button
          type="button"
          className="place-photo-add"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus size={20} />
          {uploading ? '处理中' : '添加照片'}
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      {entry.notes.length ? (
        <div className="place-library-notes">
          {entry.notes.map((item) => (
            <p key={item.id}>{item.text}</p>
          ))}
        </div>
      ) : null}

      {!readOnly ? (
        <div className="place-note-add">
          <input
            value={note}
            placeholder="添加注意事项"
            aria-label="地点注意事项"
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addNote()
            }}
          />
          <button type="button" onClick={addNote} disabled={!note.trim()} title="添加注意事项">
            <Plus size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

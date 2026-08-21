import { useRef, useState } from 'react'
import { ImagePlus, Plus } from 'lucide-react'
import { placeLibraryEntry } from '@/lib/place-media'
import type { PlacePhoto, Roadbook, TripStop } from '@/types'

interface PlaceMediaGalleryProps {
  roadbook: Roadbook
  stop: TripStop
  readOnly?: boolean
  onAddPhoto: (stopId: string, file: File) => Promise<void>
  onAddNote: (stopId: string, text: string) => void
}

export function PlaceThumbnail({ photo }: { photo: PlacePhoto }) {
  const [visible, setVisible] = useState(photo.source === 'upload')
  return (
    <img
      src={photo.url}
      alt=""
      hidden={!visible}
      loading="lazy"
      onLoad={(event) => {
        const image = event.currentTarget
        setVisible(photo.source === 'upload' || image.naturalWidth !== image.naturalHeight)
      }}
    />
  )
}

function PlacePhotoFigure({ photo }: { photo: PlacePhoto }) {
  const [visible, setVisible] = useState(photo.source === 'upload')
  return (
    <figure hidden={!visible}>
      <img
        src={photo.url}
        alt={photo.caption}
        loading="lazy"
        onLoad={(event) => {
          const image = event.currentTarget
          setVisible(photo.source === 'upload' || image.naturalWidth !== image.naturalHeight)
        }}
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
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)

  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      await onAddPhoto(stop.id, file)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const addNote = () => {
    if (!note.trim()) return
    onAddNote(stop.id, note)
    setNote('')
  }

  return (
    <div className="place-media-library">
      <div className="place-photo-grid">
        {entry.photos.map((photo) => (
          <PlacePhotoFigure key={photo.id} photo={photo} />
        ))}
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
      </div>
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

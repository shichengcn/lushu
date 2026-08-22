import { BookOpen, Check, ExternalLink, PlayCircle, Plus } from 'lucide-react'
import { PlaceMediaGallery } from '@/components/PlaceMediaGallery'
import type { KnowledgePlace, Roadbook, TripStop } from '@/types'

interface KnowledgePlaceDetailsProps {
  roadbook: Roadbook
  place: KnowledgePlace
  stop: TripStop
  selected: boolean
  readOnly: boolean
  onAddPhoto: (stop: TripStop, file: File) => Promise<void>
  onAddNote: (stop: TripStop, text: string) => void
  onAddPlace: (place: KnowledgePlace) => void
  onOpenMap: () => void
}

function displayPrice(value: string) {
  return value ? `¥${value}` : '待确认'
}

export function KnowledgeReferencePanel({ place }: { place: KnowledgePlace }) {
  return (
    <>
      {place.travelogue ? (
        <section className="knowledge-place-travelogue">
          <h4>游记与实走评价</h4>
          <p>{place.travelogue}</p>
        </section>
      ) : null}
      {place.references.length ? (
        <section className="knowledge-place-references">
          <h4>参考资料</h4>
          <div>
            {place.references.map((reference) => (
              <a
                key={reference.url}
                href={reference.url}
                target="_blank"
                rel="noreferrer"
              >
                {reference.type === 'video' ? (
                  <PlayCircle size={13} />
                ) : (
                  <BookOpen size={13} />
                )}
                <span>{reference.title}</span>
                <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

export function KnowledgePlaceDetails({
  roadbook,
  place,
  stop,
  selected,
  readOnly,
  onAddPhoto,
  onAddNote,
  onAddPlace,
  onOpenMap,
}: KnowledgePlaceDetailsProps) {
  return (
    <>
      <span className="map-detail-kicker">PLANNING PLACE</span>
      <h3>{place.name}</h3>
      <p className="map-detail-address">{place.address}</p>

      <div className="knowledge-place-tags">
        <span>{place.isNiche ? '小众秘境' : '干线核心'}</span>
        <span>{place.category}</span>
        {place.suggestedDay ? <span>{place.suggestedDay}</span> : null}
      </div>

      <p className="knowledge-place-summary">{place.summary}</p>

      <div className="map-detail-metrics">
        <span>
          <strong>{displayPrice(place.ticketCny)}</strong> 门票
        </span>
        <span>
          <strong>{place.visitHours || '待确认'}</strong> 游玩
        </span>
        <span>
          <strong>{place.altitudeM || '待确认'}</strong> 海拔
        </span>
      </div>

      <dl className="knowledge-place-facts">
        <div>
          <dt>推荐</dt>
          <dd>{place.recommendation || '知识库未评级'}</dd>
        </div>
        <div>
          <dt>拍摄</dt>
          <dd>{place.bestTime || '知识库未覆盖'}</dd>
        </div>
        {place.photoTips ? (
          <div>
            <dt>机位</dt>
            <dd>{place.photoTips}</dd>
          </div>
        ) : null}
        <div>
          <dt>道路</dt>
          <dd>{place.roadRequirement || '知识库未覆盖'}</dd>
        </div>
        <div>
          <dt>信号</dt>
          <dd>{place.signal || '知识库未覆盖'}</dd>
        </div>
        {place.openTime ? (
          <div>
            <dt>开放</dt>
            <dd>{place.openTime}</dd>
          </div>
        ) : null}
      </dl>

      <KnowledgeReferencePanel place={place} />

      <PlaceMediaGallery
        roadbook={roadbook}
        stop={stop}
        readOnly={readOnly}
        onAddPhoto={onAddPhoto}
        onAddNote={onAddNote}
      />

      <div className="knowledge-place-actions">
        {!readOnly ? (
          <button
            type="button"
            className="map-detail-primary"
            disabled={selected}
            onClick={() => onAddPlace(place)}
          >
            {selected ? <Check size={15} /> : <Plus size={15} />}
            {selected ? '已在行程中' : '加入当前天'}
          </button>
        ) : null}
        <button type="button" className="map-detail-edit" onClick={onOpenMap}>
          <ExternalLink size={15} />
          在地图中查看
        </button>
      </div>
    </>
  )
}

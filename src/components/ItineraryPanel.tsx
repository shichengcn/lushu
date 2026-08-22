import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BedDouble,
  Bike,
  BusFront,
  CalendarDays,
  Car,
  Clock3,
  ChevronDown,
  Eye,
  EyeOff,
  Fuel,
  Landmark,
  MapPin,
  Pencil,
  Plane,
  Plus,
  RefreshCcw,
  Train,
  Trash2,
  Utensils,
  WalletCards,
  Footprints,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { PlaceThumbnail } from '@/components/PlaceMediaGallery'
import { placeLibraryEntry } from '@/lib/place-media'
import { DAY_COLORS, legCost, stopCost, totalCost, visibleStops } from '@/lib/roadbooks'
import type { PlaceType, Roadbook, TransportMode, TripStop } from '@/types'

interface ItineraryPanelProps {
  roadbook: Roadbook
  activeDayId: string
  expandedDayId: string | null
  selectedStopId: string | null
  readOnly: boolean
  onToggleDay: (dayId: string) => void
  onSelectStop: (stopId: string) => void
  onEditTrip: () => void
  onAddDay: () => void
  onDeleteDay: (dayId: string) => void
  onReverseDay: (dayId: string) => void
  onAddStop: (dayId: string) => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null, dayId: string) => void
  onMoveStop: (dayId: string, stopId: string, direction: -1 | 1) => void
  onMoveStopToDay: (sourceDayId: string, stopId: string, targetDayId: string) => void
  onToggleHidden: (dayId: string, stopId: string) => void
  onDeleteStop: (dayId: string, stopId: string) => void
}

const typeMeta: Record<
  PlaceType,
  { label: string; icon: typeof Landmark; className: string }
> = {
  scenic: { label: '景点', icon: Landmark, className: 'type-scenic' },
  food: { label: '餐饮', icon: Utensils, className: 'type-food' },
  hotel: { label: '住宿', icon: BedDouble, className: 'type-hotel' },
  transport: { label: '交通', icon: BusFront, className: 'type-transport' },
  fuel: { label: '加油', icon: Fuel, className: 'type-fuel' },
  other: { label: '地点', icon: MapPin, className: 'type-other' },
}

const modeMeta: Record<TransportMode, { label: string; icon: typeof Car }> = {
  driving: { label: '驾车', icon: Car },
  transit: { label: '公交', icon: BusFront },
  walking: { label: '步行', icon: Footprints },
  cycling: { label: '骑行', icon: Bike },
  train: { label: '火车', icon: Train },
  flight: { label: '飞机', icon: Plane },
}

const roadTypeLabels = {
  highway: '高速',
  national: '国道',
  provincial: '省道',
  county: '县乡道路',
  unpaved: '非铺装',
  mixed: '混合道路',
  unknown: '待确认',
}

function dayDistance(stops: TripStop[]) {
  const activeStops = stops.filter((stop) => !stop.hidden)
  return activeStops.reduce(
    (sum, stop, index) =>
      sum +
      (index > 0 && stop.legFromPrevious?.mode === 'driving'
        ? stop.legFromPrevious.distanceKm
        : 0),
    0,
  )
}

function formatCompactDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function previousVisibleStop(stops: TripStop[], currentIndex: number) {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (!stops[index].hidden) return stops[index]
  }
  return null
}

export function ItineraryPanel({
  roadbook,
  activeDayId,
  expandedDayId,
  selectedStopId,
  readOnly,
  onToggleDay,
  onSelectStop,
  onEditTrip,
  onAddDay,
  onDeleteDay,
  onReverseDay,
  onAddStop,
  onEditStop,
  onMoveStop,
  onMoveStopToDay,
  onToggleHidden,
  onDeleteStop,
}: ItineraryPanelProps) {
  return (
    <aside className="itinerary-panel">
      <header className="trip-overview">
        <button
          type="button"
          className="trip-title-button"
          onClick={onEditTrip}
          disabled={readOnly}
          title={readOnly ? undefined : '编辑路书信息'}
        >
          <span className="trip-kicker">TRIP PLAN</span>
          <span className="trip-title">{roadbook.title}</span>
          {!readOnly ? <Pencil size={15} /> : null}
        </button>
        <p>{roadbook.summary}</p>
        <div className="trip-meta">
          <span>
            <strong>{roadbook.days.length}</strong> 天
          </span>
          <span>
            <strong>
              {roadbook.days.reduce((sum, day) => sum + visibleStops(day).length, 0)}
            </strong>{' '}
            站
          </span>
          <span>
            <strong>¥{totalCost(roadbook).toLocaleString('zh-CN')}</strong> 预算
          </span>
        </div>
      </header>

      <div className="continuous-itinerary" role="tablist" aria-label="按天行程">
        {roadbook.days.map((day, dayIndex) => (
          <section
            className={[
              'day-section',
              day.id === activeDayId ? 'is-active' : '',
              day.id === expandedDayId ? 'is-expanded' : '',
            ].filter(Boolean).join(' ')}
            key={day.id}
            onDragOver={(event) => {
              if (!readOnly) event.preventDefault()
            }}
            onDrop={(event) => {
              if (readOnly) return
              event.preventDefault()
              const sourceDayId = event.dataTransfer.getData('application/x-tuji-day')
              const stopId = event.dataTransfer.getData('application/x-tuji-stop')
              if (sourceDayId && stopId && sourceDayId !== day.id) {
                onMoveStopToDay(sourceDayId, stopId, day.id)
              }
            }}
          >
            <div
              className="day-toolbar"
              style={{ '--day-color': DAY_COLORS[dayIndex % DAY_COLORS.length] } as React.CSSProperties}
            >
              <button
                type="button"
                role="tab"
                aria-selected={day.id === activeDayId}
                aria-expanded={day.id === expandedDayId}
                className="day-heading"
                onClick={() => onToggleDay(day.id)}
              >
                <span className="day-number-large" aria-hidden="true">
                  <CalendarDays size={16} />
                  <b>第 {dayIndex + 1} 天</b>
                </span>
                <span className="day-heading-copy">
                  <small>
                    {formatCompactDate(day.date)} · {visibleStops(day).length} 个地点
                  </small>
                  <strong>{day.title}</strong>
                  <em>
                    {visibleStops(day)[0]?.name || '暂无节点'}
                    {visibleStops(day).length > 1
                      ? ` → ${visibleStops(day).at(-1)?.name}`
                      : ''}
                  </em>
                </span>
                <span className="day-distance">{dayDistance(day.stops).toFixed(0)} km</span>
                <ChevronDown className="day-expand-icon" size={18} />
              </button>
              {!readOnly ? (
                <div className="day-actions">
                  <button
                    type="button"
                    onClick={() => onReverseDay(day.id)}
                    title="反向排列"
                    aria-label={`反向排列第${dayIndex + 1}天路线`}
                    disabled={visibleStops(day).length < 2}
                  >
                    <RefreshCcw size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteDay(day.id)}
                    title="删除当天"
                    aria-label={`删除第${dayIndex + 1}天`}
                    disabled={roadbook.days.length === 1}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : null}
            </div>

            <div
              className="day-collapsible-region"
              aria-hidden={day.id !== expandedDayId}
              inert={day.id !== expandedDayId}
            >
              <div className="day-collapsible-content">
                <div className="day-stop-list">
              {!day.stops.length ? (
                <div className="empty-day compact">
                  <MapPin size={23} />
                  <strong>这一天还没有安排</strong>
                </div>
              ) : null}

              {day.stops.map((stop, index) => {
                const meta = typeMeta[stop.type]
                const TypeIcon = meta.icon
                const previous = previousVisibleStop(day.stops, index)
                const leg = !stop.hidden && previous ? stop.legFromPrevious : undefined
                const mode = leg ? modeMeta[leg.mode] : null
                const ModeIcon = mode?.icon
                const cost = stopCost(stop)
                const routeCost = legCost(leg)
                const travelerMap = roadbook.travelers.filter((traveler) =>
                  stop.participantIds.includes(traveler.id),
                )
                const visibleOrdinal = stop.hidden
                  ? null
                  : day.stops
                      .slice(0, index + 1)
                      .filter((candidate) => !candidate.hidden).length
                const photo = placeLibraryEntry(roadbook, stop).photos[0]

                return (
                  <div className={`stop-group${stop.hidden ? ' is-hidden' : ''}`} key={stop.id}>
                    {leg && mode && ModeIcon ? (
                      <button
                        type="button"
                        className="leg-row"
                        onClick={() => !readOnly && onEditStop(stop, previous, day.id)}
                        disabled={readOnly}
                        title={readOnly ? undefined : '编辑交通方式、路况和路段费用'}
                      >
                        <span className="leg-line" />
                        <span className="leg-data">
                          <ModeIcon size={14} />
                          {mode.label}
                          <b>{leg.distanceKm.toFixed(1)} km</b>
                          <span>{leg.durationMinutes} 分钟</span>
                          <i>{leg.roadNames?.[0] || roadTypeLabels[leg.roadType]}</i>
                          {leg.signal === 'none' ? (
                            <WifiOff size={13} className="signal-none" />
                          ) : leg.signal === 'weak' ? (
                            <Wifi size={13} className="signal-weak" />
                          ) : null}
                          {routeCost > 0 ? <em>¥{routeCost}</em> : null}
                        </span>
                      </button>
                    ) : null}

                    <article
                      draggable={!readOnly}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/x-tuji-day', day.id)
                        event.dataTransfer.setData('application/x-tuji-stop', stop.id)
                      }}
                      className={`stop-item${selectedStopId === stop.id ? ' is-selected' : ''}`}
                      style={
                        {
                          '--day-color': DAY_COLORS[dayIndex % DAY_COLORS.length],
                        } as React.CSSProperties
                      }
                    >
                      <button
                        type="button"
                        className="stop-index"
                        onClick={() => onSelectStop(stop.id)}
                        aria-label={`在地图上查看${stop.name}`}
                      >
                        {stop.hidden ? (
                          <span className="stop-index-hidden" aria-hidden="true">
                            <EyeOff size={18} />
                            <small>隐藏</small>
                          </span>
                        ) : (
                          <>
                            <span className="stop-index-marker" aria-hidden="true">
                              <MapPin size={40} />
                              <b>{visibleOrdinal}</b>
                            </span>
                            <small className="stop-index-kind">节点</small>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="stop-main"
                        onClick={() => onSelectStop(stop.id)}
                      >
                        <span className={`stop-type ${meta.className}`}>
                          <TypeIcon size={14} />
                          {meta.label}
                          {stop.hidden ? <i>已隐藏</i> : null}
                        </span>
                        <span className="stop-title-row">
                          {photo ? (
                            <PlaceThumbnail photo={photo} />
                          ) : null}
                          <strong>{stop.name}</strong>
                        </span>
                        <small>{stop.address || '尚未填写地址'}</small>
                        <span className="stop-timing">
                          <Clock3 size={13} />
                          {stop.arrivalTime} - {stop.departureTime}
                          <i>{stop.stayMinutes} 分钟</i>
                        </span>
                        {travelerMap.length ? (
                          <span className="stop-travelers">
                            {travelerMap.map((traveler) => (
                              <i key={traveler.id} style={{ '--traveler-color': traveler.color } as React.CSSProperties}>
                                {traveler.name}
                              </i>
                            ))}
                          </span>
                        ) : null}
                        {cost > 0 ? (
                          <span className="stop-cost">
                            <WalletCards size={13} />¥{cost.toLocaleString('zh-CN')}
                            <i>{stop.expenses.length} 项</i>
                          </span>
                        ) : null}
                        {stop.notes.length ? <p>{stop.notes[0].text}</p> : null}
                      </button>

                      {!readOnly ? (
                        <div className="stop-actions">
                          <button
                            type="button"
                            onClick={() => onMoveStop(day.id, stop.id, -1)}
                            disabled={index === 0}
                            aria-label="上移节点"
                            title="上移"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveStop(day.id, stop.id, 1)}
                            disabled={index === day.stops.length - 1}
                            aria-label="下移节点"
                            title="下移"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              dayIndex > 0 &&
                              onMoveStopToDay(day.id, stop.id, roadbook.days[dayIndex - 1].id)
                            }
                            disabled={dayIndex === 0}
                            aria-label="移动到前一天"
                            title="移到前一天"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              dayIndex < roadbook.days.length - 1 &&
                              onMoveStopToDay(day.id, stop.id, roadbook.days[dayIndex + 1].id)
                            }
                            disabled={dayIndex === roadbook.days.length - 1}
                            aria-label="移动到后一天"
                            title="移到后一天"
                          >
                            <ArrowRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleHidden(day.id, stop.id)}
                            aria-label={stop.hidden ? '显示节点' : '隐藏节点'}
                            title={stop.hidden ? '恢复到行程' : '从路线和汇总隐藏'}
                          >
                            {stop.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditStop(stop, previous, day.id)}
                            aria-label="编辑节点"
                            title="编辑"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStop(day.id, stop.id)}
                            aria-label="删除节点"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                    </article>
                  </div>
                )
              })}
                </div>

                {!readOnly ? (
                  <button type="button" className="add-stop-button" onClick={() => onAddStop(day.id)}>
                    <Plus size={17} />
                    添加到第 {dayIndex + 1} 天
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ))}
        {!readOnly ? (
          <button type="button" className="add-day-vertical" onClick={onAddDay}>
            <Plus size={18} />
            在当前天后添加一天
          </button>
        ) : null}
      </div>
    </aside>
  )
}

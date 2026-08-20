import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Bike,
  BusFront,
  Car,
  ChevronDown,
  ChevronUp,
  Clock3,
  Footprints,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Utensils,
  WalletCards,
} from 'lucide-react'
import { DAY_COLORS, totalCost } from '@/lib/roadbooks'
import type { Roadbook, TransportMode, TripStop } from '@/types'

interface ItineraryPanelProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  readOnly: boolean
  onSelectDay: (dayId: string) => void
  onSelectStop: (stopId: string) => void
  onEditTrip: () => void
  onAddDay: () => void
  onDeleteDay: (dayId: string) => void
  onReverseDay: (dayId: string) => void
  onAddStop: () => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null) => void
  onMoveStop: (stopId: string, direction: -1 | 1) => void
  onDeleteStop: (stopId: string) => void
}

const typeMeta = {
  scenic: { label: '景点', icon: Landmark, className: 'type-scenic' },
  food: { label: '餐饮', icon: Utensils, className: 'type-food' },
  hotel: { label: '住宿', icon: BedDouble, className: 'type-hotel' },
  transport: { label: '交通', icon: BusFront, className: 'type-transport' },
  other: { label: '地点', icon: MapPin, className: 'type-other' },
}

const modeMeta: Record<TransportMode, { label: string; icon: typeof Car }> = {
  driving: { label: '驾车', icon: Car },
  transit: { label: '公交', icon: BusFront },
  walking: { label: '步行', icon: Footprints },
  cycling: { label: '骑行', icon: Bike },
}

function dayDistance(stops: TripStop[]) {
  return stops.reduce((sum, stop) => sum + (stop.legFromPrevious?.distanceKm || 0), 0)
}

function formatCompactDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function ItineraryPanel({
  roadbook,
  activeDayId,
  selectedStopId,
  readOnly,
  onSelectDay,
  onSelectStop,
  onEditTrip,
  onAddDay,
  onDeleteDay,
  onReverseDay,
  onAddStop,
  onEditStop,
  onMoveStop,
  onDeleteStop,
}: ItineraryPanelProps) {
  const activeDay = roadbook.days.find((day) => day.id === activeDayId) || roadbook.days[0]
  const activeDayIndex = Math.max(
    0,
    roadbook.days.findIndex((day) => day.id === activeDay?.id),
  )

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
            <strong>{roadbook.days.flatMap((day) => day.stops).length}</strong> 站
          </span>
          <span>
            <strong>¥{totalCost(roadbook).toLocaleString('zh-CN')}</strong> 预算
          </span>
        </div>
      </header>

      <div className="day-strip" role="tablist" aria-label="行程日期">
        {roadbook.days.map((day, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={day.id === activeDayId}
            className={day.id === activeDayId ? 'is-active' : ''}
            key={day.id}
            onClick={() => onSelectDay(day.id)}
            style={{ '--day-color': DAY_COLORS[index % DAY_COLORS.length] } as React.CSSProperties}
          >
            <strong>D{index + 1}</strong>
            <span>{formatCompactDate(day.date)}</span>
          </button>
        ))}
        {!readOnly ? (
          <button
            type="button"
            className="add-day"
            onClick={onAddDay}
            aria-label="添加一天"
            title="添加一天"
          >
            <Plus size={18} />
          </button>
        ) : null}
      </div>

      {activeDay ? (
        <div className="day-content">
          <div className="day-toolbar">
            <div>
              <span>第 {activeDayIndex + 1} 天</span>
              <strong>{activeDay.title}</strong>
            </div>
            <span className="day-distance">约 {dayDistance(activeDay.stops).toFixed(1)} km</span>
            {!readOnly ? (
              <div className="day-actions">
                <button
                  type="button"
                  onClick={() => onReverseDay(activeDay.id)}
                  title="反向排列"
                  aria-label="反向排列当天路线"
                  disabled={activeDay.stops.length < 2}
                >
                  <RefreshCcw size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteDay(activeDay.id)}
                  title="删除当天"
                  aria-label="删除当天"
                  disabled={roadbook.days.length === 1}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="stop-list">
            {!activeDay.stops.length ? (
              <div className="empty-day">
                <MapPin size={26} />
                <strong>这一天还没有安排</strong>
                <span>添加第一个地点，路线将显示在地图上</span>
              </div>
            ) : null}

            {activeDay.stops.map((stop, index) => {
              const meta = typeMeta[stop.type]
              const TypeIcon = meta.icon
              const leg = stop.legFromPrevious
              const mode = leg ? modeMeta[leg.mode] : null
              const ModeIcon = mode?.icon

              return (
                <div className="stop-group" key={stop.id}>
                  {leg && mode && ModeIcon ? (
                    <button
                      type="button"
                      className="leg-row"
                      onClick={() => !readOnly && onEditStop(stop, activeDay.stops[index - 1])}
                      disabled={readOnly}
                      title={readOnly ? undefined : '编辑交通方式'}
                    >
                      <span className="leg-line" />
                      <span className="leg-data">
                        <ModeIcon size={14} />
                        {mode.label}
                        <b>{leg.distanceKm.toFixed(1)} km</b>
                        <span>{leg.durationMinutes} 分钟</span>
                      </span>
                    </button>
                  ) : null}

                  <article
                    className={`stop-item${selectedStopId === stop.id ? ' is-selected' : ''}`}
                    style={
                      {
                        '--day-color': DAY_COLORS[activeDayIndex % DAY_COLORS.length],
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className="stop-index"
                      onClick={() => onSelectStop(stop.id)}
                      aria-label={`在地图上查看${stop.name}`}
                    >
                      {index + 1}
                    </button>
                    <button
                      type="button"
                      className="stop-main"
                      onClick={() => onSelectStop(stop.id)}
                    >
                      <span className={`stop-type ${meta.className}`}>
                        <TypeIcon size={14} />
                        {meta.label}
                      </span>
                      <strong>{stop.name}</strong>
                      <small>{stop.address || '尚未填写地址'}</small>
                      <span className="stop-timing">
                        <Clock3 size={13} />
                        {stop.arrivalTime} - {stop.departureTime}
                        <i>{stop.stayMinutes} 分钟</i>
                      </span>
                      {stop.cost > 0 ? (
                        <span className="stop-cost">
                          <WalletCards size={13} />¥{stop.cost.toLocaleString('zh-CN')}
                        </span>
                      ) : null}
                      {stop.notes ? <p>{stop.notes}</p> : null}
                    </button>

                    {!readOnly ? (
                      <div className="stop-actions">
                        <button
                          type="button"
                          onClick={() => onMoveStop(stop.id, -1)}
                          disabled={index === 0}
                          aria-label="上移节点"
                          title="上移"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveStop(stop.id, 1)}
                          disabled={index === activeDay.stops.length - 1}
                          aria-label="下移节点"
                          title="下移"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditStop(stop, activeDay.stops[index - 1] || null)}
                          aria-label="编辑节点"
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStop(stop.id)}
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
            <button type="button" className="add-stop-button" onClick={onAddStop}>
              <Plus size={17} />
              添加地点
            </button>
          ) : null}

          <button
            type="button"
            className="scroll-cue"
            onClick={() => document.querySelector('.stop-list')?.scrollTo({ top: 99999 })}
            title="查看最后一站"
          >
            <ChevronDown size={15} />
            行程末尾
            <ChevronUp size={15} />
          </button>
        </div>
      ) : null}
    </aside>
  )
}

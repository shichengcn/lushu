import { useState } from 'react'
import {
  BedDouble,
  Bike,
  BusFront,
  Car,
  Footprints,
  Landmark,
  LoaderCircle,
  MapPin,
  Search,
  Utensils,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { estimateLeg, searchPlaces } from '@/lib/amap'
import { createStop } from '@/lib/roadbooks'
import type { PlaceSuggestion, PlaceType, TransportMode, TripStop } from '@/types'

interface PlaceEditorDialogProps {
  open: boolean
  stop: TripStop | null
  previousStop: TripStop | null
  onOpenChange: (open: boolean) => void
  onSave: (stop: TripStop) => void
}

const placeTypes: Array<{ value: PlaceType; label: string; icon: typeof Landmark }> = [
  { value: 'scenic', label: '景点', icon: Landmark },
  { value: 'food', label: '餐厅', icon: Utensils },
  { value: 'hotel', label: '酒店', icon: BedDouble },
  { value: 'transport', label: '交通', icon: BusFront },
  { value: 'other', label: '其他', icon: MapPin },
]

const transportModes: Array<{
  value: TransportMode
  label: string
  icon: typeof Car
}> = [
  { value: 'driving', label: '驾车', icon: Car },
  { value: 'transit', label: '公交', icon: BusFront },
  { value: 'walking', label: '步行', icon: Footprints },
  { value: 'cycling', label: '骑行', icon: Bike },
]

export function PlaceEditorDialog({
  open,
  stop,
  previousStop,
  onOpenChange,
  onSave,
}: PlaceEditorDialogProps) {
  const [draft, setDraft] = useState<TripStop>(() => {
    const initial = stop ? structuredClone(stop) : createStop()
    if (!previousStop) initial.legFromPrevious = undefined
    return initial
  })
  const [query, setQuery] = useState(stop?.name || '')
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const patchDraft = <K extends keyof TripStop>(key: K, value: TripStop[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const places = await searchPlaces(query)
      setResults(places)
    } catch (error) {
      setResults([])
      setSearchError(error instanceof Error ? error.message : '搜索失败，请稍后重试')
    } finally {
      setSearching(false)
    }
  }

  const selectSuggestion = (place: PlaceSuggestion) => {
    setDraft((current) => {
      const mode = current.legFromPrevious?.mode || 'driving'
      const estimate = previousStop ? estimateLeg(previousStop.location, place.location, mode) : null
      return {
        ...current,
        name: place.name,
        address: place.address,
        location: place.location,
        legFromPrevious:
          previousStop && estimate
            ? {
                mode,
                ...estimate,
              }
            : undefined,
      }
    })
    setQuery(place.name)
    setResults([])
  }

  const handleModeChange = (mode: TransportMode) => {
    setDraft((current) => ({
      ...current,
      legFromPrevious: previousStop
        ? {
            mode,
            ...estimateLeg(previousStop.location, current.location, mode),
          }
        : undefined,
    }))
  }

  const handleSubmit = () => {
    if (!draft.name.trim()) {
      setSearchError('请填写地点名称')
      return
    }
    onSave({ ...draft, name: draft.name.trim(), address: draft.address.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="place-dialog">
        <DialogHeader>
          <DialogTitle>{stop ? '编辑行程节点' : '添加行程节点'}</DialogTitle>
          <DialogDescription>
            搜索并选择地点，再补充停留时间和预算。
          </DialogDescription>
        </DialogHeader>

        <div className="place-form">
          <div className="field-block">
            <label htmlFor="place-search">地点</label>
            <div className="search-control">
              <Input
                id="place-search"
                value={query}
                placeholder="搜索景点、餐厅或酒店"
                onChange={(event) => {
                  setQuery(event.target.value)
                  patchDraft('name', event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearch()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void handleSearch()}
                disabled={searching}
                aria-label="搜索地点"
                title="搜索地点"
              >
                {searching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
              </Button>
            </div>
            {searchError ? <p className="form-error">{searchError}</p> : null}
            {results.length ? (
              <div className="place-results" role="listbox" aria-label="地点搜索结果">
                {results.map((place) => (
                  <button
                    type="button"
                    role="option"
                    key={place.id}
                    onClick={() => selectSuggestion(place)}
                  >
                    <MapPin size={16} />
                    <span>
                      <strong>{place.name}</strong>
                      <small>{place.address || '暂无地址信息'}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="field-block">
            <span className="field-label">地点类型</span>
            <div className="segmented-options place-types">
              {placeTypes.map((type) => {
                const Icon = type.icon
                return (
                  <button
                    type="button"
                    className={draft.type === type.value ? 'is-active' : ''}
                    key={type.value}
                    onClick={() => patchDraft('type', type.value)}
                  >
                    <Icon size={16} />
                    {type.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="form-grid">
            <div className="field-block">
              <label htmlFor="arrival-time">到达时间</label>
              <Input
                id="arrival-time"
                type="time"
                value={draft.arrivalTime}
                onChange={(event) => patchDraft('arrivalTime', event.target.value)}
              />
            </div>
            <div className="field-block">
              <label htmlFor="departure-time">离开时间</label>
              <Input
                id="departure-time"
                type="time"
                value={draft.departureTime}
                onChange={(event) => patchDraft('departureTime', event.target.value)}
              />
            </div>
            <div className="field-block">
              <label htmlFor="stay-minutes">停留（分钟）</label>
              <Input
                id="stay-minutes"
                type="number"
                min="0"
                value={draft.stayMinutes}
                onChange={(event) => patchDraft('stayMinutes', Number(event.target.value) || 0)}
              />
            </div>
            <div className="field-block">
              <label htmlFor="place-cost">花费（元）</label>
              <Input
                id="place-cost"
                type="number"
                min="0"
                step="1"
                value={draft.cost}
                onChange={(event) => patchDraft('cost', Number(event.target.value) || 0)}
              />
            </div>
          </div>

          {previousStop ? (
            <div className="field-block">
              <span className="field-label">从上一站出发</span>
              <div className="segmented-options">
                {transportModes.map((mode) => {
                  const Icon = mode.icon
                  return (
                    <button
                      type="button"
                      className={draft.legFromPrevious?.mode === mode.value ? 'is-active' : ''}
                      key={mode.value}
                      onClick={() => handleModeChange(mode.value)}
                    >
                      <Icon size={16} />
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="field-block">
            <label htmlFor="place-address">地址</label>
            <Input
              id="place-address"
              value={draft.address}
              placeholder="选择搜索结果后自动填写，也可手动输入"
              onChange={(event) => patchDraft('address', event.target.value)}
            />
          </div>

          <div className="field-block">
            <label htmlFor="place-notes">备注</label>
            <Textarea
              id="place-notes"
              value={draft.notes}
              placeholder="预约信息、门票、取车提示等"
              rows={3}
              onChange={(event) => patchDraft('notes', event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit}>
            保存节点
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

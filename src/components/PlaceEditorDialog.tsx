import { useRef, useState } from 'react'
import {
  BedDouble,
  Bike,
  BusFront,
  Car,
  Fuel,
  ImagePlus,
  Landmark,
  LoaderCircle,
  MapPin,
  Plane,
  Plus,
  Search,
  Train,
  Trash2,
  Utensils,
  Footprints,
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
import {
  createExpense,
  createLeg,
  createNote,
  createStop,
  EXPENSE_CATEGORY_LABELS,
} from '@/lib/roadbooks'
import type {
  ExpenseCategory,
  ExpenseItem,
  PlaceSuggestion,
  PlaceType,
  RoadType,
  SignalLevel,
  TransportMode,
  Traveler,
  TripNote,
  TripStop,
} from '@/types'

interface PlaceEditorDialogProps {
  open: boolean
  stop: TripStop | null
  previousStop: TripStop | null
  travelers: Traveler[]
  onOpenChange: (open: boolean) => void
  onSave: (stop: TripStop) => void
}

const placeTypes: Array<{ value: PlaceType; label: string; icon: typeof Landmark }> = [
  { value: 'scenic', label: '景点', icon: Landmark },
  { value: 'food', label: '餐厅', icon: Utensils },
  { value: 'hotel', label: '酒店', icon: BedDouble },
  { value: 'transport', label: '交通', icon: BusFront },
  { value: 'fuel', label: '加油', icon: Fuel },
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
  { value: 'train', label: '火车', icon: Train },
  { value: 'flight', label: '飞机', icon: Plane },
]

const roadTypes: Array<{ value: RoadType; label: string }> = [
  { value: 'highway', label: '高速' },
  { value: 'national', label: '国道' },
  { value: 'provincial', label: '省道' },
  { value: 'county', label: '县乡道路' },
  { value: 'unpaved', label: '非铺装路' },
  { value: 'mixed', label: '混合道路' },
  { value: 'unknown', label: '待确认' },
]

const signalLevels: Array<{ value: SignalLevel; label: string }> = [
  { value: 'good', label: '信号良好' },
  { value: 'weak', label: '信号间歇' },
  { value: 'none', label: '无信号' },
  { value: 'unknown', label: '待确认' },
]

async function compressImage(file: File) {
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
  const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.76)
}

function ExpenseEditor({
  title,
  expenses,
  travelers,
  onChange,
}: {
  title: string
  expenses: ExpenseItem[]
  travelers: Traveler[]
  onChange: (expenses: ExpenseItem[]) => void
}) {
  const patch = (id: string, value: Partial<ExpenseItem>) =>
    onChange(expenses.map((expense) => (expense.id === id ? { ...expense, ...value } : expense)))

  return (
    <div className="field-block">
      <div className="field-heading">
        <span className="field-label">{title}</span>
        <button
          type="button"
          onClick={() => onChange([...expenses, createExpense()])}
          aria-label={`添加${title}`}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      <div className="expense-editor">
        {expenses.map((expense) => (
          <div className="expense-row" key={expense.id}>
            <Input
              value={expense.label}
              placeholder="项目名称"
              aria-label="费用项目名称"
              onChange={(event) => patch(expense.id, { label: event.target.value })}
            />
            <select
              value={expense.category}
              aria-label="费用分类"
              onChange={(event) =>
                patch(expense.id, { category: event.target.value as ExpenseCategory })
              }
            >
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min="0"
              step="1"
              value={expense.amount}
              aria-label="费用金额"
              onChange={(event) => patch(expense.id, { amount: Number(event.target.value) || 0 })}
            />
            {travelers.length ? (
              <select
                value={expense.payerId || ''}
                aria-label="付款人"
                onChange={(event) => patch(expense.id, { payerId: event.target.value || undefined })}
              >
                <option value="">共同</option>
                {travelers.map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="icon-danger"
              onClick={() => onChange(expenses.filter((item) => item.id !== expense.id))}
              aria-label={`删除${expense.label || '费用项'}`}
              title="删除费用项"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!expenses.length ? <span className="empty-editor-line">暂无费用项目</span> : null}
      </div>
    </div>
  )
}

function NoteEditor({
  title,
  notes,
  onChange,
}: {
  title: string
  notes: TripNote[]
  onChange: (notes: TripNote[]) => void
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [imageError, setImageError] = useState('')
  const patch = (id: string, value: Partial<TripNote>) =>
    onChange(notes.map((note) => (note.id === id ? { ...note, ...value } : note)))

  const upload = async (noteId: string, file?: File) => {
    if (!file) return
    try {
      setImageError('')
      patch(noteId, { imageDataUrl: await compressImage(file) })
    } catch (error) {
      setImageError(error instanceof Error ? error.message : '图片处理失败')
    }
  }

  return (
    <div className="field-block">
      <div className="field-heading">
        <span className="field-label">{title}</span>
        <button
          type="button"
          onClick={() => onChange([...notes, createNote()])}
          aria-label={`添加${title}`}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      <div className="note-editor">
        {notes.map((note, index) => (
          <div className="note-row" key={note.id}>
            <span>{index + 1}</span>
            <Textarea
              value={note.text}
              placeholder="记录预约、路况、拍摄位置或提醒"
              rows={2}
              aria-label={`${title}${index + 1}`}
              onChange={(event) => patch(note.id, { text: event.target.value })}
            />
            {note.imageDataUrl ? (
              <button
                type="button"
                className="note-image"
                onClick={() => inputRefs.current[note.id]?.click()}
                title="替换图片"
              >
                <img src={note.imageDataUrl} alt="" />
              </button>
            ) : (
              <button
                type="button"
                className="note-upload"
                onClick={() => inputRefs.current[note.id]?.click()}
                aria-label="添加备注图片"
                title="添加图片"
              >
                <ImagePlus size={17} />
              </button>
            )}
            <input
              ref={(element) => {
                inputRefs.current[note.id] = element
              }}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => void upload(note.id, event.target.files?.[0])}
            />
            <button
              type="button"
              className="icon-danger"
              onClick={() => onChange(notes.filter((item) => item.id !== note.id))}
              aria-label={`删除${title}${index + 1}`}
              title="删除备注"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!notes.length ? <span className="empty-editor-line">暂无备注</span> : null}
        {imageError ? <p className="form-error">{imageError}</p> : null}
      </div>
    </div>
  )
}

export function PlaceEditorDialog({
  open,
  stop,
  previousStop,
  travelers,
  onOpenChange,
  onSave,
}: PlaceEditorDialogProps) {
  const [draft, setDraft] = useState<TripStop>(() => {
    const initial = stop
      ? structuredClone(stop)
      : createStop(travelers.map((traveler) => traveler.id))
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

  const patchLeg = (value: Partial<NonNullable<TripStop['legFromPrevious']>>) => {
    if (!previousStop) return
    setDraft((current) => ({
      ...current,
      legFromPrevious: {
        ...(current.legFromPrevious ||
          createLeg(
            'driving',
            estimateLeg(previousStop.location, current.location, 'driving').distanceKm,
            estimateLeg(previousStop.location, current.location, 'driving').durationMinutes,
          )),
        ...value,
      },
    }))
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
                ...(current.legFromPrevious || createLeg(mode, 0, 0)),
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
    const estimate = previousStop
      ? estimateLeg(previousStop.location, draft.location, mode)
      : { distanceKm: 0, durationMinutes: 0 }
    patchLeg({ mode, ...estimate })
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
          <DialogDescription>完善地点、同行角色、费用、路段和多条图文备注。</DialogDescription>
        </DialogHeader>

        <div className="place-form">
          <div className="field-block">
            <label htmlFor="place-search">地点</label>
            <div className="search-control">
              <Input
                id="place-search"
                value={query}
                placeholder="搜索景点、餐厅、酒店或加油站"
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

          {travelers.length ? (
            <div className="field-block">
              <span className="field-label">参与角色</span>
              <div className="traveler-options">
                {travelers.map((traveler) => {
                  const selected = draft.participantIds.includes(traveler.id)
                  return (
                    <label key={traveler.id}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          patchDraft(
                            'participantIds',
                            selected
                              ? draft.participantIds.filter((id) => id !== traveler.id)
                              : [...draft.participantIds, traveler.id],
                          )
                        }
                      />
                      <i style={{ background: traveler.color }} />
                      {traveler.name}
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

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
              <label htmlFor="place-address">地址</label>
              <Input
                id="place-address"
                value={draft.address}
                placeholder="选择搜索结果后自动填写"
                onChange={(event) => patchDraft('address', event.target.value)}
              />
            </div>
          </div>

          <ExpenseEditor
            title="地点费用"
            expenses={draft.expenses}
            travelers={travelers}
            onChange={(expenses) => patchDraft('expenses', expenses)}
          />

          {previousStop && draft.legFromPrevious ? (
            <div className="route-editor">
              <div className="route-editor-title">
                <Car size={16} />
                从「{previousStop.name}」到本站
              </div>
              <div className="field-block">
                <span className="field-label">交通方式</span>
                <div className="segmented-options transport-options">
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
              <div className="form-grid">
                <div className="field-block">
                  <label htmlFor="route-distance">距离（公里）</label>
                  <Input
                    id="route-distance"
                    type="number"
                    min="0"
                    step="0.1"
                    value={draft.legFromPrevious.distanceKm}
                    onChange={(event) => patchLeg({ distanceKm: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="route-duration">时长（分钟）</label>
                  <Input
                    id="route-duration"
                    type="number"
                    min="0"
                    value={draft.legFromPrevious.durationMinutes}
                    onChange={(event) =>
                      patchLeg({ durationMinutes: Number(event.target.value) || 0 })
                    }
                  />
                </div>
                <div className="field-block">
                  <label htmlFor="road-type">道路类型</label>
                  <select
                    id="road-type"
                    value={draft.legFromPrevious.roadType}
                    onChange={(event) => patchLeg({ roadType: event.target.value as RoadType })}
                  >
                    {roadTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-block">
                  <label htmlFor="signal-level">手机信号</label>
                  <select
                    id="signal-level"
                    value={draft.legFromPrevious.signal}
                    onChange={(event) =>
                      patchLeg({ signal: event.target.value as SignalLevel })
                    }
                  >
                    {signalLevels.map((signal) => (
                      <option key={signal.value} value={signal.value}>
                        {signal.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ExpenseEditor
                title="路段费用"
                expenses={draft.legFromPrevious.expenses}
                travelers={travelers}
                onChange={(expenses) => patchLeg({ expenses })}
              />
              <NoteEditor
                title="路段备注"
                notes={draft.legFromPrevious.notes}
                onChange={(notes) => patchLeg({ notes })}
              />
            </div>
          ) : null}

          <NoteEditor
            title="地点备注"
            notes={draft.notes}
            onChange={(notes) => patchDraft('notes', notes)}
          />
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  Check,
  Download,
  Eye,
  FileUp,
  Library,
  Map as MapIcon,
  MoreHorizontal,
  Navigation,
  Pencil,
  Save,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { AmapCanvas } from '@/components/AmapCanvas'
import { ItineraryPanel } from '@/components/ItineraryPanel'
import { PlaceEditorDialog } from '@/components/PlaceEditorDialog'
import { ShareDialog } from '@/components/ShareDialog'
import { TripLibraryDialog } from '@/components/TripLibraryDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { estimateLeg } from '@/lib/amap'
import {
  createDay,
  createId,
  createRoadbook,
  downloadRoadbook,
  importRoadbook,
  loadRoadbooks,
  parseSharedRoadbook,
  reverseDay,
  saveRoadbooks,
} from '@/lib/roadbooks'
import type { Roadbook, TripStop } from '@/types'

const INITIAL_SHARED_ROADBOOK = parseSharedRoadbook()
const INITIAL_ROADBOOKS = loadRoadbooks()

interface ResolvedLeg {
  dayId: string
  stopId: string
  distanceKm: number
  durationMinutes: number
}

function relinkStops(stops: TripStop[]) {
  return stops.map((stop, index) => {
    if (index === 0) {
      const { legFromPrevious: _leg, ...firstStop } = stop
      return firstStop
    }
    const previous = stops[index - 1]
    const mode = stop.legFromPrevious?.mode || 'driving'
    return {
      ...stop,
      legFromPrevious: {
        mode,
        ...estimateLeg(previous.location, stop.location, mode),
      },
    }
  })
}

function nextDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function App() {
  const [roadbooks, setRoadbooks] = useState<Roadbook[]>(() =>
    INITIAL_SHARED_ROADBOOK ? [INITIAL_SHARED_ROADBOOK, ...INITIAL_ROADBOOKS] : INITIAL_ROADBOOKS,
  )
  const [activeRoadbookId, setActiveRoadbookId] = useState(
    () => INITIAL_SHARED_ROADBOOK?.id || INITIAL_ROADBOOKS[0].id,
  )
  const [activeDayId, setActiveDayId] = useState('')
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'view'>(INITIAL_SHARED_ROADBOOK ? 'view' : 'edit')
  const [mobilePane, setMobilePane] = useState<'plan' | 'map'>('plan')
  const [isSharedPreview, setIsSharedPreview] = useState(Boolean(INITIAL_SHARED_ROADBOOK))
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [placeOpen, setPlaceOpen] = useState(false)
  const [editingStop, setEditingStop] = useState<TripStop | null>(null)
  const [previousStop, setPreviousStop] = useState<TripStop | null>(null)
  const [tripDraft, setTripDraft] = useState<Roadbook | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const activeRoadbook =
    roadbooks.find((roadbook) => roadbook.id === activeRoadbookId) || roadbooks[0]
  const activeDay =
    activeRoadbook.days.find((day) => day.id === activeDayId) || activeRoadbook.days[0]
  const readOnly = mode === 'view' || isSharedPreview

  useEffect(() => {
    const persisted = isSharedPreview
      ? roadbooks.filter((roadbook) => roadbook.id !== INITIAL_SHARED_ROADBOOK?.id)
      : roadbooks
    if (persisted.length) saveRoadbooks(persisted)
  }, [isSharedPreview, roadbooks])

  const updateRoadbook = useCallback(
    (transform: (roadbook: Roadbook) => Roadbook, touch = true) => {
      setRoadbooks((current) =>
        current.map((roadbook) => {
          if (roadbook.id !== activeRoadbookId) return roadbook
          const updated = transform(roadbook)
          return touch ? { ...updated, updatedAt: new Date().toISOString() } : updated
        }),
      )
    },
    [activeRoadbookId],
  )

  const handleRoutesResolved = useCallback(
    (legs: ResolvedLeg[]) => {
      if (!legs.length) return
      updateRoadbook(
        (roadbook) => {
          let changed = false
          const days = roadbook.days.map((day) => ({
            ...day,
            stops: day.stops.map((stop) => {
              const resolved = legs.find((leg) => leg.dayId === day.id && leg.stopId === stop.id)
              if (!resolved || !stop.legFromPrevious) return stop
              const distanceChanged =
                Math.abs(stop.legFromPrevious.distanceKm - resolved.distanceKm) > 0.05
              const durationChanged =
                stop.legFromPrevious.durationMinutes !== resolved.durationMinutes
              if (!distanceChanged && !durationChanged) return stop
              changed = true
              return {
                ...stop,
                legFromPrevious: {
                  ...stop.legFromPrevious,
                  distanceKm: resolved.distanceKm,
                  durationMinutes: resolved.durationMinutes,
                },
              }
            }),
          }))
          return changed ? { ...roadbook, days } : roadbook
        },
        false,
      )
    },
    [updateRoadbook],
  )

  const handleSelectStop = useCallback(
    (stopId: string) => {
      const day = activeRoadbook.days.find((candidate) =>
        candidate.stops.some((stop) => stop.id === stopId),
      )
      if (day) setActiveDayId(day.id)
      setSelectedStopId(stopId)
    },
    [activeRoadbook.days],
  )

  const openAddStop = () => {
    setEditingStop(null)
    setPreviousStop(activeDay.stops.at(-1) || null)
    setPlaceOpen(true)
  }

  const openEditStop = (stop: TripStop, previous: TripStop | null) => {
    setEditingStop(stop)
    setPreviousStop(previous)
    setPlaceOpen(true)
  }

  const saveStop = (stop: TripStop) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) => {
        if (day.id !== activeDay.id) return day
        const exists = day.stops.some((candidate) => candidate.id === stop.id)
        const stops = exists
          ? day.stops.map((candidate) => (candidate.id === stop.id ? stop : candidate))
          : [...day.stops, stop]
        return { ...day, stops: relinkStops(stops) }
      }),
    }))
    setSelectedStopId(stop.id)
    toast.success(editingStop ? '节点已更新' : '节点已添加')
  }

  const moveStop = (stopId: string, direction: -1 | 1) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) => {
        if (day.id !== activeDay.id) return day
        const index = day.stops.findIndex((stop) => stop.id === stopId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= day.stops.length) return day
        const stops = [...day.stops]
        ;[stops[index], stops[target]] = [stops[target], stops[index]]
        return { ...day, stops: relinkStops(stops) }
      }),
    }))
  }

  const deleteStop = (stopId: string) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) =>
        day.id === activeDay.id
          ? { ...day, stops: relinkStops(day.stops.filter((stop) => stop.id !== stopId)) }
          : day,
      ),
    }))
    if (selectedStopId === stopId) setSelectedStopId(null)
    toast.success('节点已删除')
  }

  const addDay = () => {
    const date = nextDate(activeRoadbook.days.at(-1)?.date || activeRoadbook.endDate)
    const day = createDay(activeRoadbook.days.length, date)
    updateRoadbook((roadbook) => ({
      ...roadbook,
      endDate: date,
      days: [...roadbook.days, day],
    }))
    setActiveDayId(day.id)
  }

  const deleteDay = (dayId: string) => {
    if (activeRoadbook.days.length === 1) return
    const remaining = activeRoadbook.days.filter((day) => day.id !== dayId)
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: remaining,
      startDate: remaining[0].date,
      endDate: remaining.at(-1)?.date || remaining[0].date,
    }))
    setActiveDayId(remaining[0].id)
    setSelectedStopId(null)
    toast.success('当天行程已删除')
  }

  const reverseActiveDay = (dayId: string) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) => (day.id === dayId ? reverseDay(day) : day)),
    }))
    toast.success('路线已反向排列')
  }

  const createNewRoadbook = () => {
    const roadbook = createRoadbook()
    setRoadbooks((current) => [roadbook, ...current])
    setActiveRoadbookId(roadbook.id)
    setMode('edit')
    setIsSharedPreview(false)
    window.history.replaceState(null, '', window.location.pathname)
  }

  const duplicateRoadbook = (id: string) => {
    const source = roadbooks.find((roadbook) => roadbook.id === id)
    if (!source) return
    const timestamp = new Date().toISOString()
    const duplicate = {
      ...structuredClone(source),
      id: createId('roadbook'),
      title: `${source.title}（副本）`,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setRoadbooks((current) => [duplicate, ...current])
    toast.success('已创建副本')
  }

  const deleteRoadbook = (id: string) => {
    if (roadbooks.length === 1) return
    const remaining = roadbooks.filter((roadbook) => roadbook.id !== id)
    setRoadbooks(remaining)
    if (id === activeRoadbookId) setActiveRoadbookId(remaining[0].id)
    toast.success('路书已删除')
  }

  const saveSharedRoadbook = () => {
    setIsSharedPreview(false)
    setMode('edit')
    window.history.replaceState(null, '', window.location.pathname)
    toast.success('已保存到我的路书')
  }

  const openTripSettings = () => {
    setTripDraft(structuredClone(activeRoadbook))
    setSettingsOpen(true)
  }

  const saveTripSettings = () => {
    if (!tripDraft?.title.trim()) return
    updateRoadbook(() => ({ ...tripDraft, title: tripDraft.title.trim() }))
    setSettingsOpen(false)
    toast.success('路书信息已保存')
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = await importRoadbook(file)
      setRoadbooks((current) => [imported, ...current])
      setActiveRoadbookId(imported.id)
      setMode('edit')
      setIsSharedPreview(false)
      toast.success('路书导入成功')
    } catch {
      toast.error('导入失败，请选择有效的路书 JSON 文件')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const saveStatus = useMemo(() => {
    const time = new Date(activeRoadbook.updatedAt)
    return Number.isNaN(time.getTime())
      ? '已保存到本地'
      : `${time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 已保存`
  }, [activeRoadbook.updatedAt])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setLibraryOpen(true)}>
          <span className="brand-mark">
            <Navigation size={21} fill="currentColor" />
          </span>
          <strong>途迹</strong>
          <i />
          <span>路书</span>
        </button>

        <div className="save-status">
          <Check size={13} />
          {saveStatus}
        </div>

        <nav className="header-actions" aria-label="路书操作">
          {isSharedPreview ? (
            <Button type="button" size="sm" onClick={saveSharedRoadbook}>
              <Save size={15} />
              保存到我的路书
            </Button>
          ) : (
            <div className="mode-toggle" aria-label="查看模式">
              <button
                type="button"
                className={mode === 'edit' ? 'is-active' : ''}
                onClick={() => setMode('edit')}
                title="编辑模式"
              >
                <Pencil size={15} />
                <span>编辑</span>
              </button>
              <button
                type="button"
                className={mode === 'view' ? 'is-active' : ''}
                onClick={() => setMode('view')}
                title="预览模式"
              >
                <Eye size={15} />
                <span>预览</span>
              </button>
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLibraryOpen(true)}>
            <Library size={16} />
            <span className="desktop-label">路书库</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 size={16} />
            <span className="desktop-label">分享</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="更多操作">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => downloadRoadbook(activeRoadbook)}>
                <Download />
                导出 JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => importInputRef.current?.click()}>
                <FileUp />
                导入路书
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="danger-menu-item"
                disabled={roadbooks.length === 1}
                onSelect={() => deleteRoadbook(activeRoadbook.id)}
              >
                <Trash2 />
                删除当前路书
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
        </nav>
      </header>

      <div className="mobile-pane-tabs">
        <button
          type="button"
          className={mobilePane === 'plan' ? 'is-active' : ''}
          onClick={() => setMobilePane('plan')}
        >
          <BookOpenText size={16} />
          行程
        </button>
        <button
          type="button"
          className={mobilePane === 'map' ? 'is-active' : ''}
          onClick={() => setMobilePane('map')}
        >
          <MapIcon size={16} />
          地图
        </button>
      </div>

      <main className={`workspace mobile-${mobilePane}`}>
        <ItineraryPanel
          roadbook={activeRoadbook}
          activeDayId={activeDay.id}
          selectedStopId={selectedStopId}
          readOnly={readOnly}
          onSelectDay={(dayId) => {
            setActiveDayId(dayId)
            setSelectedStopId(null)
          }}
          onSelectStop={handleSelectStop}
          onEditTrip={openTripSettings}
          onAddDay={addDay}
          onDeleteDay={deleteDay}
          onReverseDay={reverseActiveDay}
          onAddStop={openAddStop}
          onEditStop={openEditStop}
          onMoveStop={moveStop}
          onDeleteStop={deleteStop}
        />
        <AmapCanvas
          roadbook={activeRoadbook}
          activeDayId={activeDay.id}
          selectedStopId={selectedStopId}
          onSelectStop={handleSelectStop}
          onRoutesResolved={handleRoutesResolved}
        />
      </main>

      {placeOpen ? (
        <PlaceEditorDialog
          key={editingStop?.id || `new-${activeDay.id}`}
          open={placeOpen}
          stop={editingStop}
          previousStop={previousStop}
          onOpenChange={setPlaceOpen}
          onSave={saveStop}
        />
      ) : null}
      {shareOpen ? (
        <ShareDialog open={shareOpen} roadbook={activeRoadbook} onOpenChange={setShareOpen} />
      ) : null}
      <TripLibraryDialog
        open={libraryOpen}
        roadbooks={roadbooks}
        activeRoadbookId={activeRoadbook.id}
        onOpenChange={setLibraryOpen}
        onSelect={(id) => {
          setActiveRoadbookId(id)
          setIsSharedPreview(id === INITIAL_SHARED_ROADBOOK?.id)
        }}
        onCreate={createNewRoadbook}
        onDuplicate={duplicateRoadbook}
        onDelete={deleteRoadbook}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>路书信息</DialogTitle>
            <DialogDescription>设置行程名称、日期和简介。</DialogDescription>
          </DialogHeader>
          {tripDraft ? (
            <div className="trip-settings-form">
              <label>
                路书名称
                <Input
                  value={tripDraft.title}
                  onChange={(event) =>
                    setTripDraft((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  开始日期
                  <Input
                    type="date"
                    value={tripDraft.startDate}
                    onChange={(event) =>
                      setTripDraft((current) =>
                        current ? { ...current, startDate: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label>
                  结束日期
                  <Input
                    type="date"
                    value={tripDraft.endDate}
                    onChange={(event) =>
                      setTripDraft((current) =>
                        current ? { ...current, endDate: event.target.value } : current,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                行程简介
                <Textarea
                  rows={3}
                  value={tripDraft.summary}
                  onChange={(event) =>
                    setTripDraft((current) =>
                      current ? { ...current, summary: event.target.value } : current,
                    )
                  }
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={saveTripSettings}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-center" richColors />
    </div>
  )
}

export default App

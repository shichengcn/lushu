import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BarChart3,
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
  Plus,
  Save,
  Share2,
  Trash2,
  Users,
} from 'lucide-react'
import { Toaster } from 'sonner'
import { ItineraryPanel } from '@/components/ItineraryPanel'
import { MapCanvas } from '@/components/MapCanvas'
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
import { useRoadbookController } from '@/hooks/use-roadbook-controller'
import { downloadRoadbook } from '@/lib/roadbooks'
import type { MapProvider, MapScope } from '@/types'

const AnalyticsDashboard = lazy(() => import('@/components/AnalyticsDashboard'))

function AnalyticsFallback() {
  return (
    <section className="analytics-progress" aria-live="polite">
      <BarChart3 size={24} />
      <strong>正在载入分析模块</strong>
      <span>准备费用、里程、时长与节点数据</span>
      <div>
        <i style={{ width: '18%' }} />
      </div>
      <em>18%</em>
    </section>
  )
}

function App() {
  const controller = useRoadbookController()
  const [mapProvider, setMapProvider] = useState<MapProvider>(() => {
    const saved = localStorage.getItem('tuji-map-provider')
    return saved === 'baidu' ? 'baidu' : 'amap'
  })
  const [mapScope, setMapScope] = useState<MapScope>({ mode: 'global' })
  const {
    roadbooks,
    activeRoadbook,
    activeDay,
    setActiveDayId,
    selectedStopId,
    setSelectedStopId,
    mode,
    setMode,
    mainView,
    setMainView,
    mobilePane,
    setMobilePane,
    isSharedPreview,
    libraryOpen,
    setLibraryOpen,
    settingsOpen,
    setSettingsOpen,
    shareOpen,
    setShareOpen,
    placeOpen,
    setPlaceOpen,
    editingStop,
    editingDayId,
    previousStop,
    tripDraft,
    setTripDraft,
    importInputRef,
    readOnly,
    saveStatus,
  } = controller

  useEffect(() => {
    localStorage.setItem('tuji-map-provider', mapProvider)
  }, [mapProvider])

  const switchMobilePane = (pane: 'plan' | 'map' | 'analytics') => {
    setMobilePane(pane)
    setMainView(pane === 'analytics' ? 'analytics' : 'workspace')
  }

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

        <div className="primary-view-toggle" aria-label="主视图">
          <button
            type="button"
            className={mainView === 'workspace' ? 'is-active' : ''}
            onClick={() => setMainView('workspace')}
          >
            <MapIcon size={15} />
            行程地图
          </button>
          <button
            type="button"
            className={mainView === 'analytics' ? 'is-active' : ''}
            onClick={() => setMainView('analytics')}
          >
            <BarChart3 size={15} />
            汇总分析
          </button>
        </div>

        <nav className="header-actions" aria-label="路书操作">
          {isSharedPreview ? (
            <Button type="button" size="sm" onClick={controller.saveSharedRoadbook}>
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
                onSelect={() => controller.deleteRoadbook(activeRoadbook.id)}
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
            onChange={(event) => void controller.handleImport(event.target.files?.[0])}
          />
        </nav>
      </header>

      <div className="mobile-pane-tabs">
        <button
          type="button"
          className={mobilePane === 'plan' ? 'is-active' : ''}
          onClick={() => switchMobilePane('plan')}
        >
          <BookOpenText size={16} />
          行程
        </button>
        <button
          type="button"
          className={mobilePane === 'map' ? 'is-active' : ''}
          onClick={() => switchMobilePane('map')}
        >
          <MapIcon size={16} />
          地图
        </button>
        <button
          type="button"
          className={mobilePane === 'analytics' ? 'is-active' : ''}
          onClick={() => switchMobilePane('analytics')}
        >
          <BarChart3 size={16} />
          分析
        </button>
      </div>

      {mainView === 'analytics' ? (
        <main className="analytics-workspace">
          <Suspense fallback={<AnalyticsFallback />}>
            <AnalyticsDashboard roadbook={activeRoadbook} />
          </Suspense>
        </main>
      ) : (
        <main className={`workspace mobile-${mobilePane}`}>
          <ItineraryPanel
            roadbook={activeRoadbook}
            activeDayId={activeDay.id}
            selectedStopId={selectedStopId}
            readOnly={readOnly}
            onSelectDay={(dayId) => {
              setActiveDayId(dayId)
              setSelectedStopId(null)
              setMapScope({ mode: 'day', dayId })
            }}
            onSelectStop={(stopId) => {
              controller.handleSelectStop(stopId)
              const day = activeRoadbook.days.find((item) =>
                item.stops.some((stop) => stop.id === stopId),
              )
              if (day) setMapScope({ mode: 'day', dayId: day.id })
            }}
            onEditTrip={controller.openTripSettings}
            onAddDay={controller.addDay}
            onDeleteDay={controller.deleteDay}
            onReverseDay={controller.reverseActiveDay}
            onAddStop={controller.openAddStop}
            onEditStop={controller.openEditStop}
            onMoveStop={controller.moveStop}
            onMoveStopToDay={controller.moveStopToDay}
            onToggleHidden={controller.toggleHidden}
            onDeleteStop={controller.deleteStop}
          />
          <MapCanvas
            roadbook={activeRoadbook}
            activeDayId={activeDay.id}
            selectedStopId={selectedStopId}
            provider={mapProvider}
            scope={mapScope}
            onProviderChange={setMapProvider}
            onScopeChange={setMapScope}
            onSelectStop={(stopId) => {
              controller.handleSelectStop(stopId)
              const day = activeRoadbook.days.find((item) =>
                item.stops.some((stop) => stop.id === stopId),
              )
              if (day) setMapScope({ mode: 'day', dayId: day.id })
            }}
            onEditStop={controller.openEditStop}
            onRoutesResolved={controller.handleRoutesResolved}
            onAddPlacePhoto={controller.addPlacePhoto}
            onAddPlaceNote={controller.addPlaceNote}
            readOnly={readOnly}
          />
        </main>
      )}

      {placeOpen ? (
        <PlaceEditorDialog
          key={editingStop?.id || `new-${editingDayId}`}
          open={placeOpen}
          stop={editingStop}
          previousStop={previousStop}
          travelers={activeRoadbook.travelers}
          onOpenChange={setPlaceOpen}
          onSave={controller.saveStop}
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
          controller.selectRoadbook(id)
          setMapScope({ mode: 'global' })
        }}
        onCreate={() => {
          controller.createNewRoadbook()
          setMapScope({ mode: 'global' })
        }}
        onDuplicate={controller.duplicateRoadbook}
        onDelete={controller.deleteRoadbook}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>路书信息与角色</DialogTitle>
            <DialogDescription>设置名称、起始日期和参与行程的成员。</DialogDescription>
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
                  <Input type="date" value={tripDraft.endDate} readOnly />
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
              <div className="traveler-editor">
                <div className="field-heading">
                  <span className="field-label">
                    <Users size={15} />
                    行程角色
                  </span>
                  <button type="button" onClick={controller.addTraveler}>
                    <Plus size={14} />
                    添加角色
                  </button>
                </div>
                {tripDraft.travelers.map((traveler, index) => (
                  <div className="traveler-row" key={traveler.id}>
                    <input
                      type="color"
                      value={traveler.color}
                      aria-label={`${traveler.name}颜色`}
                      onChange={(event) =>
                        setTripDraft((current) =>
                          current
                            ? {
                                ...current,
                                travelers: current.travelers.map((item) =>
                                  item.id === traveler.id
                                    ? { ...item, color: event.target.value }
                                    : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                    <Input
                      value={traveler.name}
                      aria-label={`角色${index + 1}名称`}
                      onChange={(event) =>
                        setTripDraft((current) =>
                          current
                            ? {
                                ...current,
                                travelers: current.travelers.map((item) =>
                                  item.id === traveler.id
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => controller.deleteTraveler(traveler.id)}
                      aria-label={`删除角色${traveler.name}`}
                      title="删除角色"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={controller.saveTripSettings}>
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

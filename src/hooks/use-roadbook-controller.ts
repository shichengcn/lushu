import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { estimateLeg } from '@/lib/amap'
import {
  addDays,
  createDay,
  createExpense,
  createId,
  createLeg,
  createNote,
  createRoadbook,
  importRoadbook,
  hasStoredRoadbooks,
  hydratePlaceLibrary,
  loadRoadbooks,
  migrateRoadbookV6,
  normalizeRoadbook,
  parseSharedRoadbook,
  recalculateDayDates,
  reverseDay,
  saveRoadbooks,
  storedRoadbooksSavedAt,
} from '@/lib/roadbooks'
import {
  exportLocalDist as runLocalDistExport,
  hasLocalDatabaseEndpoint,
  loadDatabaseSnapshot,
  saveLocalDatabase,
} from '@/lib/local-database'
import {
  compressPlacePhoto,
  ensurePlaceLibraryEntry,
  placeLibraryEntry,
  placeLibraryKey,
} from '@/lib/place-media'
import type { ResolvedLeg, Roadbook, TripDay, TripStop } from '@/types'

const INITIAL_SHARED_ROADBOOK = parseSharedRoadbook()
const INITIAL_ROADBOOKS = loadRoadbooks()
const INITIAL_ACTIVE_ROADBOOK = INITIAL_SHARED_ROADBOOK || INITIAL_ROADBOOKS[0]
const INITIAL_ACTIVE_DAY_ID =
  INITIAL_ACTIVE_ROADBOOK.days[
    INITIAL_ACTIVE_ROADBOOK.id === 'roadbook-qinggan-reverse' ? 1 : 0
  ]?.id || INITIAL_ACTIVE_ROADBOOK.days[0].id

function relinkStops(stops: TripStop[]) {
  let previousVisible: TripStop | null = null
  return stops.map((stop) => {
    if (stop.hidden) return stop
    if (!previousVisible) {
      previousVisible = stop
      const { legFromPrevious: _leg, ...firstStop } = stop
      return firstStop
    }
    const mode = stop.legFromPrevious?.mode || 'driving'
    const linked = {
      ...stop,
      legFromPrevious: {
        ...(stop.legFromPrevious || createLeg(mode, 0, 0)),
        mode,
        ...estimateLeg(previousVisible.location, stop.location, mode),
      },
    }
    previousVisible = linked
    return linked
  })
}

function redateRoadbook(roadbook: Roadbook, days: TripDay[], startDate = roadbook.startDate) {
  const datedDays = recalculateDayDates(days, startDate)
  return {
    ...roadbook,
    startDate,
    endDate: datedDays.at(-1)?.date || startDate,
    days: datedDays,
  }
}

export function useRoadbookController() {
  const [roadbooks, setRoadbooks] = useState<Roadbook[]>(() =>
    INITIAL_SHARED_ROADBOOK ? [INITIAL_SHARED_ROADBOOK, ...INITIAL_ROADBOOKS] : INITIAL_ROADBOOKS,
  )
  const [activeRoadbookId, setActiveRoadbookId] = useState(
    () => INITIAL_SHARED_ROADBOOK?.id || INITIAL_ROADBOOKS[0].id,
  )
  const [activeDayId, setActiveDayId] = useState(() => INITIAL_ACTIVE_DAY_ID)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(
    () => INITIAL_ACTIVE_DAY_ID,
  )
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'view'>(INITIAL_SHARED_ROADBOOK ? 'view' : 'edit')
  const [mainView, setMainView] = useState<'workspace' | 'analytics'>('workspace')
  const [mobilePane, setMobilePane] = useState<'plan' | 'map' | 'analytics'>('plan')
  const [isSharedPreview, setIsSharedPreview] = useState(Boolean(INITIAL_SHARED_ROADBOOK))
  const [sharedPreviewId, setSharedPreviewId] = useState<string | null>(
    INITIAL_SHARED_ROADBOOK?.id || null,
  )
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [placeOpen, setPlaceOpen] = useState(false)
  const [editingStop, setEditingStop] = useState<TripStop | null>(null)
  const [editingDayId, setEditingDayId] = useState('')
  const [previousStop, setPreviousStop] = useState<TripStop | null>(null)
  const [tripDraft, setTripDraft] = useState<Roadbook | null>(null)
  const [databaseReady, setDatabaseReady] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<
    'loading' | 'saving' | 'saved' | 'browser' | 'error'
  >('loading')
  const [databaseSavedAt, setDatabaseSavedAt] = useState('')
  const [exportingDist, setExportingDist] = useState(false)
  const [canExportDist, setCanExportDist] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const databaseErrorShownRef = useRef(false)

  const activeRoadbook =
    roadbooks.find((roadbook) => roadbook.id === activeRoadbookId) || roadbooks[0]
  const activeDay =
    activeRoadbook.days.find((day) => day.id === activeDayId) || activeRoadbook.days[0]
  const readOnly = mode === 'view' || isSharedPreview

  useEffect(() => {
    let cancelled = false
    void loadDatabaseSnapshot().then((snapshot) => {
      if (cancelled) return
      const browserHasData = hasStoredRoadbooks()
      const databaseWins =
        snapshot &&
        (!browserHasData ||
          (snapshot.source === 'local' && snapshot.savedAt > storedRoadbooksSavedAt()))
      if (databaseWins) {
        const restored = snapshot.roadbooks.map((roadbook) =>
          hydratePlaceLibrary(migrateRoadbookV6(normalizeRoadbook(roadbook))),
        )
        setRoadbooks(restored)
        setActiveRoadbookId(restored[0].id)
        setActiveDayId(restored[0].days[0].id)
        setExpandedDayId(restored[0].days[0].id)
      }
      setCanExportDist(hasLocalDatabaseEndpoint())
      setDatabaseSavedAt(snapshot?.source === 'local' ? snapshot.savedAt : '')
      setDatabaseStatus(snapshot?.source === 'local' ? 'saved' : 'browser')
      setDatabaseReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!databaseReady) return
    const persisted = isSharedPreview
      ? roadbooks.filter((roadbook) => roadbook.id !== sharedPreviewId)
      : roadbooks
    if (!persisted.length) return
    saveRoadbooks(persisted)
    const timeout = window.setTimeout(() => {
      setDatabaseStatus('saving')
      void saveLocalDatabase(persisted)
        .then((saved) => {
          if (saved) {
            setDatabaseSavedAt(new Date().toISOString())
            setDatabaseStatus('saved')
            setCanExportDist(true)
          } else {
            setDatabaseStatus('browser')
          }
        })
        .catch(() => {
          setDatabaseStatus('error')
          if (!databaseErrorShownRef.current) {
            databaseErrorShownRef.current = true
            toast.error('本地数据库写入失败，浏览器副本仍已保存')
          }
        })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [databaseReady, isSharedPreview, roadbooks, sharedPreviewId])

  const updateRoadbook = useCallback(
    (transform: (roadbook: Roadbook) => Roadbook, touch = true) => {
      setRoadbooks((current) => {
        let changed = false
        const next = current.map((roadbook) => {
          if (roadbook.id !== activeRoadbookId) return roadbook
          const updated = transform(roadbook)
          if (!touch && updated === roadbook) return roadbook
          changed = true
          return touch ? { ...updated, updatedAt: new Date().toISOString() } : updated
        })
        return changed ? next : current
      })
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
              const current = stop.legFromPrevious
              const expenses = current.expenses.filter(
                (expense) => expense.id !== `${stop.id}-auto-toll`,
              )
              if (resolved.tolls && resolved.tolls > 0) {
                expenses.push({
                  ...createExpense('导航预估高速费', resolved.tolls, 'toll'),
                  id: `${stop.id}-auto-toll`,
                })
              }
              const next = {
                ...current,
                distanceKm: resolved.distanceKm,
                durationMinutes: resolved.durationMinutes,
                roadType:
                  resolved.tollDistanceKm &&
                  resolved.tollDistanceKm > resolved.distanceKm * 0.5
                    ? ('highway' as const)
                    : current.roadType,
                roadNames: resolved.roadNames?.length
                  ? resolved.roadNames
                  : current.roadNames,
                tollRoads: resolved.tollRoads?.length
                  ? resolved.tollRoads
                  : current.tollRoads,
                expenses,
              }
              if (
                Math.abs(current.distanceKm - next.distanceKm) < 0.05 &&
                current.durationMinutes === next.durationMinutes &&
                current.roadType === next.roadType &&
                JSON.stringify(current.roadNames) === JSON.stringify(next.roadNames) &&
                JSON.stringify(current.tollRoads) === JSON.stringify(next.tollRoads) &&
                JSON.stringify(current.expenses) === JSON.stringify(next.expenses)
              ) {
                return stop
              }
              changed = true
              return { ...stop, legFromPrevious: next }
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
      if (day) setExpandedDayId(day.id)
      setSelectedStopId(stopId)
    },
    [activeRoadbook.days],
  )

  const openAddStop = (dayId: string) => {
    const day = activeRoadbook.days.find((item) => item.id === dayId) || activeDay
    setEditingStop(null)
    setEditingDayId(day.id)
    setPreviousStop([...day.stops].reverse().find((stop) => !stop.hidden) || null)
    setPlaceOpen(true)
  }

  const openEditStop = (stop: TripStop, previous: TripStop | null, dayId: string) => {
    setEditingStop(stop)
    setEditingDayId(dayId)
    setPreviousStop(previous)
    setPlaceOpen(true)
  }

  const saveStop = (stop: TripStop) => {
    const targetDayId = editingDayId || activeDay.id
    updateRoadbook((roadbook) => {
      const placeLibrary = ensurePlaceLibraryEntry(roadbook.placeLibrary, stop)
      return {
        ...roadbook,
        placeLibrary,
        days: roadbook.days.map((day) => {
          if (day.id !== targetDayId) return day
          const exists = day.stops.some((candidate) => candidate.id === stop.id)
          const stops = exists
            ? day.stops.map((candidate) => (candidate.id === stop.id ? stop : candidate))
            : [...day.stops, stop]
          return { ...day, stops: relinkStops(stops) }
        }),
      }
    })
    setActiveDayId(targetDayId)
    setExpandedDayId(targetDayId)
    setSelectedStopId(stop.id)
    toast.success(editingStop ? '节点已更新' : '节点已添加')
  }

  const addPlacePhoto = async (stopId: string, file: File) => {
    try {
      const url = await compressPlacePhoto(file)
      updateRoadbook((roadbook) => {
        const stop = roadbook.days
          .flatMap((day) => day.stops)
          .find((candidate) => candidate.id === stopId)
        if (!stop) return roadbook
        const entry = placeLibraryEntry(roadbook, stop)
        return {
          ...roadbook,
          placeLibrary: {
            ...roadbook.placeLibrary,
            [placeLibraryKey(stop)]: {
              ...entry,
              photos: [
                ...entry.photos,
                {
                  id: createId('place-photo'),
                  url,
                  caption: `${stop.name}自定义照片`,
                  source: 'upload',
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }
      })
      toast.success('照片已加入地点图库')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '照片保存失败')
    }
  }

  const addPlaceNote = (stopId: string, text: string) => {
    if (!text.trim()) return
    updateRoadbook((roadbook) => {
      const stop = roadbook.days
        .flatMap((day) => day.stops)
        .find((candidate) => candidate.id === stopId)
      if (!stop) return roadbook
      const entry = placeLibraryEntry(roadbook, stop)
      return {
        ...roadbook,
        placeLibrary: {
          ...roadbook.placeLibrary,
          [placeLibraryKey(stop)]: {
            ...entry,
            notes: [...entry.notes, createNote(text.trim())],
            updatedAt: new Date().toISOString(),
          },
        },
      }
    })
    toast.success('注意事项已加入地点库')
  }

  const moveStop = (dayId: string, stopId: string, direction: -1 | 1) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) => {
        if (day.id !== dayId) return day
        const index = day.stops.findIndex((stop) => stop.id === stopId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= day.stops.length) return day
        const stops = [...day.stops]
        ;[stops[index], stops[target]] = [stops[target], stops[index]]
        return { ...day, stops: relinkStops(stops) }
      }),
    }))
  }

  const moveStopToDay = (sourceDayId: string, stopId: string, targetDayId: string) => {
    if (sourceDayId === targetDayId) return
    updateRoadbook((roadbook) => {
      const movingStop = roadbook.days
        .find((day) => day.id === sourceDayId)
        ?.stops.find((stop) => stop.id === stopId)
      if (!movingStop) return roadbook
      return {
        ...roadbook,
        days: roadbook.days.map((day) => {
          if (day.id === sourceDayId) {
            return { ...day, stops: relinkStops(day.stops.filter((stop) => stop.id !== stopId)) }
          }
          if (day.id === targetDayId) {
            return { ...day, stops: relinkStops([...day.stops, movingStop]) }
          }
          return day
        }),
      }
    })
    setActiveDayId(targetDayId)
    setExpandedDayId(targetDayId)
    toast.success('节点已移动到新的日期')
  }

  const toggleHidden = (dayId: string, stopId: string) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) =>
        day.id === dayId
          ? {
              ...day,
              stops: relinkStops(
                day.stops.map((stop) =>
                  stop.id === stopId ? { ...stop, hidden: !stop.hidden } : stop,
                ),
              ),
            }
          : day,
      ),
    }))
    if (selectedStopId === stopId) setSelectedStopId(null)
    toast.success('节点可见性已更新')
  }

  const deleteStop = (dayId: string, stopId: string) => {
    updateRoadbook((roadbook) => ({
      ...roadbook,
      days: roadbook.days.map((day) =>
        day.id === dayId
          ? { ...day, stops: relinkStops(day.stops.filter((stop) => stop.id !== stopId)) }
          : day,
      ),
    }))
    if (selectedStopId === stopId) setSelectedStopId(null)
    toast.success('节点已删除')
  }

  const addDay = () => {
    const currentIndex = activeRoadbook.days.findIndex((day) => day.id === activeDay.id)
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : activeRoadbook.days.length
    const day = createDay(insertIndex, addDays(activeRoadbook.startDate, insertIndex))
    updateRoadbook((roadbook) => {
      const days = [...roadbook.days]
      days.splice(insertIndex, 0, day)
      return redateRoadbook(roadbook, days)
    })
    setActiveDayId(day.id)
    setExpandedDayId(day.id)
    return day
  }

  const deleteDay = (dayId: string) => {
    if (activeRoadbook.days.length === 1) return
    const deletedIndex = activeRoadbook.days.findIndex((day) => day.id === dayId)
    const remaining = activeRoadbook.days.filter((day) => day.id !== dayId)
    updateRoadbook((roadbook) => redateRoadbook(roadbook, remaining))
    const nextDayId = remaining[Math.max(0, deletedIndex - 1)].id
    setActiveDayId(nextDayId)
    setExpandedDayId(nextDayId)
    setSelectedStopId(null)
    toast.success('当天行程已删除，后续日期已自动前移')
    return nextDayId
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
    setActiveDayId(roadbook.days[0].id)
    setExpandedDayId(roadbook.days[0].id)
    setMode('edit')
    setMainView('workspace')
    setIsSharedPreview(false)
    setSharedPreviewId(null)
    window.history.replaceState(null, '', window.location.pathname)
    return roadbook
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

  const selectRoadbook = (id: string) => {
    const selected = roadbooks.find((roadbook) => roadbook.id === id)
    setActiveRoadbookId(id)
    setActiveDayId(selected?.days[0]?.id || '')
    setExpandedDayId(selected?.days[0]?.id || null)
    setSelectedStopId(null)
    setIsSharedPreview(id === sharedPreviewId)
  }

  const saveSharedRoadbook = () => {
    setIsSharedPreview(false)
    setSharedPreviewId(null)
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
    updateRoadbook(() =>
      redateRoadbook(
        { ...tripDraft, title: tripDraft.title.trim() },
        tripDraft.days,
        tripDraft.startDate,
      ),
    )
    setSettingsOpen(false)
    toast.success('路书信息与角色已保存')
  }

  const addTraveler = () => {
    setTripDraft((current) =>
      current
        ? {
            ...current,
            travelers: [
              ...current.travelers,
              {
                id: createId('traveler'),
                name: `成员 ${current.travelers.length + 1}`,
                color: ['#10a7a2', '#ef6548', '#3978f6', '#e4a11b'][
                  current.travelers.length % 4
                ],
              },
            ],
          }
        : current,
    )
  }

  const deleteTraveler = (travelerId: string) => {
    setTripDraft((current) =>
      current
        ? {
            ...current,
            travelers: current.travelers.filter((traveler) => traveler.id !== travelerId),
            days: current.days.map((day) => ({
              ...day,
              stops: day.stops.map((stop) => ({
                ...stop,
                participantIds: stop.participantIds.filter((id) => id !== travelerId),
                expenses: stop.expenses.map((expense) =>
                  expense.payerId === travelerId
                    ? { ...expense, payerId: undefined }
                    : expense,
                ),
              })),
            })),
          }
        : current,
    )
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = await importRoadbook(file)
      setRoadbooks((current) => [imported, ...current])
      setActiveRoadbookId(imported.id)
      setActiveDayId(imported.days[0].id)
      setExpandedDayId(imported.days[0].id)
      setMode('edit')
      setMainView('workspace')
      setIsSharedPreview(false)
      setSharedPreviewId(null)
      toast.success('路书导入成功')
    } catch {
      toast.error('导入失败，请选择有效的路书 JSON 文件')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const exportDist = async () => {
    if (exportingDist) return
    setExportingDist(true)
    try {
      const persisted = isSharedPreview
        ? roadbooks.filter((roadbook) => roadbook.id !== sharedPreviewId)
        : roadbooks
      saveRoadbooks(persisted)
      await saveLocalDatabase(persisted)
      setDatabaseSavedAt(new Date().toISOString())
      setDatabaseStatus('saved')
      const result = await runLocalDistExport()
      toast.success(`dist 已导出：${result.roadbookCount} 本路书`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'dist 导出失败')
    } finally {
      setExportingDist(false)
    }
  }

  const savedTime = new Date(databaseSavedAt)
  const saveStatus =
    databaseStatus === 'loading'
      ? '正在读取本机数据库'
      : databaseStatus === 'saving'
        ? '正在写入本机数据库'
        : databaseStatus === 'saved' && !Number.isNaN(savedTime.getTime())
          ? `${savedTime.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })} 本机数据库已保存`
          : databaseStatus === 'error'
            ? '本机数据库写入失败'
            : '已保存到当前浏览器'

  return {
    roadbooks,
    activeRoadbook,
    activeDay,
    activeDayId,
    setActiveDayId,
    expandedDayId,
    setExpandedDayId,
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
    canExportDist,
    exportingDist,
    exportDist,
    handleRoutesResolved,
    handleSelectStop,
    openAddStop,
    openEditStop,
    saveStop,
    addPlacePhoto,
    addPlaceNote,
    moveStop,
    moveStopToDay,
    toggleHidden,
    deleteStop,
    addDay,
    deleteDay,
    reverseActiveDay,
    createNewRoadbook,
    duplicateRoadbook,
    deleteRoadbook,
    selectRoadbook,
    saveSharedRoadbook,
    openTripSettings,
    saveTripSettings,
    addTraveler,
    deleteTraveler,
    handleImport,
  }
}

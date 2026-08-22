import { Map as MapIcon, Route, Waypoints } from 'lucide-react'
import { AmapCanvas } from '@/components/AmapCanvas'
import { BaiduMapCanvas } from '@/components/BaiduMapCanvas'
import type {
  KnowledgePlace,
  MapProvider,
  MapScope,
  ResolvedLeg,
  Roadbook,
  TripStop,
} from '@/types'

interface MapCanvasProps {
  roadbook: Roadbook
  activeDayId: string
  selectedStopId: string | null
  provider: MapProvider
  scope: MapScope
  onProviderChange: (provider: MapProvider) => void
  onScopeChange: (scope: MapScope) => void
  onSelectStop: (stopId: string) => void
  onEditStop: (stop: TripStop, previousStop: TripStop | null, dayId: string) => void
  onRoutesResolved: (legs: ResolvedLeg[]) => void
  onAddPlacePhoto: (stop: TripStop, file: File) => Promise<void>
  onAddPlaceNote: (stop: TripStop, text: string) => void
  onAddKnowledgePlace: (place: KnowledgePlace) => void
  readOnly: boolean
}

export function MapCanvas(props: MapCanvasProps) {
  const { provider, scope, activeDayId, onProviderChange, onScopeChange } = props
  const shared = {
    roadbook: props.roadbook,
    activeDayId,
    selectedStopId: props.selectedStopId,
    scope,
    onScopeChange,
    onSelectStop: props.onSelectStop,
    onEditStop: props.onEditStop,
    onRoutesResolved: props.onRoutesResolved,
    onAddPlacePhoto: props.onAddPlacePhoto,
    onAddPlaceNote: props.onAddPlaceNote,
    onAddKnowledgePlace: props.onAddKnowledgePlace,
    readOnly: props.readOnly,
  }

  return (
    <div className="map-provider-host">
      {provider === 'amap' ? <AmapCanvas {...shared} /> : <BaiduMapCanvas {...shared} />}

      <div className="map-context-bar" aria-label="地图范围与供应商">
        <div className="map-provider-switch">
          <button
            type="button"
            className={provider === 'amap' ? 'is-active' : ''}
            onClick={() => onProviderChange('amap')}
          >
            高德
          </button>
          <button
            type="button"
            className={provider === 'baidu' ? 'is-active' : ''}
            onClick={() => onProviderChange('baidu')}
          >
            百度
          </button>
        </div>
        <i />
        <button
          type="button"
          className={scope.mode === 'global' ? 'is-active' : ''}
          onClick={() => onScopeChange({ mode: 'global' })}
          title="只显示西宁起止的完整自驾环线"
        >
          <MapIcon size={14} />
          全局
        </button>
        <button
          type="button"
          className={scope.mode === 'day' ? 'is-active' : ''}
          onClick={() => onScopeChange({ mode: 'day', dayId: activeDayId })}
          title="聚焦当天有序途经点"
        >
          <Waypoints size={14} />
          单日
        </button>
        <button
          type="button"
          className={scope.mode === 'leg' ? 'is-active' : ''}
          disabled={scope.mode !== 'leg'}
          title="点击路段或公里数后查看"
        >
          <Route size={14} />
          单段
        </button>
      </div>
    </div>
  )
}

import { CalendarDays, Copy, Map, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { totalCost, totalDrivingDistance } from '@/lib/roadbooks'
import type { Roadbook } from '@/types'

interface TripLibraryDialogProps {
  open: boolean
  roadbooks: Roadbook[]
  activeRoadbookId: string
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

export function TripLibraryDialog({
  open,
  roadbooks,
  activeRoadbookId,
  onOpenChange,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: TripLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="library-dialog">
        <DialogHeader>
          <DialogTitle>我的路书</DialogTitle>
          <DialogDescription>数据仅保存在当前浏览器中，可随时导出备份。</DialogDescription>
        </DialogHeader>

        <div className="roadbook-list">
          {roadbooks.map((roadbook) => (
            <article
              className={`roadbook-row${roadbook.id === activeRoadbookId ? ' is-active' : ''}`}
              key={roadbook.id}
            >
              <button
                type="button"
                className="roadbook-open"
                onClick={() => {
                  onSelect(roadbook.id)
                  onOpenChange(false)
                }}
              >
                <span className="roadbook-icon">
                  <Map size={20} />
                </span>
                <span>
                  <strong>{roadbook.title}</strong>
                  <small>
                    <CalendarDays size={13} />
                    {roadbook.startDate} 至 {roadbook.endDate}
                  </small>
                  <em>
                    {roadbook.days.length} 天 · 驾车 {totalDrivingDistance(roadbook).toFixed(0)} km · ¥
                    {totalCost(roadbook).toLocaleString('zh-CN')}
                  </em>
                </span>
              </button>
              <div className="roadbook-actions">
                <button
                  type="button"
                  onClick={() => onDuplicate(roadbook.id)}
                  aria-label={`复制${roadbook.title}`}
                  title="复制"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(roadbook.id)}
                  disabled={roadbooks.length === 1}
                  aria-label={`删除${roadbook.title}`}
                  title="删除"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>

        <Button
          type="button"
          className="library-create"
          onClick={() => {
            onCreate()
            onOpenChange(false)
          }}
        >
          <Plus size={17} />
          创建新路书
        </Button>
      </DialogContent>
    </Dialog>
  )
}

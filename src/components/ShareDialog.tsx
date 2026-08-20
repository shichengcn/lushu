import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, Radio, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { buildShareUrl } from '@/lib/roadbooks'
import type { Roadbook } from '@/types'

interface ShareDialogProps {
  open: boolean
  roadbook: Roadbook
  onOpenChange: (open: boolean) => void
}

export function ShareDialog({ open, roadbook, onOpenChange }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const shareUrl = buildShareUrl(roadbook)

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      if (!qrCanvasRef.current) return
      void QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#17202d', light: '#ffffff' },
      }).catch(() => {
        const canvas = qrCanvasRef.current
        const context = canvas?.getContext('2d')
        if (!canvas || !context) return
        canvas.width = 220
        canvas.height = 220
        context.fillStyle = '#f3f5f7'
        context.fillRect(0, 0, 220, 220)
        context.fillStyle = '#596675'
        context.font = '13px sans-serif'
        context.textAlign = 'center'
        context.fillText('链接较长，请复制后分享', 110, 110)
      })
    }, 0)
  }, [open, shareUrl])

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const shareNative = async () => {
    if (navigator.share) {
      await navigator.share({
        title: roadbook.title,
        text: roadbook.summary,
        url: shareUrl,
      })
      return
    }
    await copyLink()
  }

  const shareWeibo = () => {
    const target = new URL('https://service.weibo.com/share/share.php')
    target.searchParams.set('url', shareUrl)
    target.searchParams.set('title', `${roadbook.title}｜${roadbook.summary}`)
    window.open(target.toString(), '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="share-dialog">
        <DialogHeader>
          <DialogTitle>分享路书</DialogTitle>
          <DialogDescription>
            分享链接已包含当前路书数据，打开后可查看并保存到本地。
          </DialogDescription>
        </DialogHeader>

        <div className="share-layout">
          <div className="qr-panel">
            <canvas ref={qrCanvasRef} aria-label={`${roadbook.title}分享二维码`} />
            <strong>微信扫码查看</strong>
            <span>也可长按转发到朋友圈</span>
          </div>

          <div className="share-actions">
            <div className="share-link">
              <Input value={shareUrl} readOnly aria-label="分享链接" />
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => void copyLink()}
                aria-label="复制链接"
                title="复制链接"
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </Button>
            </div>

            <button type="button" className="share-option wechat" onClick={() => void copyLink()}>
              <MessageCircle size={20} />
              <span>
                <strong>微信 / 朋友圈</strong>
                <small>复制链接或使用左侧二维码</small>
              </span>
            </button>
            <button type="button" className="share-option weibo" onClick={shareWeibo}>
              <Radio size={20} />
              <span>
                <strong>新浪微博</strong>
                <small>打开微博分享页面</small>
              </span>
            </button>
            <button type="button" className="share-option system" onClick={() => void shareNative()}>
              <Share2 size={20} />
              <span>
                <strong>系统分享</strong>
                <small>调用当前设备的分享菜单</small>
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

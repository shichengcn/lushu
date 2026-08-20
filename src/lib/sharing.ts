import { buildShareUrl, normalizeRoadbook, serializeRoadbookForShare } from '@/lib/roadbooks'
import type { Roadbook } from '@/types'

export function cloudShareId() {
  return window.location.hash.match(/^#cloud=([a-zA-Z0-9_-]+)$/)?.[1] || null
}

export async function createShareUrl(roadbook: Roadbook) {
  try {
    const response = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(serializeRoadbookForShare(roadbook)),
    })
    if (!response.ok) throw new Error('Cloud share unavailable')
    const result = (await response.json()) as { id?: string }
    if (!result.id) throw new Error('Cloud share ID missing')
    return `${window.location.origin}${window.location.pathname}#cloud=${result.id}`
  } catch {
    return buildShareUrl(roadbook)
  }
}

export async function fetchCloudRoadbook(id: string) {
  const response = await fetch(`/api/shares/${encodeURIComponent(id)}`)
  if (!response.ok) throw new Error('分享链接不存在或已过期')
  const raw = await response.json()
  return normalizeRoadbook(raw)
}

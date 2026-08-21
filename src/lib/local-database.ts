import type { Roadbook } from '@/types'

export interface LocalDatabaseSnapshot {
  savedAt: string
  roadbooks: Roadbook[]
  source: 'local' | 'export'
}

export interface LocalExportResult {
  exportedAt: string
  databaseSavedAt: string
  roadbookCount: number
}

let localDatabaseEndpointAvailable = false

export function isLocalWorkspace() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost'
}

export async function loadDatabaseSnapshot(): Promise<LocalDatabaseSnapshot | null> {
  const candidates: Array<{ source: 'local' | 'export'; url: string }> =
    isLocalWorkspace()
      ? [
          { source: 'local', url: '/__tuji/local-db' },
          { source: 'export', url: './data/roadbooks.json' },
        ]
      : [{ source: 'export', url: './data/roadbooks.json' }]
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { cache: 'no-store' })
      if (!response.ok) {
        if (
          candidate.source === 'local' &&
          response.status === 404 &&
          response.headers.get('content-type')?.includes('application/json')
        ) {
          localDatabaseEndpointAvailable = true
        }
        continue
      }
      const snapshot = await response.json()
      if (!Array.isArray(snapshot?.roadbooks) || !snapshot.roadbooks.length) continue
      if (candidate.source === 'local') localDatabaseEndpointAvailable = true
      return {
        savedAt: String(snapshot.savedAt || ''),
        roadbooks: snapshot.roadbooks,
        source: candidate.source,
      }
    } catch {
      continue
    }
  }
  return null
}

export async function saveLocalDatabase(roadbooks: Roadbook[]) {
  if (!isLocalWorkspace() || !localDatabaseEndpointAvailable) return false
  const response = await fetch('/__tuji/local-db', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      savedAt: new Date().toISOString(),
      roadbooks,
    }),
  })
  if (!response.ok) throw new Error('本地数据库写入失败')
  return true
}

export function hasLocalDatabaseEndpoint() {
  return localDatabaseEndpointAvailable
}

export async function exportLocalDist(): Promise<LocalExportResult> {
  if (!isLocalWorkspace() || !localDatabaseEndpointAvailable) {
    throw new Error('请通过 pnpm dev 或 pnpm preview 打开本地预览')
  }
  const response = await fetch('/__tuji/export-dist', { method: 'POST' })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result?.error || 'dist 导出失败')
  }
  return result
}

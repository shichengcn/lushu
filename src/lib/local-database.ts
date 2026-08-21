import type { Roadbook } from '@/types'

export interface LocalDatabaseSnapshot {
  savedAt: string
  roadbooks: Roadbook[]
  source: 'local' | 'export'
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
      if (!response.ok) continue
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
  if (!isLocalWorkspace() || !localDatabaseEndpointAvailable) return
  const response = await fetch('/__tuji/local-db', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      savedAt: new Date().toISOString(),
      roadbooks,
    }),
  })
  if (!response.ok) throw new Error('本地数据库写入失败')
}

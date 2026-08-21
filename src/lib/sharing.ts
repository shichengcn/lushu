import { buildShareUrl } from '@/lib/roadbooks'
import type { Roadbook } from '@/types'

export async function createShareUrl(roadbook: Roadbook) {
  return buildShareUrl(roadbook)
}

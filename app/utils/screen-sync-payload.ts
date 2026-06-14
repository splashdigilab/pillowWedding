import { Timestamp } from 'firebase/firestore'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'

/**
 * BroadcastChannel 使用 structured clone，無法複製 Firestore Timestamp 等物件。
 * 傳送前將 note 序列化成純資料，接收後還原。
 */

function toMillis(t: unknown): number | null {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (typeof (t as { toMillis?: () => number }).toMillis === 'function') {
    return (t as { toMillis: () => number }).toMillis()
  }
  return null
}

export type SerializedNote = Record<string, unknown> & {
  id?: string
  content: string
  style: unknown
  token: string
  timestampMs: number | null
  status: string
  playedAtMs?: number | null
}

export function serializeNoteForChannel(
  note: QueuePendingItem | QueueHistoryItem
): SerializedNote {
  const n = note as QueueHistoryItem & { playedAt?: unknown }
  const serialized: SerializedNote = {
    id: note.id,
    content: note.content,
    style: note.style,
    token: note.token,
    timestampMs: toMillis(note.timestamp),
    status: note.status,
    playedAtMs: n.playedAt != null ? toMillis(n.playedAt) : null
  }
  return serialized
}

/**
 * 傳給 BroadcastChannel 前必須是純資料（structured clone 會失敗在 style 等巢狀物件）。
 * 用 JSON 來回轉換，確保整份 payload 可被 postMessage clone。
 */
export function toCloneableNotePayload(
  note: QueuePendingItem | QueueHistoryItem
): SerializedNote {
  return JSON.parse(JSON.stringify(serializeNoteForChannel(note))) as SerializedNote
}

export function deserializeNoteFromChannel(
  data: SerializedNote
): QueuePendingItem | QueueHistoryItem {
  const base = {
    id: data.id,
    content: data.content,
    style: data.style,
    token: data.token,
    timestamp:
      data.timestampMs != null
        ? Timestamp.fromMillis(data.timestampMs)
        : Timestamp.now(),
    status: data.status
  }
  if (data.status === 'played' && data.playedAtMs != null) {
    return {
      ...base,
      status: 'played',
      playedAt: Timestamp.fromMillis(data.playedAtMs)
    } as QueueHistoryItem
  }
  return { ...base, status: 'waiting' } as QueuePendingItem
}

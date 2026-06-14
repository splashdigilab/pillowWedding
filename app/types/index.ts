import type { Timestamp } from 'firebase/firestore'

/**
 * 貼紙實例
 */
export interface StickerInstance {
  id: string
  type: string
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * 文字區塊實例（多文字支援）
 */
export interface TextBlockInstance {
  id: string
  content: string
  x: number
  y: number
  scale: number
  rotation: number
  color: string
  align: TextAlign
  /** 鎖定圖層：無法被點擊選取，只能長按解鎖 */
  locked?: boolean
}

/**
 * 草稿資料
 */
export type TextAlign = 'left' | 'center' | 'right'

export interface DraftData {
  content: string
  backgroundImage: string // 背景圖片 URL
  shape: string // 造型 ID
  textColor: string
  textAlign?: TextAlign
  stickers: StickerInstance[]
  textTransform?: TextBlockTransform
  textBlocks?: TextBlockInstance[] // 多文字區塊
  drawing?: string // 手繪內容 data URL
  /** 各物件 id 的疊放順序（與編輯器 objectZOrder 一致）；載入草稿時還原 */
  objectLayerOrder?: Record<string, number>
  timestamp: number
}

/**
 * 文字區塊變換（位置、縮放、旋轉）
 */
export interface TextBlockTransform {
  x: number
  y: number
  scale: number
  rotation: number
}

/**
 * 便利貼樣式配置
 */
export interface StickyNoteStyle {
  backgroundImage: string // 背景圖片 URL
  shape: string // 造型 ID (對應 shapes.ts)
  textColor: string
  textAlign?: TextAlign // 文字對齊：左、中、右
  fontFamily?: string
  stickers?: StickerInstance[] // 貼紙
  textTransform?: TextBlockTransform // 文字區塊位置、縮放、旋轉（舊格式向下相容）
  textBlocks?: TextBlockInstance[] // 多文字區塊
  drawing?: string // 手繪內容 data URL (base64 PNG)
  /** 各物件 id 的疊放順序（預覽/上傳/display 與編輯器一致）；無則沿用預設文字 1、貼紙 3 */
  objectLayerOrder?: Record<string, number>
}

/**
 * 佇列項目狀態
 */
export type QueueStatus = 'waiting' | 'playing' | 'played'

/**
 * Token 狀態
 */
export type TokenStatus = 'unused' | 'used'

/**
 * 待處理佇列項目
 */
export interface QueuePendingItem {
  id?: string // Firestore document ID
  content: string
  style: StickyNoteStyle
  token: string
  timestamp: Timestamp
  status: 'waiting'
}

/**
 * 歷史紀錄項目
 */
export interface QueueHistoryItem {
  id?: string // Firestore document ID
  content: string
  style: StickyNoteStyle
  token: string
  timestamp: Timestamp
  status: 'played'
  playedAt: Timestamp
}

/**
 * Token 文件
 */
export interface TokenDocument {
  id?: string // Firestore document ID
  status: TokenStatus
  createdAt: Timestamp
}

/**
 * 建立便利貼的表單資料
 */
export interface CreateNoteForm {
  content: string
  style: StickyNoteStyle
}

/**
 * 大螢幕推播狀態資料 (Conductor)
 */
export interface CurrentStateData {
  mode: 'live' | 'idle' | 'waiting'
  now_playing: QueueHistoryItem | QueuePendingItem | null
  live_grid: (QueueHistoryItem | QueuePendingItem)[]
  updated_at: number
}

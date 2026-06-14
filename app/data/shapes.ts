/**
 * 便利貼造型 SVG 資料庫
 * 使用 mask-image 直接讀取 Illustrator 輸出的 SVG（無需 clipPath）
 * 設計規範：1:1 畫布、形狀需有填色（填色區域 = 可見區域）
 */

export interface StickyNoteShape {
  id: string
  svg: string // SVG 檔案路徑（預覽 + clip-path 共用）
}

export const STICKY_NOTE_SHAPES: StickyNoteShape[] = [
  { id: 'square', svg: '/svg/shapes/square.svg' },
  { id: 'circle', svg: '/svg/shapes/circle.svg' },
  { id: 'star', svg: '/svg/shapes/star.svg' },
  { id: 'heart', svg: '/svg/shapes/heart.svg' },
  { id: 'hexagon', svg: '/svg/shapes/hexagon.svg' },
  { id: 'round', svg: '/svg/shapes/round.svg' },
  { id: 'diamond', svg: '/svg/shapes/diamond.svg' },
]

/** 預設造型（第一個） */
export const DEFAULT_SHAPE_ID = STICKY_NOTE_SHAPES[0]?.id ?? 'square'

/**
 * 根據 ID 取得造型
 */
export const getShapeById = (id: string): StickyNoteShape | undefined => {
  return STICKY_NOTE_SHAPES.find(shape => shape.id === id)
}

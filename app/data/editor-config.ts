/**
 * 編輯器相關常數
 */

export const MAX_CONTENT_LENGTH = 200

/* icon 依圖案內容對應：icon-1 是「T」、icon-2 是筆刷、icon-3 是紙膠帶、icon-4 是紙張 */
export const EDITOR_TABS = [
  { id: 'note' as const, label: '便利貼', icon: '/system/icon-4.webp' },
  { id: 'text' as const, label: '文字', icon: '/system/icon-1.webp' },
  { id: 'draw' as const, label: '繪圖', icon: '/system/icon-2.webp' },
  { id: 'sticker' as const, label: '貼紙', icon: '/system/icon-3.webp' }
] as const

export type EditorTabId = typeof EDITOR_TABS[number]['id']

/* 編輯器開場的「玩法簡單 4 步驟」，圖示沿用上面四個 tab 的 icon */
export const EDITOR_GUIDE_STEPS = [
  { icon: '/system/icon-4.webp', title: '選擇模板', desc: '挑選喜歡的便利貼或造型模板' },
  { icon: '/system/icon-1.webp', title: '輸入文字', desc: '寫下你的祝福與心意文字' },
  { icon: '/system/icon-2.webp', title: '繪製圖案', desc: '自由繪圖，加入可愛的裝飾與圖案' },
  { icon: '/system/icon-3.webp', title: '添加貼紙', desc: '使用貼紙裝飾，讓你的祝福更精彩' }
] as const

export const TEXT_ALIGN_OPTIONS = [
  { value: 'left' as const, svg: '/align-left.svg' },
  { value: 'center' as const, svg: '/align-center.svg' },
  { value: 'right' as const, svg: '/align-right.svg' }
] as const

/**
 * 便利貼上的文字只有這一個顏色（= scss 的 $text-dark），不再讓使用者挑色。
 * 文字區塊仍保留 color 欄位，但一律寫入這個值。
 */
export const EDITOR_TEXT_COLOR = '#6A5338'

/** 繪圖筆刷色盤：婚禮水彩色系，最後補一個文字色當唯一的深色選項 */
export const BRUSH_COLORS = [
  { value: '#FFF5E8' }, // 奶油米白
  { value: '#F8DCCB' }, // 淡杏桃
  { value: '#F6C9C3' }, // 柔粉色
  { value: '#E9A8A0' }, // 乾燥玫瑰粉
  { value: '#EED7A8' }, // 淡香檳金
  { value: '#D8BFA3' }, // 奶茶色
  { value: '#EFE1CE' }, // 淺燕麥
  { value: '#C9D5BE' }, // 淡鼠尾草綠
  { value: '#AEBDA5' }, // 霧灰綠
  { value: '#C9DCE3' }, // 淡霧藍
  { value: EDITOR_TEXT_COLOR }, // 深棕（= 文字色）
] as const

/**
 * 預設筆刷色（乾燥玫瑰粉）——必須是 BRUSH_COLORS 裡的其中一個，
 * 否則進到繪圖模式時沒有任何色塊會顯示成選取狀態。
 * UI 的 brushColor 與 fabric 筆刷的初始色都從這裡取，兩邊才不會各寫各的。
 */
export const EDITOR_DEFAULT_BRUSH_COLOR = '#E9A8A0'

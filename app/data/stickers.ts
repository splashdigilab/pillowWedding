/**
 * Sticker 類型定義
 */
export interface StickerType {
  id: string
  defaultScale: number
  /** 貼到便利貼上時用的圖：512px。烘出的圖最大 1080px，貼紙在裡面頂多佔 260px，原始的 1400px 是純浪費 */
  svgFile: string
  /** 選單格子用的縮圖：128px。選單一次列出全部 35 張，吃原圖等於一口氣解壓 187MB 進記憶體 */
  thumb: string
}

/** id 形如 sticker-1_0000 / sticker_people_00，去掉結尾流水號即為資料夾名 */
const toPaths = (id: string) => {
  const group = id.replace(/_\d+$/, '')
  return {
    svgFile: `/sticker-512/${group}/${id}.webp`,
    thumb: `/sticker-128/${group}/${id}.webp`
  }
}

const STICKER_IDS = [
  'sticker_logo_00',
  'sticker-1_0000', 'sticker-1_0001', 'sticker-1_0002', 'sticker-1_0003',
  'sticker-1_0004', 'sticker-1_0005', 'sticker-1_0006', 'sticker-1_0007',
  'sticker-1_0008', 'sticker-1_0009', 'sticker-1_0010', 'sticker-1_0011',
  'sticker-1_0012', 'sticker-1_0013', 'sticker-1_0014', 'sticker-1_0015',
  'sticker-1_0016', 'sticker-1_0017', 'sticker-1_0018',
  'sticker_people_00', 'sticker_people_01', 'sticker_people_02', 'sticker_people_03',
  'sticker_people_04', 'sticker_people_05', 'sticker_people_06', 'sticker_people_07',
  'sticker_people_08', 'sticker_people_09', 'sticker_people_10', 'sticker_people_11',
  'sticker_people_12', 'sticker_people_13', 'sticker_people_14', 'sticker_people_15',
  'sticker_people_16', 'sticker_people_17', 'sticker_people_18', 'sticker_people_19',
  'sticker_people_20', 'sticker_people_21',
]

/**
 * 預設 Sticker 庫
 */
export const STICKER_LIBRARY: StickerType[] = STICKER_IDS.map(id => ({
  id,
  defaultScale: 1,
  ...toPaths(id)
}))

/**
 * 依 ID 取得 Sticker
 */
export const getStickerById = (id: string): StickerType | undefined =>
  STICKER_LIBRARY.find(s => s.id === id)

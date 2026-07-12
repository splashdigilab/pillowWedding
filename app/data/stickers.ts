/**
 * Sticker 類型定義
 */
export interface StickerType {
  id: string
  defaultScale: number
  svgFile: string // 圖檔路徑
}

/**
 * 預設 Sticker 庫
 */
export const STICKER_LIBRARY: StickerType[] = [
  { id: 'sticker-1_0000', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0000.webp' },
  { id: 'sticker-1_0001', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0001.webp' },
  { id: 'sticker-1_0002', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0002.webp' },
  { id: 'sticker-1_0003', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0003.webp' },
  { id: 'sticker-1_0004', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0004.webp' },
  { id: 'sticker-1_0005', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0005.webp' },
  { id: 'sticker-1_0006', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0006.webp' },
  { id: 'sticker-1_0007', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0007.webp' },
  { id: 'sticker-1_0008', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0008.webp' },
  { id: 'sticker-1_0009', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0009.webp' },
  { id: 'sticker-1_0010', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0010.webp' },
  { id: 'sticker-1_0011', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0011.webp' },
  { id: 'sticker-1_0012', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0012.webp' },
  { id: 'sticker-1_0013', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0013.webp' },
  { id: 'sticker-1_0014', defaultScale: 1, svgFile: '/sticker/sticker-1/sticker-1_0014.webp' },
  { id: 'sticker_people_00', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_00.webp' },
  { id: 'sticker_people_01', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_01.webp' },
  { id: 'sticker_people_02', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_02.webp' },
  { id: 'sticker_people_03', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_03.webp' },
  { id: 'sticker_people_04', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_04.webp' },
  { id: 'sticker_people_05', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_05.webp' },
  { id: 'sticker_people_06', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_06.webp' },
  { id: 'sticker_people_07', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_07.webp' },
  { id: 'sticker_people_08', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_08.webp' },
  { id: 'sticker_people_09', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_09.webp' },
  { id: 'sticker_people_10', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_10.webp' },
  { id: 'sticker_people_11', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_11.webp' },
  { id: 'sticker_people_12', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_12.webp' },
  { id: 'sticker_people_13', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_13.webp' },
  { id: 'sticker_people_14', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_14.webp' },
  { id: 'sticker_people_15', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_15.webp' },
  { id: 'sticker_people_16', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_16.webp' },
  { id: 'sticker_people_17', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_17.webp' },
  { id: 'sticker_people_18', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_18.webp' },
  { id: 'sticker_people_19', defaultScale: 1, svgFile: '/sticker/sticker_people/sticker_people_19.webp' },
]

/**
 * 依 ID 取得 Sticker
 */
export const getStickerById = (id: string): StickerType | undefined =>
  STICKER_LIBRARY.find(s => s.id === id)

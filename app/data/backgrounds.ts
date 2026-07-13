/**
 * 便利貼背景圖片資料庫
 */

export interface BackgroundImage {
  id: string
  /** 便利貼上實際使用的圖（1254px）：烘圖需要這個解析度，而畫面上一次只會出現一張 */
  url: string
  /** 選單格子用的縮圖（128px）：選單一次列出 8 張，吃原圖等於解壓 48MB 進記憶體 */
  thumb: string
}

const BACKGROUND_IDS = ['bg-1', 'bg-2', 'bg-3', 'bg-4', 'bg-5', 'bg-6', 'bg-7', 'bg-8']

export const BACKGROUND_IMAGES: BackgroundImage[] = BACKGROUND_IDS.map(id => ({
  id,
  url: `/bg/${id}.webp`,
  thumb: `/bg-128/${id}.webp`
}))

/**
 * 根據 ID 取得背景圖片
 */
export const getBackgroundById = (id: string): BackgroundImage | undefined => {
  return BACKGROUND_IMAGES.find(bg => bg.id === id)
}

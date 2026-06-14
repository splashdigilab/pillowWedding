/**
 * 便利貼背景圖片資料庫
 */

export interface BackgroundImage {
  id: string
  url: string
}

export const BACKGROUND_IMAGES: BackgroundImage[] = [
  { id: 'bg-14', url: '/svg/bg/bg-14.svg' },
  { id: 'bg-15', url: '/svg/bg/bg-15.svg' },
  { id: 'bg-16', url: '/svg/bg/bg-16.svg' },
  { id: 'bg-17', url: '/svg/bg/bg-17.svg' },
  { id: 'bg-18', url: '/svg/bg/bg-18.svg' },
  { id: 'bg-19', url: '/svg/bg/bg-19.svg' },
  { id: 'bg-20', url: '/svg/bg/bg-20.svg' },
  { id: 'bg-12', url: '/svg/bg/bg-12.svg' },
  { id: 'bg-2', url: '/svg/bg/bg-2.svg' },
  { id: 'bg-10', url: '/svg/bg/bg-10.svg' },
  { id: 'bg-1', url: '/svg/bg/bg-1.svg' },
  { id: 'bg-11', url: '/svg/bg/bg-11.svg' },
  { id: 'bg-13', url: '/svg/bg/bg-13.svg' },
  { id: 'bg-4', url: '/svg/bg/bg-4.webp' },
  { id: 'bg-3', url: '/svg/bg/bg-3.webp' },
  { id: 'bg-5', url: '/svg/bg/bg-5.webp' },
  { id: 'bg-6', url: '/svg/bg/bg-6.webp' },
  { id: 'bg-7', url: '/svg/bg/bg-7.webp' },
  { id: 'bg-8', url: '/svg/bg/bg-8.webp' },
  { id: 'bg-9', url: '/svg/bg/bg-9.webp' },
  { id: 'bg-21', url: '/svg/bg/bg-21.svg' },

]

/**
 * 根據 ID 取得背景圖片
 */
export const getBackgroundById = (id: string): BackgroundImage | undefined => {
  return BACKGROUND_IMAGES.find(bg => bg.id === id)
}

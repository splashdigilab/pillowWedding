import type { StickerInstance } from '~/types'

/**
 * 文字區塊定位與變換樣式（編輯器與顯示端共用）
 * 規則：left/top % 錨點 + translate(-50%,-50%) 置中，scale/rotate 由 --text-scale 控制換行寬
 */
export function getTextBlockStyle(x: number, y: number, scale: number, rotation: number) {
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
    '--inverse-scale': 1 / scale,
    '--text-scale': scale
  }
}

/**
 * 貼紙定位與變換樣式（編輯器與顯示端共用）
 */
export function getStickerStyle(sticker: StickerInstance) {
  return {
    left: `${sticker.x}%`,
    top: `${sticker.y}%`,
    transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
    '--inverse-scale': 1 / sticker.scale
  }
}

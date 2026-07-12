/**
 * 貼紙可拖曳範圍（編輯器共用）
 *
 * 貼紙允許拖出畫布邊緣（超出的部分會被 canvas 的 overflow: hidden 裁掉），
 * 但至少要留 STICKER_MIN_VISIBLE_RATIO 的寬 / 高在畫布內；
 * 否則取消選取後整張貼紙都被裁掉，就再也點不到、刪不掉了。
 */
export const STICKER_MIN_VISIBLE_RATIO = 0.4

export interface StickerBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * @param halfWidthPct 貼紙半寬佔畫布寬度的百分比
 * @param halfHeightPct 貼紙半高佔畫布高度的百分比
 */
export function getStickerBounds(halfWidthPct: number, halfHeightPct: number): StickerBounds {
  // 中心在 x 時，左緣露出畫布外後可見寬度為 x + halfWidth；要求 >= 2 * halfWidth * ratio
  const marginX = halfWidthPct * (2 * STICKER_MIN_VISIBLE_RATIO - 1)
  const marginY = halfHeightPct * (2 * STICKER_MIN_VISIBLE_RATIO - 1)
  return {
    minX: marginX,
    maxX: 100 - marginX,
    minY: marginY,
    maxY: 100 - marginY
  }
}

/** 由 DOM 尺寸換算貼紙邊界；量不到尺寸時退回保守的固定邊界 */
export function measureStickerBounds(
  frameRect: DOMRect | null | undefined,
  canvasRect: DOMRect | null | undefined
): StickerBounds {
  if (!frameRect?.width || !frameRect.height || !canvasRect?.width || !canvasRect.height) {
    return { minX: 5, maxX: 95, minY: 5, maxY: 95 }
  }
  return getStickerBounds(
    (frameRect.width / canvasRect.width) * 50,
    (frameRect.height / canvasRect.height) * 50
  )
}

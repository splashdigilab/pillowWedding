import { ref } from 'vue'
import type { Ref } from 'vue'
import type { StickerInstance, TextBlockInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const SCALE_MIN = 1
const SCALE_MAX = 20
const RAD_TO_DEG = 180 / Math.PI

export interface UseCanvasPinchOptions {
  canvasRef: Ref<HTMLElement | null>
  drawMode: Ref<boolean>
  selectedTextBlockId: Ref<string | null>
  selectedStickerId: Ref<string | null>
  textBlocks: Ref<TextBlockInstance[]>
  stickers: Ref<StickerInstance[]>
  textBlockDragging: Ref<boolean>
  textBlockTransforming: Ref<boolean>
  draggingStickerId: Ref<string | null>
  transformingStickerId: Ref<string | null>
  onTextTransformEnd: () => void
  onStickerTransformEnd: () => void
  onTextDragEnd: () => void
  onStickerDragEnd: () => void
  /** 單擊文字區塊時呼叫（聚焦、可打字）；clientX/clientY 為觸碰座標，供呼叫端定位游標 */
  onTextTap?: (blockId: string, clientX: number, clientY: number) => void
  /** 在文字區塊上開始拖曳前呼叫（選取文字區塊，不聚焦） */
  onTextDragStart?: (blockId: string) => void
  /** 顯示垂直中心參考線（可選） */
  showVerticalCenterGuide?: Ref<boolean>
  /** 顯示水平中心參考線（可選） */
  showHorizontalCenterGuide?: Ref<boolean>
  /** 中心對齊 snap 門檻（百分比，預設 2%） */
  centerSnapThresholdPct?: number
  /** 旋轉 snap 門檻（角度，預設 5°） */
  rotationSnapThresholdDeg?: number
}

type PinchTarget = { textBlockId: string } | { stickerId: string }

interface PinchState {
  target: PinchTarget
  initDist: number
  initAngle: number
  initScale: number
  initRotation: number
}

type CanvasDragState =
  | {
    type: 'text'
    textBlockId: string
    startX: number
    startY: number
    initX: number
    initY: number
    halfWidthPct: number
    halfHeightPct: number
  }
  | {
    type: 'sticker'
    stickerId: string
    startX: number
    startY: number
    initX: number
    initY: number
    halfWidthPct: number
    halfHeightPct: number
  }

const EMPTY_AREA_SELECTORS = [
  '.p-editor__canvas-text',
  '.p-editor__sticker-content',
  'button'
]

const TEXT_AREA_SELECTORS = ['.p-editor__canvas-text']
const DRAG_THRESHOLD_PX = 10

/**
 * 畫布層級手勢：單指拖曳已選取物件、雙指縮放／旋轉（不改變位置）
 * 有選取時在空白處拖曳即可移動；雙指不需觸碰物件即可縮放旋轉
 */
export function useCanvasPinch(options: UseCanvasPinchOptions) {
  const {
    canvasRef,
    drawMode,
    selectedTextBlockId,
    selectedStickerId,
    textBlocks,
    stickers,
    textBlockDragging,
    textBlockTransforming,
    draggingStickerId,
    transformingStickerId,
    onTextTransformEnd,
    onStickerTransformEnd,
    onTextDragEnd,
    onStickerDragEnd,
    onTextTap,
    onTextDragStart,
    showVerticalCenterGuide,
    showHorizontalCenterGuide,
    centerSnapThresholdPct = 2,
    rotationSnapThresholdDeg = 5
  } = options

  let pinchState: PinchState | null = null
  let canvasDragState: CanvasDragState | null = null
  let pendingTextTouch: { startX: number; startY: number; blockId: string } | null = null
  const lastCanvasDragEndAt = ref(0)
  /** 雙指縮放／旋轉中：此期間不應因誤觸而切換選取其他物件 */
  const isTwoFingerGesture = ref(false)

  const hasSelection = () => {
    const id = selectedTextBlockId.value
    const block = id ? textBlocks.value.find(b => b.id === id) : undefined
    const hasUnlockedText = !!(block && !block.locked)
    return hasUnlockedText || selectedStickerId.value !== null
  }

  const clearCenterGuides = () => {
    if (showVerticalCenterGuide) showVerticalCenterGuide.value = false
    if (showHorizontalCenterGuide) showHorizontalCenterGuide.value = false
  }

  const isPointerOnEmptyArea = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement
    if (!el?.closest) return true
    return EMPTY_AREA_SELECTORS.every(sel => !el.closest(sel))
  }

  const isPointerOnTextArea = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement
    if (!el?.closest) return false
    return TEXT_AREA_SELECTORS.some(sel => el.closest(sel))
  }

  /** 從觸碰的 DOM 元素上提取 text block id */
  const getTextBlockIdFromTarget = (target: EventTarget | null): string | null => {
    const el = target as HTMLElement
    if (!el?.closest) return null
    const textEl = el.closest('[data-text-block-id]') as HTMLElement | null
    const id = textEl?.dataset.textBlockId ?? null
    if (!id) return null
    // 鎖定的文字區塊不啟動拖曳／縮放互動（僅能長按解鎖）
    const block = textBlocks.value.find(b => b.id === id)
    if (block?.locked) return null
    return id
  }

  const getSelectedBlock = (): TextBlockInstance | undefined => {
    const id = selectedTextBlockId.value
    return id ? textBlocks.value.find(b => b.id === id) : undefined
  }

  const getPinchTarget = (): PinchTarget | null => {
    const textId = selectedTextBlockId.value
    if (textId) {
      const block = textBlocks.value.find(b => b.id === textId)
      if (block && !block.locked) {
        return { textBlockId: textId }
      }
    }
    const id = selectedStickerId.value
    return id ? { stickerId: id } : null
  }

  const snapAngle = (angle: number): number => {
    const threshold = rotationSnapThresholdDeg
    if (threshold <= 0) return angle
    // 將角度正規化到 0–360 再做比較，但回傳時保留原本的周次
    let norm = angle % 360
    if (norm < 0) norm += 360
    const candidates = [0, 90, 180, 270, 360]
    for (const base of candidates) {
      const diff = Math.abs(norm - base)
      if (diff <= threshold || Math.abs(diff - 360) <= threshold) {
        const delta = base - norm
        return angle + delta
      }
    }
    return angle
  }

  const applyPinch = (state: PinchState, scaleRatio: number, angleDelta: number) => {
    const scale = clamp(state.initScale * scaleRatio, SCALE_MIN, SCALE_MAX)
    const rotation = snapAngle(state.initRotation + angleDelta)
    if ('textBlockId' in state.target) {
      const target = state.target as { textBlockId: string }
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (block) {
        block.scale = scale
        block.rotation = rotation
      }
    } else {
      const s = stickers.value.find(st => st.id === (state.target as { stickerId: string }).stickerId)
      if (s) {
        s.scale = scale
        s.rotation = rotation
      }
    }
  }

  /**
   * 在「允許位置調整」的前提下，算出不超出畫布時允許的最大 scale。
   * 只要框的半寬/半高 <= 50%，就一定能找到一個位置讓整個框待在畫布裡。
   * 因此 maxScale 只由「框尺寸與畫布尺寸」決定，與目前 x/y 無關。
   */
  const getMaxScaleForBounds = (el: HTMLElement, target: PinchTarget): number => {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return SCALE_MAX

    let currentScale: number, halfWidthPct: number, halfHeightPct: number

    if ('textBlockId' in target) {
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (!block) return SCALE_MAX
      currentScale = block.scale
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${target.textBlockId}"]`
      ) as HTMLElement | null
      if (!frameEl) return SCALE_MAX
      const fr = frameEl.getBoundingClientRect()
      halfWidthPct = (fr.width / rect.width) * 50
      halfHeightPct = (fr.height / rect.height) * 50
    } else {
      const st = stickers.value.find(s => s.id === target.stickerId)
      if (!st) return SCALE_MAX
      currentScale = st.scale
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${target.stickerId}"]`
      ) as HTMLElement | null
      if (!frameEl) return SCALE_MAX
      const fr = frameEl.getBoundingClientRect()
      halfWidthPct = (fr.width / rect.width) * 50
      halfHeightPct = (fr.height / rect.height) * 50
    }

    const eps = 1e-6
    // 框在目前 scale 下的半寬比例為 halfWidthPct，放大到 s 時會變成 halfWidthPct * (s / currentScale)
    // 限制在 <= 50%，即可保證左右仍可找到合法中心點；上下同理。
    const maxScaleX = halfWidthPct > eps ? (50 * currentScale) / halfWidthPct : SCALE_MAX
    const maxScaleY = halfHeightPct > eps ? (50 * currentScale) / halfHeightPct : SCALE_MAX
    return Math.min(maxScaleX, maxScaleY, SCALE_MAX)
  }

  /** 依目前 DOM 實際尺寸，強制把目標物完整限制在畫布內（給 pinch 縮放後使用） */
  const clampTargetWithinCanvas = (el: HTMLElement, target: PinchTarget) => {
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    if ('textBlockId' in target) {
      const id = target.textBlockId
      const block = textBlocks.value.find(b => b.id === id)
      if (!block) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${id}"]`
      ) as HTMLElement | null
      if (!frameEl) return
      const fr = frameEl.getBoundingClientRect()
      const halfWidthPct = (fr.width / rect.width) * 50
      const halfHeightPct = (fr.height / rect.height) * 50
      const minX = halfWidthPct
      const maxX = 100 - halfWidthPct
      const minY = halfHeightPct
      const maxY = 100 - halfHeightPct
      block.x = clamp(block.x, minX, maxX)
      block.y = clamp(block.y, minY, maxY)
    } else {
      const id = target.stickerId
      const st = stickers.value.find(s => s.id === id)
      if (!st) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${id}"]`
      ) as HTMLElement | null
      if (!frameEl) return
      const fr = frameEl.getBoundingClientRect()
      const halfWidthPct = (fr.width / rect.width) * 50
      const halfHeightPct = (fr.height / rect.height) * 50
      const minX = halfWidthPct
      const maxX = 100 - halfWidthPct
      const minY = halfHeightPct
      const maxY = 100 - halfHeightPct
      st.x = clamp(st.x, minX, maxX)
      st.y = clamp(st.y, minY, maxY)
    }
  }

  const attachPinchListeners = (el: HTMLElement, t0: Touch, t1: Touch) => {
    const target = getPinchTarget()
    if (!target) return

    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1
    const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX)

    if ('textBlockId' in target) {
      const block = textBlocks.value.find(b => b.id === target.textBlockId)
      if (!block) return
      pinchState = {
        target: { textBlockId: target.textBlockId },
        initDist: dist,
        initAngle: angle,
        initScale: block.scale,
        initRotation: block.rotation
      }
      textBlockTransforming.value = true
    } else if ('stickerId' in target) {
      const s = stickers.value.find(st => st.id === target.stickerId)
      if (!s) return
      pinchState = {
        target: { stickerId: target.stickerId },
        initDist: dist,
        initAngle: angle,
        initScale: s.scale,
        initRotation: s.rotation
      }
      transformingStickerId.value = target.stickerId
    }

    // 在 pinch 開始時計算一次 maxScale（此值在 pinch 過程中為常數，無需每 frame 重算）
    const cachedMaxScale = getMaxScaleForBounds(el, pinchState!.target)

    // RAF throttle：避免每個 touchmove 都同步計算並更新 DOM
    let pinchRafPending = false

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchState) return
      const a0 = e.touches[0]
      const a1 = e.touches[1]
      if (!a0 || !a1) return
      if (e.cancelable) e.preventDefault()

      if (pinchRafPending) return
      pinchRafPending = true

      const d = Math.hypot(a1.clientX - a0.clientX, a1.clientY - a0.clientY) || 1
      const a = Math.atan2(a1.clientY - a0.clientY, a1.clientX - a0.clientX)
      const scaleRatio = d / pinchState.initDist
      const angleDelta = (a - pinchState.initAngle) * RAD_TO_DEG
      const desiredScale = pinchState.initScale * scaleRatio
      const effectiveScale = clamp(desiredScale, SCALE_MIN, Math.min(cachedMaxScale, SCALE_MAX))
      const effectiveRatio = effectiveScale / pinchState.initScale

      requestAnimationFrame(() => {
        pinchRafPending = false
        if (!pinchState) return
        applyPinch(pinchState, effectiveRatio, angleDelta)
        clampTargetWithinCanvas(el, pinchState.target)
      })
    }

    const onTouchEnd = () => {
      if (pinchState) {
        if ('textBlockId' in pinchState.target) {
          textBlockTransforming.value = false
          onTextTransformEnd()
        } else {
          transformingStickerId.value = null
          onStickerTransformEnd()
        }
      }
      pinchState = null
      isTwoFingerGesture.value = false
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }

    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
  }

  const startCanvasDrag = (clientX: number, clientY: number, isTouch: boolean) => {
    const el = canvasRef.value
    if (!el) return
    clearCenterGuides()
    // 在拖曳開始時讀取一次 rect（避免在每個 touchmove 都觸發 forced layout）
    const cachedRect = el.getBoundingClientRect()
    if (!cachedRect.width || !cachedRect.height) return

    const getHalfSizePct = (frameEl: HTMLElement | null): { halfWidthPct: number; halfHeightPct: number } => {
      if (!frameEl) return { halfWidthPct: 5, halfHeightPct: 5 }
      const r = frameEl.getBoundingClientRect()
      return {
        halfWidthPct: (r.width / cachedRect.width) * 50,
        halfHeightPct: (r.height / cachedRect.height) * 50
      }
    }

    if (selectedTextBlockId.value) {
      const block = getSelectedBlock()
      // 鎖定的文字區塊不可被拖曳
      if (!block || block.locked) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--text[data-text-block-id="${block.id}"]`
      ) as HTMLElement | null
      const { halfWidthPct, halfHeightPct } = getHalfSizePct(frameEl)
      canvasDragState = {
        type: 'text',
        textBlockId: block.id,
        startX: clientX,
        startY: clientY,
        initX: block.x,
        initY: block.y,
        halfWidthPct,
        halfHeightPct
      }
      textBlockDragging.value = true
    } else if (selectedStickerId.value) {
      const s = stickers.value.find(st => st.id === selectedStickerId.value!)
      if (!s) return
      const frameEl = el.querySelector(
        `.p-editor__edit-frame--sticker[data-sticker-id="${s.id}"]`
      ) as HTMLElement | null
      const { halfWidthPct, halfHeightPct } = getHalfSizePct(frameEl)
      canvasDragState = {
        type: 'sticker',
        stickerId: s.id,
        startX: clientX,
        startY: clientY,
        initX: s.x,
        initY: s.y,
        halfWidthPct,
        halfHeightPct
      }
      draggingStickerId.value = s.id
    } else return

    // RAF throttle：確保每幀最多更新一次，與螢幕刷新率同步（60fps）
    let dragRafPending = false

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasDragState || !el) return
      if ('touches' in e && e.touches.length >= 2) return

      if (dragRafPending) return
      dragRafPending = true

      const x = 'touches' in e ? e.touches[0]?.clientX ?? canvasDragState.startX : (e as MouseEvent).clientX
      const y = 'touches' in e ? e.touches[0]?.clientY ?? canvasDragState.startY : (e as MouseEvent).clientY
      // 使用拖曳開始時快取的 rect，避免 forced layout
      const deltaX = ((x - canvasDragState.startX) / cachedRect.width) * 100
      const deltaY = ((y - canvasDragState.startY) / cachedRect.height) * 100

      requestAnimationFrame(() => {
        dragRafPending = false
        if (!canvasDragState) return

        const center = 50
        const threshold = centerSnapThresholdPct

        const applyPosition = (pos: { x: number; y: number }, halfWidthPct: number, halfHeightPct: number) => {
          let { x, y } = pos

          // 垂直中心 snap
          if (Math.abs(x - center) <= threshold) {
            x = center
            if (showVerticalCenterGuide) showVerticalCenterGuide.value = true
          } else if (showVerticalCenterGuide) {
            showVerticalCenterGuide.value = false
          }

          // 水平中心 snap
          if (Math.abs(y - center) <= threshold) {
            y = center
            if (showHorizontalCenterGuide) showHorizontalCenterGuide.value = true
          } else if (showHorizontalCenterGuide) {
            showHorizontalCenterGuide.value = false
          }

          return {
            x: clamp(x, halfWidthPct, 100 - halfWidthPct),
            y: clamp(y, halfHeightPct, 100 - halfHeightPct)
          }
        }

        if (canvasDragState.type === 'text') {
          const block = textBlocks.value.find(b => b.id === (canvasDragState as any).textBlockId)
          if (block) {
            const next = applyPosition(
              {
                x: canvasDragState.initX + deltaX,
                y: canvasDragState.initY + deltaY
              },
              canvasDragState.halfWidthPct,
              canvasDragState.halfHeightPct
            )
            block.x = next.x
            block.y = next.y
          }
        } else if (canvasDragState.type === 'sticker') {
          const st = stickers.value.find(s => s.id === (canvasDragState as any).stickerId)
          if (st) {
            const next = applyPosition(
              {
                x: canvasDragState.initX + deltaX,
                y: canvasDragState.initY + deltaY
              },
              canvasDragState.halfWidthPct,
              canvasDragState.halfHeightPct
            )
            st.x = next.x
            st.y = next.y
          }
        }
      })
    }

    const onEnd = () => {
      if (canvasDragState) {
        lastCanvasDragEndAt.value = Date.now()
        clearCenterGuides()
        if (canvasDragState.type === 'text') {
          textBlockDragging.value = false
          onTextDragEnd()
        } else {
          draggingStickerId.value = null
          onStickerDragEnd()
        }
      }
      canvasDragState = null
      if (isTouch) {
        el.removeEventListener('touchmove', onMove as (e: TouchEvent) => void, { capture: true })
        el.removeEventListener('touchend', onEnd)
        el.removeEventListener('touchcancel', onEnd)
      } else {
        document.removeEventListener('mousemove', onMove as (e: MouseEvent) => void)
        document.removeEventListener('mouseup', onEnd)
      }
    }

    if (isTouch) {
      el.addEventListener('touchmove', onMove as (e: TouchEvent) => void, { capture: true, passive: false })
      el.addEventListener('touchend', onEnd)
      el.addEventListener('touchcancel', onEnd)
    } else {
      document.addEventListener('mousemove', onMove as (e: MouseEvent) => void)
      document.addEventListener('mouseup', onEnd)
    }
  }

    const onCanvasTouchStart = (e: TouchEvent) => {
    if (drawMode.value) return
    const el = canvasRef.value
    if (!el) return

    // 刪除 / 變形控制點：交給各自元件處理，這裡不攔截，避免阻斷點擊事件（例如刪除文字區塊）
    const targetEl = e.target as HTMLElement | null
    if (targetEl?.closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle')) {
      return
    }

    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (!t) return

      if (isPointerOnTextArea(e.target)) {
        const blockId = getTextBlockIdFromTarget(e.target)
        if (blockId) {
          // 不分「是否已選取」，一律比照貼紙邏輯：
          // - 單指 tap：選取文字區塊並進入編輯（由 onTextTap 處理）
          // - 單指拖曳：超過門檻後開始拖曳整個文字區塊
          if (e.cancelable) e.preventDefault()
          e.stopPropagation()
          pendingTextTouch = { startX: t.clientX, startY: t.clientY, blockId }

          const onMove = (moveEvent: TouchEvent) => {
            if (!pendingTextTouch || !moveEvent.touches[0]) return
            const dx = moveEvent.touches[0].clientX - pendingTextTouch.startX
            const dy = moveEvent.touches[0].clientY - pendingTextTouch.startY
            if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return
            if (moveEvent.cancelable) moveEvent.preventDefault()
            onTextDragStart?.(pendingTextTouch.blockId)
            startCanvasDrag(pendingTextTouch.startX, pendingTextTouch.startY, true)
            pendingTextTouch = null
            el.removeEventListener('touchmove', onMove, { capture: true })
            el.removeEventListener('touchend', onEnd)
            el.removeEventListener('touchcancel', onEnd)
          }

          const onEnd = () => {
            if (pendingTextTouch) {
              onTextTap?.(pendingTextTouch.blockId, pendingTextTouch.startX, pendingTextTouch.startY)
              pendingTextTouch = null
            }
            el.removeEventListener('touchmove', onMove, { capture: true })
            el.removeEventListener('touchend', onEnd)
            el.removeEventListener('touchcancel', onEnd)
          }

          el.addEventListener('touchmove', onMove, { capture: true, passive: false })
          el.addEventListener('touchend', onEnd)
          el.addEventListener('touchcancel', onEnd)
          return
        }
      }

      if (hasSelection() && isPointerOnEmptyArea(e.target)) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()
        startCanvasDrag(t.clientX, t.clientY, true)
      }
      return
    }

    if (e.touches.length !== 2) return
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    isTwoFingerGesture.value = true
    if (e.cancelable) e.preventDefault()
    e.stopPropagation()
    attachPinchListeners(el, t0, t1)
  }

  /** 補捉「先放一指再放第二指」時在 touchmove 才出現的雙指 */
  const onCanvasTouchMove = (e: TouchEvent) => {
    if (drawMode.value || pinchState) return
    if (e.touches.length !== 2 || !hasSelection()) return
    const el = canvasRef.value
    if (!el) return
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    if (!t0 || !t1) return

    isTwoFingerGesture.value = true
    if (e.cancelable) e.preventDefault()
    e.stopPropagation()
    attachPinchListeners(el, t0, t1)
  }

  const onCanvasTouchEnd = () => { }


  const onCanvasMouseDown = (e: MouseEvent) => {
    if (drawMode.value || !hasSelection()) return
    if (!isPointerOnEmptyArea(e.target)) return
    e.preventDefault()
    startCanvasDrag(e.clientX, e.clientY, false)
  }

  return {
    onCanvasTouchStart,
    onCanvasTouchMove,
    onCanvasTouchEnd,
    onCanvasMouseDown,
    lastCanvasDragEndAt,
    isTwoFingerGesture
  }
}

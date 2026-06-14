import type { Ref } from 'vue'
import type { StickerInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface UseStickerInteractionOptions {
  canvasRef: Ref<HTMLElement | null>
  stickers: Ref<StickerInstance[]>
  selectedStickerId: Ref<string | null>
  draggingStickerId: Ref<string | null>
  transformingStickerId: Ref<string | null>
  selectSticker: (id: string) => void
  onDragEnd: () => void
  onTransformEnd: () => void
  /** 雙指手勢中時不切換選取（由 useCanvasPinch 提供） */
  isTwoFingerGesture?: Ref<boolean>
}

/**
 * 貼紙拖曳與旋轉縮放互動邏輯
 */
export function useStickerInteraction(options: UseStickerInteractionOptions) {
  const {
    canvasRef,
    stickers,
    selectedStickerId,
    draggingStickerId,
    transformingStickerId,
    selectSticker,
    onDragEnd,
    onTransformEnd,
    isTwoFingerGesture
  } = options

  let dragState: { stickerId: string; startX: number; startY: number; initialX: number; initialY: number } | null = null
  let transformState: {
    stickerId: string
    centerX: number
    centerY: number
    initialDistance: number
    initialAngle: number
    initialScale: number
    initialRotation: number
  } | null = null

  const onStickerMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
    if ((e.target as HTMLElement).closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle')) return
    e.preventDefault()
    selectSticker(sticker.id)
    dragState = {
      stickerId: sticker.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: sticker.x,
      initialY: sticker.y
    }
    draggingStickerId.value = sticker.id

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragState || !canvasRef.value) return
      const rect = canvasRef.value.getBoundingClientRect()
      const deltaX = ((moveEvent.clientX - dragState.startX) / rect.width) * 100
      const deltaY = ((moveEvent.clientY - dragState.startY) / rect.height) * 100
      const s = stickers.value.find(st => st.id === dragState!.stickerId)
      if (s) {
        s.x = clamp(dragState.initialX + deltaX, 5, 95)
        s.y = clamp(dragState.initialY + deltaY, 5, 95)
      }
    }

    const onMouseUp = () => {
      if (dragState) onDragEnd()
      dragState = null
      draggingStickerId.value = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onStickerTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
    if ((e.target as HTMLElement).closest('.p-editor__edit-frame-delete, .p-editor__edit-frame-transform-handle')) return
    if (isTwoFingerGesture?.value) return
    const touch = e.touches[0]
    if (!touch || e.touches.length > 1) return
    selectSticker(sticker.id)
    dragState = {
      stickerId: sticker.id,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: sticker.x,
      initialY: sticker.y
    }
    draggingStickerId.value = sticker.id

    const el = canvasRef.value
    if (!el) return

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!dragState || !moveEvent.touches[0] || moveEvent.touches.length > 1) return
      if (moveEvent.touches.length === 1 && canvasRef.value) {
        moveEvent.preventDefault()
        const t = moveEvent.touches[0]
        const rect = canvasRef.value.getBoundingClientRect()
        const deltaX = ((t.clientX - dragState.startX) / rect.width) * 100
        const deltaY = ((t.clientY - dragState.startY) / rect.height) * 100
        const s = stickers.value.find(st => st.id === dragState!.stickerId)
        if (s) {
          s.x = clamp(dragState.initialX + deltaX, 5, 95)
          s.y = clamp(dragState.initialY + deltaY, 5, 95)
        }
      }
    }

    const onTouchEnd = () => {
      if (dragState) onDragEnd()
      dragState = null
      draggingStickerId.value = null
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }

    el.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
  }

  const onStickerClick = (id: string) => {
    if (draggingStickerId.value || transformingStickerId.value) return
    selectSticker(id)
  }

  const onTransformHandleMouseDown = (e: MouseEvent, sticker: StickerInstance) => {
    e.preventDefault()
    if (!canvasRef.value) return

    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (sticker.x / 100)
    const centerY = rect.height * (sticker.y / 100)
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    transformState = {
      stickerId: sticker.id,
      centerX: sticker.x,
      centerY: sticker.y,
      initialDistance: distance,
      initialAngle: angle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    }
    transformingStickerId.value = sticker.id

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!transformState || !canvasRef.value) return
      const r = canvasRef.value.getBoundingClientRect()
      const curX = moveEvent.clientX - r.left
      const curY = moveEvent.clientY - r.top
      const cx = r.width * (transformState.centerX / 100)
      const cy = r.height * (transformState.centerY / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / transformState.initialDistance
      const angleDelta = (newAngle - transformState.initialAngle) * (180 / Math.PI)
      const s = stickers.value.find(st => st.id === transformState!.stickerId)
      if (s) {
        s.scale = clamp(transformState.initialScale * scaleRatio, 0.5, 5)
        s.rotation = transformState.initialRotation + angleDelta
      }
    }

    const onMouseUp = () => {
      if (transformState) onTransformEnd()
      transformState = null
      transformingStickerId.value = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onTransformHandleTouchStart = (e: TouchEvent, sticker: StickerInstance) => {
    const touch = e.touches[0]
    if (!touch || !canvasRef.value) return
    e.preventDefault()

    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (sticker.x / 100)
    const centerY = rect.height * (sticker.y / 100)
    const cursorX = touch.clientX - rect.left
    const cursorY = touch.clientY - rect.top
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    transformState = {
      stickerId: sticker.id,
      centerX: sticker.x,
      centerY: sticker.y,
      initialDistance: distance,
      initialAngle: angle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation
    }
    transformingStickerId.value = sticker.id

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (!transformState || !canvasRef.value || !moveEvent.touches[0]) return
      moveEvent.preventDefault()
      const t = moveEvent.touches[0]
      const r = canvasRef.value.getBoundingClientRect()
      const curX = t.clientX - r.left
      const curY = t.clientY - r.top
      const cx = r.width * (transformState.centerX / 100)
      const cy = r.height * (transformState.centerY / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / transformState.initialDistance
      const angleDelta = (newAngle - transformState.initialAngle) * (180 / Math.PI)
      const s = stickers.value.find(st => st.id === transformState!.stickerId)
      if (s) {
        s.scale = clamp(transformState.initialScale * scaleRatio, 0.3, 3)
        s.rotation = transformState.initialRotation + angleDelta
      }
    }

    const onTouchEnd = () => {
      if (transformState) onTransformEnd()
      transformState = null
      transformingStickerId.value = null
      document.removeEventListener('touchmove', onTouchMove, { capture: true })
      document.removeEventListener('touchend', onTouchEnd)
    }

    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  return {
    onStickerMouseDown,
    onStickerTouchStart,
    onStickerClick,
    onTransformHandleMouseDown,
    onTransformHandleTouchStart
  }
}

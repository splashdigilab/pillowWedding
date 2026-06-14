import type { Ref } from 'vue'
import type { TextBlockInstance } from '~/types'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export interface UseTextBlockInteractionOptions {
  canvasRef: Ref<HTMLElement | null>
  textBlocks: Ref<TextBlockInstance[]>
  selectedTextBlockId: Ref<string | null>
  textBlockDragging: Ref<boolean>
  textBlockTransforming: Ref<boolean>
  selectTextBlock: (id: string) => void
  onDragEnd: () => void
  onTransformEnd: () => void
}

/**
 * 文字區塊拖曳與旋轉縮放互動邏輯（支援多文字區塊）
 */
export function useTextBlockInteraction(options: UseTextBlockInteractionOptions) {
  const {
    canvasRef,
    textBlocks,
    selectedTextBlockId,
    textBlockDragging,
    textBlockTransforming,
    selectTextBlock,
    onDragEnd,
    onTransformEnd
  } = options

  const getSelectedBlock = (): TextBlockInstance | undefined => {
    const id = selectedTextBlockId.value
    return id ? textBlocks.value.find(b => b.id === id) : undefined
  }

  const setupDrag = (
    startX: number,
    startY: number,
    initX: number,
    initY: number,
    blockId: string,
    isTouch: boolean
  ) => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasRef.value) return
      const block = textBlocks.value.find(b => b.id === blockId)
      if (!block) return
      const rect = canvasRef.value.getBoundingClientRect()
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? startX : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY ?? startY : e.clientY
      const deltaX = ((clientX - startX) / rect.width) * 100
      const deltaY = ((clientY - startY) / rect.height) * 100
      block.x = clamp(initX + deltaX, -30, 130)
      block.y = clamp(initY + deltaY, -30, 130)
    }

    const onEnd = () => {
      textBlockDragging.value = false
      onDragEnd()
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, isTouch ? { capture: true } : undefined)
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any, isTouch ? undefined : undefined)
    }

    const addOpts = isTouch ? { capture: true, passive: false } : {}
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, addOpts)
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any)
  }

  const setupTransform = (
    centerX: number,
    centerY: number,
    cursorX: number,
    cursorY: number,
    initScale: number,
    initRotation: number,
    blockId: string,
    isTouch: boolean
  ) => {
    const dx = cursorX - centerX
    const dy = cursorY - centerY
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)

    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!canvasRef.value) return
      const block = textBlocks.value.find(b => b.id === blockId)
      if (!block) return
      const r = canvasRef.value.getBoundingClientRect()
      const curX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) - r.left : e.clientX - r.left
      const curY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) - r.top : e.clientY - r.top
      const cx = r.width * (block.x / 100)
      const cy = r.height * (block.y / 100)
      const ndx = curX - cx
      const ndy = curY - cy
      const newDist = Math.sqrt(ndx * ndx + ndy * ndy) || 1
      const newAngle = Math.atan2(ndy, ndx)
      const scaleRatio = newDist / distance
      const angleDelta = (newAngle - angle) * (180 / Math.PI)
      block.scale = clamp(initScale * scaleRatio, 1, 5)
      block.rotation = initRotation + angleDelta
    }

    const onEnd = () => {
      textBlockTransforming.value = false
      onTransformEnd()
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, isTouch ? { capture: true } : undefined)
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any, isTouch ? undefined : undefined)
    }

    const addOpts = isTouch ? { capture: true, passive: false } : {}
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove as any, addOpts)
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd as any)
  }

  const onTextBlockDragBarMouseDown = (e: MouseEvent, blockId: string) => {
    e.preventDefault()
    selectTextBlock(blockId)
    textBlockDragging.value = true
    const block = textBlocks.value.find(b => b.id === blockId)
    if (!block || !canvasRef.value) return
    setupDrag(e.clientX, e.clientY, block.x, block.y, blockId, false)
  }

  const onTextBlockDragBarTouchStart = (e: TouchEvent, blockId: string) => {
    const touch = e.touches[0]
    if (!touch) return
    e.preventDefault()
    selectTextBlock(blockId)
    textBlockDragging.value = true
    const block = textBlocks.value.find(b => b.id === blockId)
    if (!block) return
    setupDrag(touch.clientX, touch.clientY, block.x, block.y, blockId, true)
  }

  const onTextBlockTransformMouseDown = (e: MouseEvent, blockId: string) => {
    e.preventDefault()
    if (!canvasRef.value) return
    const block = textBlocks.value.find(b => b.id === blockId)
    if (!block) return
    textBlockTransforming.value = true
    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (block.x / 100)
    const centerY = rect.height * (block.y / 100)
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    setupTransform(centerX, centerY, cursorX, cursorY, block.scale, block.rotation, blockId, false)
  }

  const onTextBlockTransformTouchStart = (e: TouchEvent, blockId: string) => {
    const touch = e.touches[0]
    if (!touch || !canvasRef.value) return
    e.preventDefault()
    const block = textBlocks.value.find(b => b.id === blockId)
    if (!block) return
    textBlockTransforming.value = true
    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = rect.width * (block.x / 100)
    const centerY = rect.height * (block.y / 100)
    const cursorX = touch.clientX - rect.left
    const cursorY = touch.clientY - rect.top
    setupTransform(centerX, centerY, cursorX, cursorY, block.scale, block.rotation, blockId, true)
  }

  return {
    onTextBlockDragBarMouseDown,
    onTextBlockDragBarTouchStart,
    onTextBlockTransformMouseDown,
    onTextBlockTransformTouchStart
  }
}

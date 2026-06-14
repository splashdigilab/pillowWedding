import { ref, onMounted, onUnmounted, unref, type Ref } from 'vue'
import { gsap } from 'gsap'

export interface PanZoomState {
    x: number
    y: number
    scale: number
}

export interface PanZoomBounds {
    minX: number
    maxX: number
    minY: number
    maxY: number
}

interface UsePanZoomOptions {
    minScale?: number
    maxScale?: number
    initialX?: number
    initialY?: number
    initialScale?: number
    initialCenter?: boolean
    disabled?: Ref<boolean> | boolean
    bounds?: Ref<PanZoomBounds | null>
    boundsPadding?: number // 0.0 ~ 1.0 螢幕比例緩衝
    onTransformChange?: (state: PanZoomState) => void
}

/**
 * 處理 Element 的平移(Pan)與縮放(Zoom)
 * @param containerRef  外層容器（負責接收滑鼠/觸控事件）
 * @param contentRef    內層實際被 transform 的畫布
 * @param options       設定
 */
export function usePanZoom(
    containerRef: Ref<HTMLElement | null>,
    contentRef: Ref<HTMLElement | null>,
    options: UsePanZoomOptions = {}
) {
    const minScale = options.minScale ?? 0.1
    const maxScale = options.maxScale ?? 3

    const state = ref<PanZoomState>({
        x: options.initialX ?? 0,
        y: options.initialY ?? 0,
        scale: options.initialScale ?? 1
    })

    // 狀態
    const isDragging = ref(false)
    let startClientX = 0
    let startClientY = 0
    let startStateX = 0
    let startStateY = 0

    // Touch ( Pinch Zoom ) 狀態
    let activeTouches = 0
    let initialPinchDistance = 0
    let initialPinchScale = 1
    let initialPinchCenterX = 0
    let initialPinchCenterY = 0
    let pinchStartStateX = 0
    let pinchStartStateY = 0

    // === 效能優化：快取 container rect，避免每幀 reflow ===
    let cachedRect: DOMRect | null = null

    const cacheContainerRect = () => {
        if (containerRef.value) {
            cachedRect = containerRef.value.getBoundingClientRect()
        }
    }

    // === 效能優化：rAF 節流 ===
    let rafId: number | null = null
    let rafPending = false

    const scheduleUpdate = () => {
        if (rafPending) return
        rafPending = true
        rafId = requestAnimationFrame(() => {
            rafPending = false
            applyTransform()
        })
    }

    /** 直接套用 transform 到 DOM (不經 Vue reactivity) */
    const applyTransform = () => {
        const contentEl = contentRef.value ? ((contentRef.value as any).$el || contentRef.value) : null
        if (!contentEl || !contentEl.style) return

        // Bounds clamping — 使用快取的 rect
        const boundsVal = unref(options.bounds)
        if (boundsVal && cachedRect) {
            const paddingMult = options.boundsPadding ?? 0.5
            const padX = cachedRect.width * paddingMult
            const padY = cachedRect.height * paddingMult

            const visualMinX = (cachedRect.width / 2 + boundsVal.minX) * state.value.scale
            const visualMaxX = (cachedRect.width / 2 + boundsVal.maxX) * state.value.scale
            const visualMinY = (cachedRect.height / 2 + boundsVal.minY) * state.value.scale
            const visualMaxY = (cachedRect.height / 2 + boundsVal.maxY) * state.value.scale

            const minAllowedX = padX - visualMaxX
            const maxAllowedX = cachedRect.width - padX - visualMinX
            const minAllowedY = padY - visualMaxY
            const maxAllowedY = cachedRect.height - padY - visualMinY

            if (minAllowedX <= maxAllowedX) {
                state.value.x = Math.max(minAllowedX, Math.min(state.value.x, maxAllowedX))
            } else {
                state.value.x = (minAllowedX + maxAllowedX) / 2
            }

            if (minAllowedY <= maxAllowedY) {
                state.value.y = Math.max(minAllowedY, Math.min(state.value.y, maxAllowedY))
            } else {
                state.value.y = (minAllowedY + maxAllowedY) / 2
            }
        }

        contentEl.style.transform = `translate3d(${state.value.x}px, ${state.value.y}px, 0) scale(${state.value.scale})`
        contentEl.style.transformOrigin = '0 0'
        options.onTransformChange?.(state.value)
    }

    // 對外暴露的 updateTransform（相容 centerContent 等需要立即更新的場景）
    const updateTransform = () => {
        cacheContainerRect()
        applyTransform()
    }

    // ─── Drag (Pan) ───
    const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        if (unref(options.disabled)) return

        cacheContainerRect() // 拖曳開始時快取一次

        isDragging.value = true
        startClientX = e.clientX
        startClientY = e.clientY
        startStateX = state.value.x
        startStateY = state.value.y

        if (containerRef.value) {
            containerRef.value.setPointerCapture(e.pointerId)
            containerRef.value.style.cursor = 'grabbing'
        }
    }

    const onPointerMove = (e: PointerEvent) => {
        if (!isDragging.value) return

        const dx = e.clientX - startClientX
        const dy = e.clientY - startClientY

        state.value.x = startStateX + dx
        state.value.y = startStateY + dy
        scheduleUpdate() // rAF 節流
    }

    const onPointerUp = (e: PointerEvent) => {
        if (!isDragging.value) return
        isDragging.value = false
        if (containerRef.value) {
            containerRef.value.releasePointerCapture(e.pointerId)
            containerRef.value.style.cursor = 'grab'
        }
    }

    // ─── Wheel (Zoom) ───
    const onWheel = (e: WheelEvent) => {
        if (unref(options.disabled)) return
        e.preventDefault()

        if (!cachedRect) cacheContainerRect()
        if (!cachedRect) return

        const zoomSensitivity = 0.001
        const delta = -e.deltaY * zoomSensitivity
        let newScale = state.value.scale * Math.exp(delta)

        if (newScale < minScale) newScale = minScale
        if (newScale > maxScale) newScale = maxScale

        const clientX = e.clientX - cachedRect.left
        const clientY = e.clientY - cachedRect.top

        const contentTargetX = (clientX - state.value.x) / state.value.scale
        const contentTargetY = (clientY - state.value.y) / state.value.scale

        state.value.scale = newScale
        state.value.x = clientX - contentTargetX * newScale
        state.value.y = clientY - contentTargetY * newScale

        scheduleUpdate()
    }

    // ─── Touch (Pinch Zoom & Pan) ───
    const getPinchDistance = (touches: TouchList) => {
        if (!touches[0] || !touches[1]) return 0
        return Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        )
    }

    const getPinchCenter = (touches: TouchList) => {
        if (!touches[0] || !touches[1]) return { x: 0, y: 0 }
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        }
    }

    const onTouchStart = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        if (!containerRef.value) return
        activeTouches = e.touches.length

        cacheContainerRect() // 觸控開始時快取一次

        if (activeTouches === 1 && e.touches[0]) {
            isDragging.value = true
            startClientX = e.touches[0].clientX
            startClientY = e.touches[0].clientY
            startStateX = state.value.x
            startStateY = state.value.y
        } else if (activeTouches === 2) {
            isDragging.value = false
            initialPinchDistance = getPinchDistance(e.touches)
            initialPinchScale = state.value.scale
            const center = getPinchCenter(e.touches)
            initialPinchCenterX = center.x
            initialPinchCenterY = center.y
            pinchStartStateX = state.value.x
            pinchStartStateY = state.value.y
        }
    }

    const onTouchMove = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        e.preventDefault()
        if (!containerRef.value) return

        if (activeTouches === 1 && isDragging.value && e.touches[0]) {
            const dx = e.touches[0].clientX - startClientX
            const dy = e.touches[0].clientY - startClientY
            state.value.x = startStateX + dx
            state.value.y = startStateY + dy
            scheduleUpdate() // rAF 節流
        } else if (activeTouches === 2) {
            const currentDistance = getPinchDistance(e.touches)
            const currentCenter = getPinchCenter(e.touches)

            if (initialPinchDistance === 0) return
            const scaleRatio = currentDistance / initialPinchDistance
            let newScale = initialPinchScale * scaleRatio

            if (newScale < minScale) newScale = minScale
            if (newScale > maxScale) newScale = maxScale

            if (!cachedRect) cacheContainerRect()
            if (!cachedRect) return

            const centerClientX = initialPinchCenterX - cachedRect.left
            const centerClientY = initialPinchCenterY - cachedRect.top

            const contentTargetX = (centerClientX - pinchStartStateX) / initialPinchScale
            const contentTargetY = (centerClientY - pinchStartStateY) / initialPinchScale

            state.value.scale = newScale
            state.value.x = centerClientX - contentTargetX * newScale
            state.value.y = centerClientY - contentTargetY * newScale

            const panDx = currentCenter.x - initialPinchCenterX
            const panDy = currentCenter.y - initialPinchCenterY
            state.value.x += panDx
            state.value.y += panDy

            scheduleUpdate() // rAF 節流
        }
    }

    const onTouchEnd = (e: TouchEvent) => {
        if (unref(options.disabled)) return
        activeTouches = e.touches.length
        if (activeTouches === 0) {
            isDragging.value = false
        } else if (activeTouches === 1 && e.touches[0]) {
            isDragging.value = true
            startClientX = e.touches[0].clientX
            startClientY = e.touches[0].clientY
            startStateX = state.value.x
            startStateY = state.value.y
        }
    }

    // 將中心點移至畫面中央
    const centerContent = () => {
        if (!containerRef.value) return
        cacheContainerRect()
        if (!cachedRect) return
        const targetScale = options.initialScale ?? 1
        gsap.to(state.value, {
            x: (cachedRect.width / 2) * (1 - targetScale),
            y: (cachedRect.height / 2) * (1 - targetScale),
            scale: targetScale,
            duration: 0.8,
            ease: 'power3.out',
            onUpdate: applyTransform
        })
    }

    onMounted(() => {
        const el = containerRef.value
        if (el) {
            el.style.touchAction = 'none'
            el.style.cursor = 'grab'

            el.addEventListener('pointerdown', onPointerDown)
            el.addEventListener('pointermove', onPointerMove)
            el.addEventListener('pointerup', onPointerUp)
            el.addEventListener('pointercancel', onPointerUp)
            el.addEventListener('wheel', onWheel, { passive: false })

            el.addEventListener('touchstart', onTouchStart, { passive: false })
            el.addEventListener('touchmove', onTouchMove, { passive: false })
            el.addEventListener('touchend', onTouchEnd)
            el.addEventListener('touchcancel', onTouchEnd)

            if (options.initialCenter) {
                cacheContainerRect()
                if (cachedRect) {
                    state.value.x = (cachedRect.width / 2) * (1 - state.value.scale)
                    state.value.y = (cachedRect.height / 2) * (1 - state.value.scale)
                }
            }

            applyTransform()
        }
    })

    onUnmounted(() => {
        if (rafId) cancelAnimationFrame(rafId)

        const el = containerRef.value
        if (el) {
            el.removeEventListener('pointerdown', onPointerDown)
            el.removeEventListener('pointermove', onPointerMove)
            el.removeEventListener('pointerup', onPointerUp)
            el.removeEventListener('pointercancel', onPointerUp)
            el.removeEventListener('wheel', onWheel)

            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('touchcancel', onTouchEnd)
        }
    })

    return {
        state,
        centerContent,
        updateTransform
    }
}

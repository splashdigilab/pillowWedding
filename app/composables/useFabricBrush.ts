/**
 * useFabricBrush
 *
 * Fabric.js 以動態 import 載入，讓編輯器主 bundle 不包含 ~500KB 的 Fabric.js，
 * 顯著降低低端手機因 JS 解析/執行過重而崩潰的機率。
 * Fabric.js 只在使用者首次呼叫 init() 時才開始下載（瀏覽器通常會快取，後續載入幾乎免費）。
 */

// ── 橡皮擦路徑取樣距離平方（避免每個 touchmove 都新增 Path 物件）
const MIN_ERASER_DIST_SQ = 9 // ≥ 3px 才累積下一個點

function drawBrushCursor(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** 標記橡皮擦路徑所屬的筆畫 ID，undo 時一次移除同筆畫 */
const ERASER_STROKE_KEY = '__eraserStrokeId'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any

export function useFabricBrush(onPathCreated?: () => void) {
  let fabricCanvas: AnyObj = null
  let pencilBrush: AnyObj = null
  let eraserBrush: AnyObj = null
  const redoStack: AnyObj[] = []
  let onUndoRedoChange: (() => void) | null = null
  let initialWidth = 0
  let initialHeight = 0
  let _isMinimized = false

  const getPathObjects = (): AnyObj[] =>
    fabricCanvas?.getObjects().filter((obj: AnyObj) => obj?.isType?.('Path', 'path')) ?? []

  /**
   * 非同步初始化：動態載入 Fabric.js，首次呼叫後 Vite 會快取成獨立 chunk。
   * 後續所有 set* 方法均做 null 防護，在 init 完成前呼叫只是 no-op，不會崩潰。
   */
  const init = async (canvasEl: HTMLCanvasElement | null, width: number, height: number): Promise<void> => {
    if (!canvasEl || !import.meta.client) return
    if (fabricCanvas) return // 防止重複初始化

    initialWidth = width
    initialHeight = height

    // ── 動態載入 Fabric.js（不進入主 bundle）
    const { Canvas, PencilBrush } = await import('fabric')

    // ── 橡皮擦筆刷：繼承 PencilBrush，使用 destination-out 混合模式
    //    關鍵修正：onMouseMove 加入距離門檻，避免每個 touchmove 點都新增 Path 物件
    class EraserBrush extends PencilBrush {
      _currentStrokeId = 0
      _lastAddedPoint: { x: number; y: number } | null = null

      override _setBrushStyles(ctx: CanvasRenderingContext2D) {
        super._setBrushStyles(ctx)
        ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
      }

      override _saveAndTransform(ctx: CanvasRenderingContext2D) {
        super._saveAndTransform(ctx)
        ctx.globalCompositeOperation = 'destination-out'
      }

      override _render(ctx: CanvasRenderingContext2D = (this as AnyObj).canvas.contextTop) {
        const points: AnyObj[] = (this as AnyObj)._points
        if (points.length > 0) {
          const p = points[points.length - 1]
          if (p) {
            this._saveAndTransform(ctx)
            ctx.globalCompositeOperation = 'source-over'
            drawBrushCursor(ctx, p.x, p.y, (this as AnyObj).width / 2)
            ctx.restore()
          }
        }
      }

      override onMouseDown(pointer: AnyObj, ev: AnyObj) {
        this._currentStrokeId += 1
        this._lastAddedPoint = null
        super.onMouseDown(pointer, ev)
        ;(this as AnyObj).canvas.renderTop()
      }

      override onMouseMove(pointer: AnyObj, ev: AnyObj) {
        super.onMouseMove(pointer, ev)
        const points: AnyObj[] = (this as AnyObj)._points
        if (points.length >= 2) {
          const p1 = points[points.length - 2]
          const p2 = points[points.length - 1]
          if (p1 && p2) {
            // 距離門檻：避免每個微小移動都累積 Path 物件
            const dx = p2.x - p1.x
            const dy = p2.y - p1.y
            if (dx * dx + dy * dy >= MIN_ERASER_DIST_SQ) {
              const pathData: AnyObj = [['M', p1.x, p1.y], ['L', p2.x, p2.y]]
              const path = (this as AnyObj).createPath(pathData)
              ;(path as AnyObj)[ERASER_STROKE_KEY] = this._currentStrokeId
              ;(this as AnyObj).canvas.add(path)
              this._lastAddedPoint = p2
            }
          }
        }
        if (points.length > 0) {
          ;(this as AnyObj).canvas.renderTop()
        }
        ;(this as AnyObj).canvas.requestRenderAll()
      }

      override onMouseUp(ev: AnyObj) {
        const canvas: AnyObj = (this as AnyObj).canvas
        if (!canvas._isMainEvent(ev.e)) return true
        ;(this as AnyObj).drawStraightLine = false
        ;(this as AnyObj).oldEnd = undefined
        this._lastAddedPoint = null
        canvas.clearContext(canvas.contextTop)
        canvas.requestRenderAll()
        canvas.fire('path:created', { path: undefined as AnyObj })
        return false
      }

      override createPath(pathData: AnyObj): AnyObj {
        const path = super.createPath(pathData)
        path.set({
          fill: null,
          stroke: 'rgba(255, 255, 255, 1)',
          globalCompositeOperation: 'destination-out'
        })
        return path
      }
    }

    fabricCanvas = new Canvas(canvasEl, {
      width,
      height,
      isDrawingMode: true,
      backgroundColor: 'transparent',
      selection: false,
      controlsAboveOverlay: false,
      preserveObjectStacking: true
    })

    fabricCanvas.on('path:created', () => {
      redoStack.length = 0
      onUndoRedoChange?.()
      if (onPathCreated) onPathCreated()
    })

    pencilBrush = new PencilBrush(fabricCanvas)
    pencilBrush.color = '#333333'
    pencilBrush.width = 4

    eraserBrush = new EraserBrush(fabricCanvas)
    eraserBrush.color = 'rgba(255, 255, 255, 1)'
    eraserBrush.width = 16

    fabricCanvas.freeDrawingBrush = pencilBrush
  }

  const setDrawingMode = (enabled: boolean) => {
    if (fabricCanvas) fabricCanvas.isDrawingMode = enabled
  }

  const setEraserMode = (enabled: boolean) => {
    if (!fabricCanvas || !pencilBrush || !eraserBrush) return
    fabricCanvas.freeDrawingBrush = enabled ? eraserBrush : pencilBrush
  }

  const setBrushColor = (color: string) => {
    if (pencilBrush) pencilBrush.color = color
  }

  const setBrushWidth = (width: number) => {
    if (pencilBrush) pencilBrush.width = width
  }

  const setEraserWidth = (width: number) => {
    if (eraserBrush) eraserBrush.width = width
  }

  const exportToDataURL = (): string | null => {
    if (!fabricCanvas) return null
    return fabricCanvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
  }

  const setOnUndoRedoChange = (cb: (() => void) | null) => {
    onUndoRedoChange = cb
  }

  const undo = () => {
    if (!fabricCanvas) return
    const paths = getPathObjects()
    const last = paths[paths.length - 1]
    if (!last) return
    const strokeId = (last as AnyObj)[ERASER_STROKE_KEY] as number | undefined
    if (strokeId !== undefined) {
      const toRemove = paths.filter((p) => (p as AnyObj)[ERASER_STROKE_KEY] === strokeId)
      toRemove.reverse()
      for (const p of toRemove) {
        fabricCanvas.remove(p)
        redoStack.push(p)
      }
    } else {
      fabricCanvas.remove(last)
      redoStack.push(last)
    }
    fabricCanvas.renderAll()
    onUndoRedoChange?.()
  }

  const redo = () => {
    if (!fabricCanvas || redoStack.length === 0) return
    const lastPopped = redoStack.pop()!
    const strokeId = (lastPopped as AnyObj)[ERASER_STROKE_KEY] as number | undefined
    const toAdd: AnyObj[] = [lastPopped]
    if (strokeId !== undefined) {
      while (redoStack.length > 0) {
        const next = redoStack[redoStack.length - 1]
        if ((next as AnyObj)[ERASER_STROKE_KEY] === strokeId) {
          toAdd.push(redoStack.pop()!)
        } else {
          break
        }
      }
      toAdd.reverse()
    }
    for (const p of toAdd) {
      fabricCanvas.add(p)
    }
    fabricCanvas.renderAll()
    onUndoRedoChange?.()
  }

  const canUndo = () => getPathObjects().length > 0
  const canRedo = () => redoStack.length > 0

  const loadFromDataURL = async (dataUrl: string): Promise<void> => {
    if (!fabricCanvas) return
    try {
      redoStack.length = 0
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      const { FabricImage } = await import('fabric')
      const img = await FabricImage.fromURL(dataUrl)
      if (img.width && img.height) {
        const w = fabricCanvas.getWidth()
        const h = fabricCanvas.getHeight()
        if (initialWidth === 0 || initialHeight === 0) {
          initialWidth = w
          initialHeight = h
        }
        const scale = Math.min(w / img.width, h / img.height)
        img.set({
          left: w / 2,
          top: h / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false
        })
        fabricCanvas.add(img)
        fabricCanvas.renderAll()
      }
      onUndoRedoChange?.()
    } catch (e) {
      console.error('Failed to load drawing:', e)
    }
  }

  const clear = () => {
    if (fabricCanvas) {
      redoStack.length = 0
      fabricCanvas.clear()
      fabricCanvas.backgroundColor = 'transparent'
      initialWidth = fabricCanvas.getWidth()
      initialHeight = fabricCanvas.getHeight()
      fabricCanvas.renderAll()
      onUndoRedoChange?.()
    }
  }

  const resize = (width: number, height: number) => {
    if (!fabricCanvas || width <= 0 || height <= 0) return
    if (initialWidth === 0 || initialHeight === 0) {
      initialWidth = width
      initialHeight = height
      fabricCanvas.setDimensions({ width, height })
      fabricCanvas.renderAll()
      return
    }

    const scaleRatio = width / initialWidth
    if (Math.abs(scaleRatio - 1) < 0.001) return

    const objects = fabricCanvas.getObjects()
    for (const obj of objects) {
      const currentLeft = obj.left ?? 0
      const currentTop = obj.top ?? 0
      const currentScaleX = obj.scaleX ?? 1
      const currentScaleY = obj.scaleY ?? 1
      obj.set({
        left: currentLeft * scaleRatio,
        top: currentTop * scaleRatio,
        scaleX: currentScaleX * scaleRatio,
        scaleY: currentScaleY * scaleRatio
      })
      obj.setCoords()
    }

    initialWidth = width
    initialHeight = height
    fabricCanvas.setDimensions({ width, height })
    fabricCanvas.renderAll()
  }

  const isInitialized = () => !!fabricCanvas

  /**
   * 最小化畫布：透過 Fabric.js setDimensions 將 canvas 縮為 1×1，
   * 釋放 GPU backing store（~1.4MB），離開繪圖模式時呼叫。
   * 使用官方 API 確保 Fabric.js 內部 width/height 與 DOM 保持同步，
   * 避免後續 restoreCanvas 呼叫 setWidth 時因「值未變」而跳過 DOM 更新。
   */
  const minimizeCanvas = () => {
    if (!fabricCanvas || _isMinimized) return
    fabricCanvas.setDimensions({ width: 1, height: 1 })
    _isMinimized = true
  }

  /**
   * 恢復畫布：僅在 minimizeCanvas 呼叫過的情況才執行，
   * 避免第一次進入繪圖 tab 時觸發不必要的 setDimensions + renderAll。
   */
  const restoreCanvas = () => {
    if (!fabricCanvas || !_isMinimized || !initialWidth || !initialHeight) return
    fabricCanvas.setDimensions({ width: initialWidth, height: initialHeight })
    fabricCanvas.renderAll()
    _isMinimized = false
  }

  const dispose = () => {
    if (fabricCanvas) {
      redoStack.length = 0
      onUndoRedoChange = null
      _isMinimized = false
      fabricCanvas.dispose()
      fabricCanvas = null
      pencilBrush = null
      eraserBrush = null
    }
  }

  return {
    init,
    setDrawingMode,
    setEraserMode,
    setBrushColor,
    setBrushWidth,
    setEraserWidth,
    exportToDataURL,
    loadFromDataURL,
    clear,
    resize,
    dispose,
    minimizeCanvas,
    restoreCanvas,
    isInitialized,
    getCanvas: () => fabricCanvas,
    undo,
    redo,
    canUndo,
    canRedo,
    setOnUndoRedoChange
  }
}

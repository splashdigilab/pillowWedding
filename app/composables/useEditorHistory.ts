import { readonly } from 'vue'
import type { StickerInstance } from '~/types'

/**
 * 編輯器狀態快照（用於 undo/redo）
 */
export interface EditorSnapshot {
  content: string
  backgroundImage: string
  shape: string
  textColor: string
  stickers: StickerInstance[]
  textTransform: { x: number; y: number; scale: number; rotation: number }
  drawing: string | null
}

function deepCloneSnapshot(snap: EditorSnapshot): EditorSnapshot {
  return {
    content: snap.content,
    backgroundImage: snap.backgroundImage,
    shape: snap.shape,
    textColor: snap.textColor,
    stickers: snap.stickers.map(s => ({ ...s })),
    textTransform: { ...snap.textTransform },
    drawing: snap.drawing
  }
}

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  if (
    a.content !== b.content ||
    a.backgroundImage !== b.backgroundImage ||
    a.shape !== b.shape ||
    a.textColor !== b.textColor ||
    a.drawing !== b.drawing ||
    a.textTransform.x !== b.textTransform.x ||
    a.textTransform.y !== b.textTransform.y ||
    a.textTransform.scale !== b.textTransform.scale ||
    a.textTransform.rotation !== b.textTransform.rotation
  ) {
    return false
  }
  if (a.stickers.length !== b.stickers.length) return false
  for (let i = 0; i < a.stickers.length; i++) {
    const sa = a.stickers[i]
    const sb = b.stickers[i]
    if (
      sa.id !== sb.id ||
      sa.type !== sb.type ||
      sa.x !== sb.x ||
      sa.y !== sb.y ||
      sa.scale !== sb.scale ||
      sa.rotation !== sb.rotation
    ) {
      return false
    }
  }
  return true
}

const MAX_HISTORY = 50

export const useEditorHistory = (options: {
  getSnapshot: () => EditorSnapshot
  applySnapshot: (snap: EditorSnapshot) => void | Promise<void>
  maxSize?: number
}) => {
  const { getSnapshot, applySnapshot, maxSize = MAX_HISTORY } = options
  const history = ref<EditorSnapshot[]>([])
  const historyIndex = ref(-1)
  const isRestoring = ref(false)

  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1 && history.value.length > 0)

  /**
   * 初始化歷史（放入目前狀態作為起點）
   */
  const init = () => {
    if (history.value.length === 0) {
      history.value = [deepCloneSnapshot(getSnapshot())]
      historyIndex.value = 0
    }
  }

  /**
   * 將目前狀態推入歷史（在變更「之後」呼叫）
   */
  const push = () => {
    if (isRestoring.value) return
    const snap = deepCloneSnapshot(getSnapshot())
    const current = history.value[historyIndex.value]
    if (current && snapshotsEqual(snap, current)) return

    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }
    history.value.push(snap)
    if (history.value.length > maxSize) {
      history.value = history.value.slice(-maxSize)
      historyIndex.value = history.value.length - 1
    } else {
      historyIndex.value = history.value.length - 1
    }
  }

  const undo = async () => {
    if (!canUndo.value) return
    historyIndex.value--
    isRestoring.value = true
    try {
      await applySnapshot(history.value[historyIndex.value])
    } finally {
      isRestoring.value = false
    }
  }

  const redo = async () => {
    if (!canRedo.value) return
    historyIndex.value++
    isRestoring.value = true
    try {
      await applySnapshot(history.value[historyIndex.value])
    } finally {
      isRestoring.value = false
    }
  }

  const clear = () => {
    history.value = []
    historyIndex.value = -1
  }

  return {
    push,
    undo,
    redo,
    init,
    clear,
    canUndo,
    canRedo,
    isRestoring: readonly(isRestoring)
  }
}

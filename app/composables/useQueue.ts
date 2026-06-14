import type { QueuePendingItem } from '~/types'
import type { Unsubscribe } from 'firebase/firestore'
import type { Ref } from 'vue'

/**
 * 全域單例狀態（跨 HMR 持久化）
 * 使用 globalThis 確保 Vite HMR 替換模組時不會產生多個實例
 */
const SINGLETON_KEY = '__willmusic_queue_singleton__'

interface QueueSingleton {
  queue: Ref<QueuePendingItem[]>
  currentItem: Ref<QueuePendingItem | null>
  isPlaying: Ref<boolean>
  isCompleting: boolean
  completedIds: Set<string>
  unsubscribe: Unsubscribe | null
  autoPlayTimer: ReturnType<typeof setTimeout> | null
}

function getOrCreateSingleton(): QueueSingleton {
  const g = globalThis as any
  if (!g[SINGLETON_KEY]) {
    g[SINGLETON_KEY] = {
      queue: ref<QueuePendingItem[]>([]),
      currentItem: ref<QueuePendingItem | null>(null),
      isPlaying: ref<boolean>(false),
      isCompleting: false,
      completedIds: new Set<string>(),
      unsubscribe: null,
      autoPlayTimer: null,
    }
    console.log('[useQueue] Created new singleton')
  }
  return g[SINGLETON_KEY]
}

// HMR：模組被替換前，清理舊的 listener 和 timer
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const g = globalThis as any
    const s = g[SINGLETON_KEY] as QueueSingleton | undefined
    if (s) {
      if (s.unsubscribe) {
        s.unsubscribe()
        s.unsubscribe = null
        console.log('[useQueue] HMR dispose: listener cleaned up')
      }
      if (s.autoPlayTimer) {
        clearTimeout(s.autoPlayTimer)
        s.autoPlayTimer = null
        console.log('[useQueue] HMR dispose: timer cleaned up')
      }
    }
    // 刪除 singleton，讓下一個模組版本重新建立
    delete g[SINGLETON_KEY]
  })
}

export const useQueue = () => {
  const { listenToPendingQueue, moveToHistory } = useFirestore()

  const s = getOrCreateSingleton()

  /**
   * 開始監聽佇列
   */
  const startListening = () => {
    if (s.unsubscribe) return

    console.log('[useQueue] startListening')
    s.unsubscribe = listenToPendingQueue((items) => {
      s.queue.value = items.filter(item => !s.completedIds.has(item.id ?? ''))

      if (!s.isPlaying.value && !s.isCompleting && s.queue.value.length > 0) {
        playNext()
      }
    })
  }

  /**
   * 停止監聽佇列
   */
  const stopListening = () => {
    if (s.unsubscribe) {
      s.unsubscribe()
      s.unsubscribe = null
    }
    if (s.autoPlayTimer) {
      clearTimeout(s.autoPlayTimer)
      s.autoPlayTimer = null
    }
  }

  /**
   * 播放下一個項目
   */
  const playNext = () => {
    const available = s.queue.value.filter(item => !s.completedIds.has(item.id ?? ''))

    if (available.length === 0) {
      s.currentItem.value = null
      s.isPlaying.value = false
      return
    }

    const next = available[0]
    if (!next) return
    s.currentItem.value = next
    s.isPlaying.value = true
    console.log(`[useQueue] playNext: ${next.id}`)
  }

  /**
   * 完成當前項目（移至歷史紀錄）
   */
  const completeCurrentItem = async () => {
    if (!s.currentItem.value || s.isCompleting) return

    const itemToComplete = s.currentItem.value
    const itemId = itemToComplete.id ?? ''

    if (itemId) {
      if (s.completedIds.has(itemId)) {
        console.log(`[useQueue] completeCurrentItem: ${itemId} already completed, skip`)
        return
      }
      s.completedIds.add(itemId)
    }

    s.isCompleting = true
    s.currentItem.value = null
    s.isPlaying.value = false

    console.log(`[useQueue] completeCurrentItem: START ${itemId}`)

    try {
      await moveToHistory(itemToComplete)
      console.log(`[useQueue] completeCurrentItem: moveToHistory done for ${itemId}`)

      playNext()
    } catch (error) {
      console.error('[useQueue] completeCurrentItem error:', error)
      if (itemId) s.completedIds.delete(itemId)
      s.currentItem.value = itemToComplete
      s.isPlaying.value = true
      throw error
    } finally {
      s.isCompleting = false
    }
  }

  /**
   * 設定自動播放計時器（由 display.vue 呼叫）
   */
  const startAutoPlay = (durationMs: number) => {
    if (s.autoPlayTimer) {
      clearTimeout(s.autoPlayTimer)
    }
    if (s.currentItem.value) {
      s.autoPlayTimer = setTimeout(async () => {
        s.autoPlayTimer = null
        await completeCurrentItem()
      }, durationMs)
    }
  }

  const queueLength = computed(() => s.queue.value.length)

  onUnmounted(() => {
    stopListening()
  })

  return {
    queue: readonly(s.queue),
    currentItem: readonly(s.currentItem),
    isPlaying: readonly(s.isPlaying),
    queueLength,
    startListening,
    stopListening,
    playNext,
    completeCurrentItem,
    startAutoPlay
  }
}

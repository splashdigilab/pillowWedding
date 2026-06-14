import type { ScreenSyncMessage } from '~/types/screen-sync'

const CHANNEL_NAME = 'willmusic-screen-sync'
const SINGLETON_KEY = '__willmusic_screen_sync__'

type MessageHandler = (msg: ScreenSyncMessage) => void

interface SyncSingleton {
  channel: BroadcastChannel
  handlers: Set<MessageHandler>
}

function getOrCreate(): SyncSingleton | null {
  if (typeof window === 'undefined') return null
  const g = globalThis as Record<string, any>
  if (!g[SINGLETON_KEY]) {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    const handlers = new Set<MessageHandler>()
    channel.onmessage = (e) => {
      for (const h of handlers) h(e.data as ScreenSyncMessage)
    }
    g[SINGLETON_KEY] = { channel, handlers }
  }
  return g[SINGLETON_KEY]
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const g = globalThis as Record<string, any>
    const s = g[SINGLETON_KEY] as SyncSingleton | undefined
    if (s) {
      s.channel.close()
      delete g[SINGLETON_KEY]
    }
  })
}

export function useScreenSync() {
  /**
   * 傳送訊息給另一個分頁（BroadcastChannel 使用 structured clone，先 JSON 轉換確保可 clone）
   */
  const send = (msg: ScreenSyncMessage): void => {
    try {
      const clone = JSON.parse(JSON.stringify(msg)) as ScreenSyncMessage
      getOrCreate()?.channel.postMessage(clone)
    } catch (e) {
      console.error('[useScreenSync] postMessage clone failed:', e)
    }
  }

  /**
   * 監聽來自另一個分頁的訊息，回傳 unsubscribe fn
   */
  const onMessage = (handler: MessageHandler): (() => void) => {
    const s = getOrCreate()
    if (!s) return () => {}
    s.handlers.add(handler)
    return () => s.handlers.delete(handler)
  }

  return { send, onMessage }
}

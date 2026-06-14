/**
 * LocalStorage 和 SessionStorage 工具函式
 */
import type { DraftData } from '~/types'

const DRAFT_KEY = 'willmusic_draft'
const TOKEN_KEY = 'willmusic_token'

/** 從 localStorage 解析出的 objectLayerOrder 做複製並將值轉成 number，避免字串或參考問題 */
function normalizeObjectLayerOrder(
  raw: unknown
): Record<string, number> | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const key of Object.keys(obj)) {
    const n = Number(obj[key])
    if (!Number.isNaN(n)) out[key] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export const useStorage = () => {
  /**
   * 儲存草稿到 LocalStorage
   */
  const saveDraft = (data: DraftData) => {
    if (!import.meta.client) return

    try {
      const draft = {
        ...data,
        timestamp: Date.now()
      }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch (error) {
      console.error('Error saving draft:', error)
    }
  }

  /**
   * 從 LocalStorage 讀取草稿
   * 支援舊格式遷移（backgroundColor → backgroundImage, 補上 shape）
   */
  const loadDraft = (): DraftData | null => {
    if (!import.meta.client) return null

    try {
      const draftStr = localStorage.getItem(DRAFT_KEY)
      if (!draftStr) return null

      const raw = JSON.parse(draftStr) as Record<string, unknown>

      // 檢查草稿是否過期（24 小時）
      const ts = typeof raw.timestamp === 'number' ? raw.timestamp : 0
      if (Date.now() - ts > 24 * 60 * 60 * 1000) {
        clearDraft()
        return null
      }

      // 遷移舊格式 → 統一 DraftData
      const draft: DraftData = {
        content: typeof raw.content === 'string' ? raw.content : '',
        backgroundImage:
          typeof raw.backgroundImage === 'string'
            ? raw.backgroundImage
            : (typeof raw.backgroundColor === 'string' ? raw.backgroundColor : ''),
        shape: typeof raw.shape === 'string' ? raw.shape : 'square',
        textColor: typeof raw.textColor === 'string' ? raw.textColor : '#333333',
        textAlign: typeof raw.textAlign === 'string' ? (raw.textAlign as DraftData['textAlign']) : undefined,
        stickers: Array.isArray(raw.stickers) ? (raw.stickers as DraftData['stickers']) : [],
        textTransform:
          raw.textTransform && typeof raw.textTransform === 'object'
            ? (raw.textTransform as DraftData['textTransform'])
            : undefined,
        // 多文字區塊（新版）：若存在則直接還原；舊版沒有此欄位時為 undefined
        textBlocks: Array.isArray((raw as any).textBlocks)
          ? ((raw as any).textBlocks as DraftData['textBlocks'])
          : undefined,
        drawing: typeof raw.drawing === 'string' ? raw.drawing : undefined,
        objectLayerOrder: normalizeObjectLayerOrder(raw.objectLayerOrder),
        timestamp: ts
      }

      return draft
    } catch (error) {
      console.error('Error loading draft:', error)
      return null
    }
  }

  /**
   * 清除草稿
   */
  const clearDraft = () => {
    if (!import.meta.client) return
    localStorage.removeItem(DRAFT_KEY)
  }

  /**
   * 儲存 Token 到 SessionStorage
   */
  const saveToken = (token: string) => {
    if (!import.meta.client) return

    try {
      sessionStorage.setItem(TOKEN_KEY, token)
    } catch (error) {
      console.error('Error saving token:', error)
    }
  }

  /**
   * 從 SessionStorage 讀取 Token
   */
  const loadToken = (): string | null => {
    if (!import.meta.client) return null

    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch (error) {
      console.error('Error loading token:', error)
      return null
    }
  }

  /**
   * 清除 Token
   */
  const clearToken = () => {
    if (!import.meta.client) return
    sessionStorage.removeItem(TOKEN_KEY)
  }

  /**
   * 檢查是否有草稿
   */
  const hasDraft = computed(() => {
    if (!import.meta.client) return false
    return !!localStorage.getItem(DRAFT_KEY)
  })

  /**
   * 檢查是否有 Token
   */
  const hasToken = computed(() => {
    if (!import.meta.client) return false
    return !!sessionStorage.getItem(TOKEN_KEY)
  })

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    saveToken,
    loadToken,
    clearToken,
    hasDraft,
    hasToken
  }
}

import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  getDocs,
  where,
  doc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  getDoc,
  setDoc,
  type Unsubscribe,
  type QueryDocumentSnapshot,
  type DocumentData
} from 'firebase/firestore'
import type {
  QueuePendingItem,
  QueueHistoryItem,
  TokenDocument,
  CreateNoteForm
} from '~/types'

export const useFirestore = () => {
  const { $firestore } = useNuxtApp()
  const db = $firestore as any

  /**
   * 移除物件中的 undefined 欄位（Firestore 不接受 undefined）
   */
  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) return obj
    if (Array.isArray(obj)) return obj.map(removeUndefined)
    if (typeof obj === 'object') {
      const result: Record<string, any> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) result[k] = removeUndefined(v)
      }
      return result
    }
    return obj
  }

  /**
   * 建立新的便利貼並加入待處理佇列
   * - 有 token：使用 token 作為 queue_pending 的 doc ID，並在 transaction 內將 token 標記為 used
   * - 無 token：直接建立 queue_pending 文件（給後台關閉 token 驗證時使用）
   */
  const createNote = async (form: CreateNoteForm, token?: string): Promise<string> => {
    try {
      const sanitizedStyle = removeUndefined(form.style)
      const createNoteWithToken = async (resolvedToken: string): Promise<string> => {
        const noteData = {
          content: form.content,
          style: sanitizedStyle,
          token: resolvedToken,
          timestamp: serverTimestamp(),
          status: 'waiting'
        }

        const pendingRef = doc(db, 'queue_pending', resolvedToken)
        const tokenRef = doc(db, 'tokens', resolvedToken)

        await runTransaction(db, async (transaction) => {
          // 先讀取 token 確保狀態
          const tokenSnap = await transaction.get(tokenRef)
          if (!tokenSnap.exists()) {
            throw new Error('Token does not exist')
          }

          const tokenData = tokenSnap.data()
          if (tokenData.status !== 'unused') {
            throw new Error('Token already used')
          }

          // 寫入 pending queue 並將 token 標記為 used
          transaction.set(pendingRef, noteData)
          transaction.update(tokenRef, { status: 'used' })
        })

        return resolvedToken
      }

      if (token) {
        return await createNoteWithToken(token)
      }

      const pendingRef = doc(collection(db, 'queue_pending'))
      try {
        await setDoc(pendingRef, {
          content: form.content,
          style: sanitizedStyle,
          token: pendingRef.id,
          timestamp: serverTimestamp(),
          status: 'waiting'
        })
        return pendingRef.id
      } catch (error: any) {
        const denied =
          error?.code === 'permission-denied' ||
          String(error?.message || '').includes('Missing or insufficient permissions')
        if (!denied) throw error

        // 當後端 Rules 仍強制 token 寫入時，自動建立內部 token 後重送，
        // 讓前端在「不需 token」模式下仍可正常上傳。
        try {
          const autoTokenRef = await addDoc(collection(db, 'tokens'), {
            status: 'unused',
            createdAt: serverTimestamp()
          })
          return await createNoteWithToken(autoTokenRef.id)
        } catch (autoTokenError: any) {
          const autoDenied =
            autoTokenError?.code === 'permission-denied' ||
            String(autoTokenError?.message || '').includes('Missing or insufficient permissions')
          if (autoDenied) {
            throw new Error('目前後端權限設定不允許無 Token 上傳，請先開啟後台 Token 驗證或調整 Firestore 規則。')
          }
          throw autoTokenError
        }
      }
    } catch (error) {
      console.error('Error creating note:', error)
      throw error
    }
  }

  /**
   * 監聽待處理佇列
   */
  const listenToPendingQueue = (
    callback: (items: QueuePendingItem[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, 'queue_pending'),
      orderBy('timestamp', 'asc')
    )

    return onSnapshot(q, (snapshot) => {
      const items: QueuePendingItem[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as QueuePendingItem))
      callback(items)
    })
  }

  /**
   * 依 token 去重：同一 token 只保留一筆
   */
  const deduplicateByToken = (items: QueueHistoryItem[]): QueueHistoryItem[] => {
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = item.token || item.id || ''
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  /**
   * 即時監聯歷史紀錄（最新 N 筆，用於即時牆）
   * 內建 self-healing：偵測到同 token 重複文件時自動刪除孤兒
   */
  const listenToHistory = (
    pageSize: number = 60,
    callback: (items: QueueHistoryItem[]) => void
  ): Unsubscribe => {
    const q = query(
      collection(db, 'queue_history'),
      orderBy('playedAt', 'desc'),
      limit(pageSize)
    )

    return onSnapshot(
      q,
      (snapshot) => {
        const rawItems: QueueHistoryItem[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as QueueHistoryItem))

        // Self-healing：偵測同 token 的重複文件，自動刪除 doc ID ≠ token 的孤兒
        const tokenCount = new Map<string, string[]>()
        for (const item of rawItems) {
          const token = item.token || ''
          if (!token) continue
          if (!tokenCount.has(token)) tokenCount.set(token, [])
          tokenCount.get(token)!.push(item.id || '')
        }
        for (const [token, ids] of tokenCount) {
          if (ids.length > 1) {
            const orphanIds = ids.filter(id => id !== token)
            for (const orphanId of orphanIds) {
              if (orphanId) {
                console.warn(`[listenToHistory] Self-healing: deleting orphan ${orphanId} (token=${token})`)
                deleteDoc(doc(db, 'queue_history', orphanId)).catch(() => { })
              }
            }
          }
        }

        callback(deduplicateByToken(rawItems))
      },
      (error) => {
        console.error('Error listening to history:', error)
      }
    )
  }

  /**
   * 即時監聽「今日」所有歷史紀錄（以當天凌晨 00:00 為分界）
   */
  const listenToTodayHistory = (
    callback: (items: QueueHistoryItem[]) => void
  ): Unsubscribe => {
    const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    const todayParams = todayStr.split('-')
    // Get start of today
    const startOfToday = new Date(parseInt(todayParams[0] || '0'), parseInt(todayParams[1] || '0') - 1, parseInt(todayParams[2] || '0'), 0, 0, 0, 0)

    const q = query(
      collection(db, 'queue_history'),
      where('playedAt', '>=', startOfToday),
      orderBy('playedAt', 'desc')
    )

    return onSnapshot(
      q,
      (snapshot) => {
        const rawItems: QueueHistoryItem[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as QueueHistoryItem))
        callback(deduplicateByToken(rawItems))
      },
      (error) => {
        console.error('Error listening to today history:', error)
      }
    )
  }

  /**
   * 取得歷史紀錄（支援分頁，用於典藏牆無限捲動）
   */
  const getHistory = async (
    pageSize: number = 20,
    lastDoc?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{
    items: QueueHistoryItem[]
    lastDoc: QueryDocumentSnapshot<DocumentData> | null
  }> => {
    try {
      let q = query(
        collection(db, 'queue_history'),
        orderBy('playedAt', 'desc'),
        limit(pageSize)
      )

      if (lastDoc) {
        q = query(q, startAfter(lastDoc))
      }

      const snapshot = await getDocs(q)
      const rawItems: QueueHistoryItem[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as QueueHistoryItem))

      return {
        items: deduplicateByToken(rawItems),
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null
      }
    } catch (error) {
      console.error('Error fetching history:', error)
      throw error
    }
  }

  /**
   * 清理同一 token 的重複歷史紀錄
   * - 只保留 doc ID === token 的那筆
   * - 僅當「同 token 有多筆」時才刪除 doc ID ≠ token 的孤兒，絕不刪除唯一一筆
   */
  const cleanupDuplicateHistory = async (token: string): Promise<number> => {
    if (!token) return 0
    try {
      const dupQuery = query(
        collection(db, 'queue_history'),
        where('token', '==', token)
      )
      const dupSnap = await getDocs(dupQuery)
      // 只有當同 token 真的有多筆時才刪除孤兒，避免誤刪唯一一筆
      if (dupSnap.docs.length <= 1) return 0
      const orphans = dupSnap.docs.filter(d => d.id !== token)
      if (orphans.length > 0) {
        await Promise.all(
          orphans.map(d => deleteDoc(doc(db, 'queue_history', d.id)))
        )
        console.warn(`[cleanupDuplicateHistory] Deleted ${orphans.length} orphan(s) for token: ${token}`)
      }
      return orphans.length
    } catch (e) {
      console.error('[cleanupDuplicateHistory] Error:', e)
      return 0
    }
  }

  /**
   * 將項目從 queue_pending 移至 queue_history
   *
   * 關鍵設計：
   * 1. 以 token 作為 history doc ID（保證同 token 只寫一筆）
   * 2. 在 transaction 內同時檢查 history 是否已存在（冪等）
   * 3. transaction 完成後立即清理 + 延遲清理同 token 殘留 history
   */
  const moveToHistory = async (item: QueuePendingItem): Promise<void> => {
    try {
      if (!item.id) throw new Error('Item ID is required')

      const token = item.token || item.id
      const pendingRef = doc(db, 'queue_pending', item.id)
      const historyRef = doc(db, 'queue_history', token)

      console.log(`[moveToHistory] START token=${token}, pendingId=${item.id}`)

      await runTransaction(db, async (transaction) => {
        const pendingSnap = await transaction.get(pendingRef)
        const historySnap = await transaction.get(historyRef)

        console.log(`[moveToHistory] TX: pending=${pendingSnap.exists()}, history=${historySnap.exists()}`)

        if (historySnap.exists()) {
          if (pendingSnap.exists()) {
            transaction.delete(pendingRef)
          }
          console.log(`[moveToHistory] TX: history already exists, skipping write`)
          return
        }

        if (!pendingSnap.exists()) {
          console.log(`[moveToHistory] TX: pending not found, nothing to do`)
          return
        }

        const pendingData = pendingSnap.data()
        const historyData = {
          content: pendingData.content ?? item.content,
          style: pendingData.style ?? item.style,
          token: pendingData.token ?? token,
          timestamp: pendingData.timestamp ?? item.timestamp,
          status: 'played',
          playedAt: serverTimestamp()
        }

        transaction.set(historyRef, historyData)
        transaction.delete(pendingRef)
        console.log(`[moveToHistory] TX: wrote history/${token}, deleted pending/${item.id}`)
      })

      // 僅在有重複時才清理（cleanupDuplicateHistory 內已判斷 dupSnap.docs.length > 1）
      await cleanupDuplicateHistory(token)

    } catch (error) {
      console.error('[moveToHistory] Error:', error)
      throw error
    }
  }

  /**
   * 驗證 token 狀態並回傳詳細原因
   * @returns 'valid' | 'expired' | 'used' | 'invalid'
   */
  const checkTokenStatus = async (token: string): Promise<'valid' | 'expired' | 'used' | 'invalid'> => {
    try {
      const tokenSnap = await getDoc(doc(db, 'tokens', token))
      if (!tokenSnap.exists()) return 'invalid'
      const data = tokenSnap.data() as TokenDocument
      if (data.status !== 'unused') return 'used'
      if (!data.createdAt || typeof (data.createdAt as any).toMillis !== 'function') return 'invalid'

      const createdMs = (data.createdAt as any).toMillis() as number
      const nowMs = Date.now()
      const THIRTY_MIN_MS = 30 * 60 * 1000

      if (nowMs - createdMs > THIRTY_MIN_MS) return 'expired'

      return 'valid'
    } catch (error) {
      console.error('Error checking token status:', error)
      // 如果發生權限錯誤（前端可能無法直接讀取 tokens collection，除非 Rules 允許），
      // 此函式可能會拋錯，需搭配前端 try-catch 處理，或調整 Rules
      throw error
    }
  }

  /**
   * 驗證 token 是否可用（目前僅供 admin 或內部工具使用）
   * 前台 Editor 主要依賴 Firestore Rules 做強制驗證
   */
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      const status = await checkTokenStatus(token)
      return status === 'valid'
    } catch {
      return false
    }
  }

  /**
   * 建立新的 token
   */
  const createToken = async (): Promise<string> => {
    try {
      const tokenData: Omit<TokenDocument, 'id'> = {
        status: 'unused',
        createdAt: serverTimestamp() as any
      }

      const docRef = await addDoc(collection(db, 'tokens'), tokenData)
      return docRef.id
    } catch (error) {
      console.error('Error creating token:', error)
      throw error
    }
  }

  return {
    createNote,
    listenToPendingQueue,
    listenToHistory,
    listenToTodayHistory,
    getHistory,
    moveToHistory,
    cleanupDuplicateHistory,
    validateToken,
    checkTokenStatus,
    createToken
  }
}

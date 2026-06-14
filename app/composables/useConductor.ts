/**
 * useConductor – 大螢幕指揮家
 *
 * 職責：
 *  1. 管理 liveGrid / nowPlaying / borrowedId 等 reactive 狀態
 *  2. 每 N 秒執行一次 tick（Live Push 或 Idle Borrow）
 *  3. 廣播狀態到 Firestore system/current_state
 *  4. 暴露 onBeforeStateChange / onAfterStateChange 回呼，
 *     供 canvas.vue 嵌入 GSAP FLIP 動畫
 */
import { ref, computed, reactive } from 'vue'
import {
    collection, doc, setDoc, onSnapshot,
    query, limit, orderBy, getDocs
} from 'firebase/firestore'
import { useNuxtApp } from '#app'
import { useFirestore } from '~/composables/useFirestore'
import type {
    QueuePendingItem, QueueHistoryItem, CurrentStateData
} from '~/types'

/* ─── Types ─── */

export interface ConductorOptions {
    /** 每張便利貼在右邊展示的毫秒數（預設 15000） */
    loopIntervalMs?: number
    /** 左邊網格最大容量（預設 20） */
    historyLimit?: number
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之前** 呼叫 */
    onBeforeStateChange?: () => void
    /** FLIP 動畫：在 tick 修改 reactive 資料 **之後** 呼叫 */
    onAfterStateChange?: () => void
    /** 插播影片 URL（無則略過插播佇列） */
    getInterstitialVideoUrl?: () => string | null
    /** FLIP 結束後開始播放插播影片（canvas 內顯示 video） */
    onInterstitialStart?: () => void
}

interface ConductorState {
    isConductor: boolean
    queuePending: QueuePendingItem[]
    liveGrid: (QueueHistoryItem | QueuePendingItem)[]
    nowPlaying: QueueHistoryItem | QueuePendingItem | null
    mode: 'live' | 'idle' | 'waiting'
    borrowedId: string | null
    // internals
    unsubPending: (() => void) | null
    unsubHistory: (() => void) | null
    unsubState: (() => void) | null
    timer: ReturnType<typeof setTimeout> | null
    animTimer: ReturnType<typeof setTimeout> | null
    isAnimating: boolean
    lastTickTime: number
    completedIds: Set<string>
    /** idle 模式用的播放袋（A: shuffle bag） */
    idleBag: string[]
    /** 最近播放時間（用於冷卻避免短時間重複） */
    lastPlayedAt: Map<string, number>
    // callbacks (stored so tick() can call them)
    onBefore: (() => void) | null
    onAfter: (() => void) | null
    // config
    loopMs: number
    gridMax: number
    /** 固定間隔插播：待播放的時段鍵（FIFO） */
    interstitialQueue: string[]
    /** 插播播放中：不排程 tick、不接 pending 重排 */
    interstitialBlocking: boolean
    getVideoUrl: (() => string | null) | null
    onInterstitialStart: (() => void) | null
}

/* ─── Singleton（跨 HMR 保持同一份狀態） ─── */

const KEY = '__willmusic_conductor__'

function getSingleton(): ConductorState {
    const g = globalThis as any
    if (!g[KEY]) {
        g[KEY] = reactive<ConductorState>({
            isConductor: false,
            queuePending: [],
            liveGrid: [],
            nowPlaying: null,
            mode: 'waiting',
            borrowedId: null,
            unsubPending: null,
            unsubHistory: null,
            unsubState: null,
            timer: null,
            animTimer: null,
            isAnimating: false,
            lastTickTime: 0,
            completedIds: new Set(),
            idleBag: [],
            lastPlayedAt: new Map(),
            onBefore: null,
            onAfter: null,
            loopMs: 15_000,
            gridMax: 20,
            interstitialQueue: [],
            interstitialBlocking: false,
            getVideoUrl: null,
            onInterstitialStart: null
        })
    }
    return g[KEY]
}

/* ─── Helper ─── */
const noteId = (n: any): string => n?.id ?? n?.token ?? ''

function clampInt(min: number, val: number, max: number): number {
    return Math.max(min, Math.min(val, max))
}

/**
 * 插播間隔僅使用 **60 的正因數**（分鐘）。
 * 如此 (從 0:00 起算的「分鐘數」) % N === 0 時，每小時觸發在**同一組分鐘刻度**
 *（例如 N=5 永遠是 :00、:05、:10…）；若 N 不是 60 的因數，每小時的觸發分鐘會隨整點偏移。
 */
export const CANVAS_INTERSTITIAL_DIVISORS_OF_60 = [
    1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60
] as const

export const CANVAS_INTERSTITIAL_DEFAULT_MINUTES = 2

/** Firestore `interstitialScheduleEnabled`：僅在為 true 時依時間觸發插播；缺欄位視為 false */
export function parseInterstitialScheduleEnabled(v: unknown): boolean {
    return v === true
}

export function clampInterstitialIntervalMinutes(n: unknown): number {
    const v = Math.floor(Number(n))
    if (!Number.isFinite(v)) return CANVAS_INTERSTITIAL_DEFAULT_MINUTES
    let best: (typeof CANVAS_INTERSTITIAL_DIVISORS_OF_60)[number] = CANVAS_INTERSTITIAL_DIVISORS_OF_60[0]!
    let bestDist = Infinity
    for (const d of CANVAS_INTERSTITIAL_DIVISORS_OF_60) {
        const dist = Math.abs(v - d)
        if (dist < bestDist) {
            bestDist = dist
            best = d
        }
    }
    return best
}

/**
 * 與 canvas 依「從午夜起算分鐘數」對齊的 arm 使用同一套鍵；間隔應為 60 的因數，每小時觸發分鐘才一致。
 * @param intervalMinutes 須為 60 的因數（會經 clampInterstitialIntervalMinutes）
 */
export function getInterstitialSlotKey(d: Date, intervalMinutes: number): string {
    const n = clampInterstitialIntervalMinutes(intervalMinutes)
    const y = d.getFullYear()
    const mo = d.getMonth() + 1
    const da = d.getDate()
    const totalM = d.getHours() * 60 + d.getMinutes()
    const slotIndex = Math.floor(totalM / n)
    return `${y}-${mo}-${da}_${slotIndex}`
}

/** Fisher–Yates shuffle（就地洗牌） */
function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
}

/** 移除 bag 中已不存在於 liveGrid 的 id，並去除重複 */
function reconcileBagWithLiveGrid(bag: string[], liveIds: Set<string>): string[] {
    const seen = new Set<string>()
    const next: string[] = []
    for (const id of bag) {
        if (!liveIds.has(id)) continue
        if (seen.has(id)) continue
        seen.add(id)
        next.push(id)
    }
    return next
}

/** 將新加入的 id 插入到 bag 的前段，提升「新貼」曝光速度 */
function insertIdsNearFront(
    bag: string[],
    idsToInsert: string[],
    {
        frontWindow,
        prevPlayingId
    }: {
        frontWindow: number
        prevPlayingId: string | null
    }
): string[] {
    const existing = new Set(bag)
    const out = bag.slice()
    const k = Math.max(1, Math.min(frontWindow, out.length + 1))

    for (const id of idsToInsert) {
        if (!id) continue
        if (existing.has(id)) continue
        existing.add(id)

        // 插入位置：0 ~ k-1 隨機，但避免直接插成「下一張 == 上一張」
        let idx = Math.floor(Math.random() * k)
        if (idx === 0 && prevPlayingId && id === prevPlayingId) {
            idx = Math.min(1, out.length)
        }
        out.splice(idx, 0, id)
    }
    return out
}

/**
 * A + C：依 liveGrid 產生一輪播放袋（洗牌），並避免第一張剛好等於上一張（交界去重）。
 * - excludeIds：這一輪不該出現的 id（例如剛推入的 justPushed 或上一張）
 * - cooldownMs：冷卻時間內不選（若全被排除，會在選取時降級）
 */
function buildIdleBag(
    liveIds: string[],
    {
        excludeIds,
        prevPlayingId,
        cooldownMs,
        lastPlayedAt
    }: {
        excludeIds: Set<string>
        prevPlayingId: string | null
        cooldownMs: number
        lastPlayedAt: Map<string, number>
    }
): string[] {
    const now = Date.now()
    const base = liveIds.filter(id => {
        if (excludeIds.has(id)) return false
        const t = lastPlayedAt.get(id)
        if (!t) return true
        return now - t >= cooldownMs
    })

    // 若冷卻把全部排掉，先退回到只排除 excludeIds（仍保留 C 的效果在後面做）
    const pool = base.length > 0 ? base : liveIds.filter(id => !excludeIds.has(id))
    const bag = shuffleInPlace(pool.slice())

    // C：避免交界連續重複（上一張 == 下一輪第一張）
    if (prevPlayingId && bag.length >= 2 && bag[0] === prevPlayingId) {
        ;[bag[0], bag[1]] = [bag[1]!, bag[0]!]
    }
    return bag
}

/* ─── Composable ─── */

export function useConductor() {
    const { $firestore } = useNuxtApp()
    const db = $firestore as any
    const { moveToHistory } = useFirestore()
    const s = getSingleton()

    // 給手機端用的 ref
    const currentState = ref<CurrentStateData | null>(null)

    /* ── startConductor ── */
    const startConductor = async (opts?: ConductorOptions) => {
        if (s.isConductor) return
        s.isConductor = true

        // 套用設定
        if (opts?.loopIntervalMs) s.loopMs = opts.loopIntervalMs
        if (opts?.historyLimit) s.gridMax = opts.historyLimit
        s.onBefore = opts?.onBeforeStateChange ?? null
        s.onAfter = opts?.onAfterStateChange ?? null
        s.getVideoUrl = opts?.getInterstitialVideoUrl ?? null
        s.onInterstitialStart = opts?.onInterstitialStart ?? null

        console.log(
            `[Conductor] start  gridMax=${s.gridMax}  loop=${s.loopMs}ms`
        )

        // 1) 從 queue_history 載入最多 gridMax 張並監聽遠端刪除
        const q = query(
            collection(db, 'queue_history'),
            orderBy('playedAt', 'desc'),
            limit(s.gridMax)
        )

        await new Promise<void>((resolve) => {
            let isFirst = true
            s.unsubHistory = onSnapshot(
                q,
                (snapshot) => {
                    if (isFirst) {
                        isFirst = false
                        // 初次載入
                        s.liveGrid = snapshot.docs.map(
                            d => ({ id: d.id, ...d.data() } as QueueHistoryItem)
                        )
                        // 初次載入後同步 idle bag（避免第一次 idle 隨機重複）
                        const liveIds = s.liveGrid.map(n => noteId(n)).filter(Boolean)
                        const cooldownTurns = clampInt(3, Math.floor(s.gridMax * 0.5), 8)
                        const cooldownMs = cooldownTurns * s.loopMs
                        s.idleBag = buildIdleBag(liveIds, {
                            excludeIds: new Set(),
                            prevPlayingId: null,
                            cooldownMs,
                            lastPlayedAt: s.lastPlayedAt
                        })
                        resolve()
                        return
                    }

                    // 後續更新：只處理被遠端刪除或擠出的項目，避免打斷本地已 unshift() 正在執行的 FLIP 動畫
                    const changes = snapshot.docChanges()
                    const hasRemovals = changes.some(change => change.type === 'removed')

                    if (hasRemovals) {
                        // 如果有刪除，觸發動畫 hook (擷取當前狀態)
                        s.onBefore?.()

                        let removedCount = 0
                        let nowPlayingRemoved = false
                        changes.forEach((change) => {
                            if (change.type === 'removed') {
                                const deletedId = change.doc.id
                                if (s.nowPlaying && noteId(s.nowPlaying) === deletedId) {
                                    nowPlayingRemoved = true
                                }
                                const beforeLen = s.liveGrid.length
                                s.liveGrid = s.liveGrid.filter(n => noteId(n) !== deletedId)
                                if (s.liveGrid.length < beforeLen) removedCount++
                            }
                        })

                        // 補上新拉到的歷史資料
                        if (removedCount > 0 && s.liveGrid.length < s.gridMax) {
                            const existingIds = new Set(s.liveGrid.map(n => noteId(n)))
                            for (const d of snapshot.docs) {
                                if (!existingIds.has(d.id) && s.liveGrid.length < s.gridMax) {
                                    s.liveGrid.push({ id: d.id, ...d.data() } as QueueHistoryItem)
                                }
                            }
                        }

                        // 若被刪除的剛好是正在展示的歷史便利貼，強制換首
                        if (nowPlayingRemoved) {
                            s.nowPlaying = null
                            s.borrowedId = null
                            if (s.timer) clearTimeout(s.timer)
                            // 先把 bag 同步到目前 liveGrid，避免抽到已被移除的 id
                            const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
                            s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)
                            tick(true, true)
                        }

                        // 每次 history 有移除/補齊後都同步 bag（但不強制重洗，避免打斷節奏）
                        const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
                        s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)

                        // 觸發動畫 hook (執行 Flip 動畫)
                        s.onAfter?.()
                    }
                },
                (error) => {
                    console.error('[Conductor] history listener error', error)
                    if (isFirst) resolve() // 避免卡死
                }
            )
        })

        // 2) 即時監聽 queue_pending
        const pq = query(
            collection(db, 'queue_pending'),
            orderBy('timestamp', 'asc')
        )
        s.unsubPending = onSnapshot(pq, snap => {
            const changes = snap.docChanges()
            let nowPlayingRemoved = false

            changes.forEach(change => {
                if (change.type === 'removed') {
                    const deletedId = change.doc.id
                    if (s.nowPlaying && noteId(s.nowPlaying) === deletedId) {
                        nowPlayingRemoved = true
                    }
                }
            })

            if (nowPlayingRemoved) {
                s.onBefore?.()
            }

            s.queuePending = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as QueuePendingItem))
                .filter(q => !s.completedIds.has(noteId(q)))

            if (nowPlayingRemoved) {
                s.nowPlaying = null
                s.mode = 'waiting'
                if (s.timer) clearTimeout(s.timer)
                tick(true, true)
                s.onAfter?.()
                return
            }

            // 如果在 idle 模式下偵測到新的 pending，重新排程 tick
            // 讓當前展示結束後立刻進入 live push，不用多等一個完整週期
            if (!s.interstitialBlocking && s.mode === 'idle' && s.queuePending.length > 0) {
                const elapsed = Date.now() - s.lastTickTime
                const remaining = Math.max(0, s.loopMs - elapsed)
                scheduleTick(remaining)
            }
        })

        // 3) 啟動第一次 tick
        tick()
    }

    /* ── stopConductor ── */
    const stopConductor = () => {
        s.isConductor = false
        s.unsubPending?.()
        s.unsubPending = null
        s.unsubHistory?.()
        s.unsubHistory = null
        if (s.timer) { clearTimeout(s.timer); s.timer = null }
        if (s.animTimer) { clearTimeout(s.animTimer); s.animTimer = null }
        s.isAnimating = false
        s.onBefore = null
        s.onAfter = null
        s.idleBag = []
        s.lastPlayedAt.clear()
        s.interstitialQueue = []
        s.interstitialBlocking = false
        s.getVideoUrl = null
        s.onInterstitialStart = null
    }

    /* ── tick：每 N 秒執行一次 ── */
    const tick = (skipHooks = false, force = false) => {
        if (s.interstitialBlocking && !force) return

        // 如果正在進行動畫（且非強制中斷刪除），則進入排隊等待
        if (s.isAnimating && !force) {
            scheduleTick(100)
            return
        }

        s.lastTickTime = Date.now()

        // ▸ Phase 1: 呼叫 BEFORE hook（canvas 在此擷取 FLIP state）
        if (!skipHooks) s.onBefore?.()

        // 記住上一回合，準備收尾
        const prevMode = s.mode
        const prevPlaying = s.nowPlaying ? { ...s.nowPlaying } : null
        const prevPlayingId = prevPlaying ? noteId(prevPlaying) : null

        // 清空借用標記（若之前是 idle，佔位符會恢復為可見）
        s.borrowedId = null

        // ▸ Phase 2: 處理上一回合的收尾
        let justPushedId: string | null = null
        if (prevPlaying) {
            if (prevMode === 'live') {
                // Live Push 收尾：展示完畢 → 飛進 grid[0]，推擠其他
                s.liveGrid.unshift(prevPlaying)
                justPushedId = noteId(prevPlaying)
                if (s.liveGrid.length > s.gridMax) s.liveGrid.pop()
                // live push 播放過也要記錄，避免剛播完馬上又被 idle 借出
                if (justPushedId) s.lastPlayedAt.set(justPushedId, Date.now())

                // 新加入（剛推入 grid）的項目：插入 bag 前段，讓它在冷卻結束後能較快出現
                if (justPushedId) {
                    const liveIdSet = new Set(s.liveGrid.map(n => noteId(n)))
                    s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)
                    s.idleBag = insertIdsNearFront(s.idleBag, [justPushedId], {
                        frontWindow: 4,
                        prevPlayingId
                    })
                }
                // 寫入 Firestore
                try {
                    moveToHistory(prevPlaying as QueuePendingItem)
                        .catch(e => console.error('[Conductor] moveToHistory', e))
                } catch (e) { console.error(e) }
            }
            // idle 收尾：borrowedId 已清空，note 本來就在 grid 裡，不需搬動
        }

        const videoUrl = s.getVideoUrl?.() ?? null
        const interstitialThisRound =
            !skipHooks && !force && s.interstitialQueue.length > 0 && !!videoUrl

        // ▸ Phase 3: 決定下一回合（或定時插播：本張結束後不選下一張）
        if (interstitialThisRound) {
            s.interstitialQueue.shift()
            s.mode = 'waiting'
            s.nowPlaying = null
        } else {
            const next = s.queuePending.find(
                q => !s.completedIds.has(noteId(q))
            )

            if (next) {
                // ─ 狀態一：Live Push ─
                s.mode = 'live'
                s.nowPlaying = { ...next }
                s.completedIds.add(noteId(next))
                // 記錄播放時間（雖然 pending 理論上不會重複，但可以防止極端狀況）
                const id = noteId(next)
                if (id) s.lastPlayedAt.set(id, Date.now())
            } else if (s.liveGrid.length > 0) {
                // ─ 狀態二：Idle Borrow（A: shuffle bag + C: 交界去重 + 30s 冷卻） ─
                s.mode = 'idle'
                // 冷卻建議用「回合數」定義：避免 displaySec 改變時體感跑掉
                // cooldownTurns: 至少 3 回合，目標約半輪，上限 8 回合
                const cooldownTurns = clampInt(3, Math.floor(s.gridMax * 0.5), 8)
                const COOLDOWN_MS = cooldownTurns * s.loopMs

                // 1) 先把 bag 同步到 liveGrid（處理新增/移除）
                const liveIds = s.liveGrid.map(n => noteId(n)).filter(Boolean)
                const liveIdSet = new Set(liveIds)
                s.idleBag = reconcileBagWithLiveGrid(s.idleBag, liveIdSet)

                // 2) 本回合排除：剛推入（避免剛播完馬上借出）與上一張（避免連播）
                const excludeIds = new Set<string>()
                if (justPushedId) excludeIds.add(justPushedId)
                if (prevPlayingId) excludeIds.add(prevPlayingId)

                // 3) 若 bag 空了或下一個候選不合冷卻/排除條件 → 重建新一輪 bag
                const shouldRebuild = () => {
                    if (s.idleBag.length === 0) return true
                    const nextId = s.idleBag[0]!
                    if (excludeIds.has(nextId)) return true
                    const t = s.lastPlayedAt.get(nextId)
                    if (t && Date.now() - t < COOLDOWN_MS) return true
                    return false
                }

                if (shouldRebuild()) {
                    // 新貼加入時：若不在 bag 裡，會在這次重建自然納入；若你想更快出現，可在後面加「插入前段」策略
                    s.idleBag = buildIdleBag(liveIds, {
                        excludeIds,
                        prevPlayingId,
                        cooldownMs: COOLDOWN_MS,
                        lastPlayedAt: s.lastPlayedAt
                    })
                }

                // 4) 從 bag 取下一張；如果因為冷卻導致 bag 內前幾張都不行，最多跳過幾張
                let pickedId: string | null = null
                const MAX_SKIPS = Math.min(8, s.idleBag.length)
                for (let i = 0; i < MAX_SKIPS; i++) {
                    const id = s.idleBag.shift()
                    if (!id) break
                    if (excludeIds.has(id)) continue
                    const t = s.lastPlayedAt.get(id)
                    if (t && Date.now() - t < COOLDOWN_MS) continue
                    pickedId = id
                    break
                }

                // 5) 若仍挑不到（資料量太小/全在冷卻內），降級：只避免連播上一張
                if (!pickedId) {
                    const fallback = liveIds.filter(id => id !== prevPlayingId)
                    pickedId = (fallback.length ? fallback : liveIds)[0] ?? null
                }

                const borrowed = pickedId ? s.liveGrid.find(n => noteId(n) === pickedId) : null
                if (borrowed) {
                    s.nowPlaying = { ...borrowed }
                    s.borrowedId = noteId(borrowed)
                    const id = noteId(borrowed)
                    if (id) s.lastPlayedAt.set(id, Date.now())
                } else {
                    // 理論上不該到這裡；保底
                    s.mode = 'waiting'
                    s.nowPlaying = null
                }
            } else {
                s.mode = 'waiting'
                s.nowPlaying = null
            }
        }

        // ▸ Phase 5: 呼叫 AFTER hook（canvas 在此執行 Flip.from）
        if (!skipHooks) {
            s.onAfter?.()
            s.isAnimating = true
            if (s.animTimer) clearTimeout(s.animTimer)
            s.animTimer = setTimeout(() => {
                s.isAnimating = false
                if (interstitialThisRound) s.onInterstitialStart?.()
            }, 1250) // 等待 CSS Flip 動畫播放完畢 (1.2s + 緩衝)
        }

        if (interstitialThisRound) {
            if (s.timer) {
                clearTimeout(s.timer)
                s.timer = null
            }
            s.interstitialBlocking = true
            return
        }

        // ▸ Phase 6: 自動排程下一次回合
        scheduleTick(s.loopMs)
    }

    /** 排程下一次 tick（使用 setTimeout 以便重新排程） */
    const scheduleTick = (delayMs: number) => {
        if (s.interstitialBlocking) return
        if (s.timer) clearTimeout(s.timer)
        s.timer = setTimeout(() => {
            tick()
        }, delayMs)
    }

    const armInterstitialSlot = (slotKey: string) => {
        if (!slotKey) return
        if (s.interstitialQueue.includes(slotKey)) return
        while (s.interstitialQueue.length >= 12) s.interstitialQueue.shift()
        s.interstitialQueue.push(slotKey)
    }

    /** 關閉依時間插播時清空佇列，避免關閉後仍播放已排的插播 */
    const clearInterstitialArmQueue = () => {
        s.interstitialQueue.length = 0
    }

    const finishInterstitial = () => {
        s.interstitialBlocking = false
        tick()
    }

    /* ── broadcast ── */
    const broadcast = () => {
        const payload: CurrentStateData = {
            mode: s.mode,
            now_playing: s.nowPlaying,
            live_grid: s.liveGrid,
            updated_at: Date.now()
        }
        try {
            setDoc(doc(db, 'system', 'current_state'), payload)
                .catch(e => console.error('[Conductor] broadcast', e))
        } catch (e) { console.error(e) }
    }

    /* ── 手機端監聽 ── */
    const startListeningState = () => {
        if (s.unsubState) return
        s.unsubState = onSnapshot(
            doc(db, 'system', 'current_state'),
            snap => {
                if (!snap.exists()) return
                const d = snap.data() as CurrentStateData
                if (currentState.value?.updated_at === d.updated_at) return
                currentState.value = d
            }
        )
    }
    const stopListeningState = () => {
        s.unsubState?.(); s.unsubState = null
    }

    /* ── 暴露給 template 的 reactive 物件 ── */
    const displayState = computed(() => ({
        mode: s.mode,
        nowPlaying: s.nowPlaying,
        liveGrid: s.liveGrid,
        borrowedId: s.borrowedId
    }))

    return {
        startConductor,
        stopConductor,
        displayState,
        currentState,
        startListeningState,
        stopListeningState,
        armInterstitialSlot,
        clearInterstitialArmQueue,
        finishInterstitial
    }
}

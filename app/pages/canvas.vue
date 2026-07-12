<template>
  <div v-if="!isCanvasReady" class="p-canvas-loading" role="status" aria-live="polite">
    <div class="p-canvas-loading__spinner" aria-hidden="true"></div>
    <p class="p-canvas-loading__text">Loading...</p>
  </div>
  <div
    v-else-if="!hasUserStarted"
    class="p-canvas-start"
    role="dialog"
    aria-modal="true"
    aria-labelledby="p-canvas-start-title"
  >
    <h1 id="p-canvas-start-title" class="p-canvas-start__title">大螢幕展示</h1>
    <p class="p-canvas-start__hint">請點擊「開始」以啟用播放（含插播影片聲音）。</p>
    <button type="button" class="p-canvas-start__btn" @click="beginCanvasSession">開始</button>
  </div>
  <div v-show="isCanvasReady && hasUserStarted" class="p-canvas" ref="canvasRef" :style="{ '--display-scale': displayNoteScale }">

    <!-- ─── 全螢幕散落區（底層） ─── -->
    <div class="p-canvas__live-zone" ref="liveZoneRef">
      <div
        v-for="item in displayState.liveGrid"
        :key="getId(item)"
        class="p-canvas__scatter-slot"
      >
        <div
          v-if="displayState.borrowedId !== getId(item)"
          :data-flip-id="getId(item)"
          class="p-canvas__note-wrap"
          :style="getScatterStyle(getId(item))"
        >
          <StickyNote :note="item" />
        </div>
      </div>
    </div>

    <!-- ─── 中間最上方：Logo ─── -->
    <img
      class="p-canvas__logo"
      src="/system/logo.webp"
      alt="佑丞 & 子萱 2026.07.18"
      :style="logoBoxStyle"
    />

    <!-- ─── 中間上方：單張展示區 ─── -->
    <div class="p-canvas__display-zone" :style="displayBoxStyle">
      <div
        v-if="displayState.nowPlaying"
        :key="'display-' + getId(displayState.nowPlaying)"
        :data-flip-id="getId(displayState.nowPlaying)"
        class="p-canvas__note-wrap p-canvas__note-wrap--display"
      >
        <StickyNote :note="displayState.nowPlaying" />
      </div>
    </div>

    <!-- ─── 定時插播影片：單支全螢幕 ─── -->
    <div
      v-show="showInterstitial && interstitialSrc"
      class="p-canvas__interstitial"
      aria-hidden="true"
    >
      <video
        ref="videoRef"
        class="p-canvas__interstitial__video"
        :src="interstitialSrc || undefined"
        preload="auto"
        playsinline
        @ended="onInterstitialVideoEnded"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch, reactive } from 'vue'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import { useRoute } from 'vue-router'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'
import {
  useConductor,
  getInterstitialSlotKey,
  clampInterstitialIntervalMinutes,
  parseInterstitialScheduleEnabled
} from '~/composables/useConductor'

definePageMeta({ layout: false })
gsap.registerPlugin(Flip)

/* ─── 動畫時間設定（秒）───────────────────────────────────────
   調整這裡可以統一改變所有動畫的快慢
   ─────────────────────────────────────────────────────────── */
const ANIM = {
  /** 所有移動 / 飛行動畫（進場飛入、跨區飛行、live 重排、離場飛出）*/
  moveDuration:  1.2,
  /** 所有 scale 縮放（1→1.1 拿起 / 1.1→1 放下，時間相同）*/
  scaleDuration: 0.5,
} as const

/* ─── URL 參數 ─── */
const route = useRoute()
/** 同時在畫面上的便利貼數：預設塞滿版面（左右各 8 + 中下 2），且不得超過總格數 */
const maxNotes   = computed(() => {
  const q = Number(route.query.count)
  return q > 0 ? Math.min(q, SLOT_TOTAL) : SLOT_TOTAL
})
const displaySec = computed(() => Number(route.query.duration) || 15)
const liveNoteScale = computed(() => Number(route.query.liveScale) || 0.95)
const displayNoteScale = computed(() => Number(route.query.displayScale) || 0.9)

/* ─── Conductor + 插播影片 ─── */
const { $firestore } = useNuxtApp()
const db = $firestore as any

const interstitialSrc = ref<string | null>(null)
/** 插播排程間隔（分鐘），與 Firestore system/canvas_video.interstitialIntervalMinutes 同步 */
const interstitialIntervalMinutes = ref(clampInterstitialIntervalMinutes(undefined))
/** 與 Firestore interstitialScheduleEnabled 同步；為 false 時不依時間 arm */
const interstitialScheduleEnabled = ref(false)
let unsubCanvasVideo: (() => void) | null = null
let interstitialArmTimer: ReturnType<typeof setInterval> | null = null

const showInterstitial = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const isCanvasReady = ref(false)
/** 使用者點「開始」後才啟動 Conductor／插播排程，以符合瀏覽器自動播放（有聲影片）政策 */
const hasUserStarted = ref(false)
let stopRecalcWatch: (() => void) | null = null
const interstitialPreloadMap = new Map<string, Promise<void>>()

const {
  startConductor,
  stopConductor,
  displayState,
  armInterstitialSlot,
  finishInterstitial,
  clearInterstitialArmQueue
} = useConductor()

const preloadVideo = (url: string): Promise<void> => {
  if (interstitialPreloadMap.has(url)) return interstitialPreloadMap.get(url)!

  const preloadPromise = new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    let done = false
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, 12000)

    const cleanup = () => {
      if (done) return
      done = true
      window.clearTimeout(timeout)
      video.removeEventListener('canplaythrough', onReady)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
      video.src = ''
      video.load()
    }

    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('error'))
    }

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.addEventListener('canplaythrough', onReady, { once: true })
    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.src = url
    video.load()
  }).catch((e) => {
    interstitialPreloadMap.delete(url)
    throw e
  })

  interstitialPreloadMap.set(url, preloadPromise)
  return preloadPromise
}

const applyCanvasVideoConfig = (data?: {
  videoUrl?: string
  interstitialIntervalMinutes?: number
  interstitialScheduleEnabled?: boolean
}) => {
  if (!data) {
    interstitialSrc.value = null
    interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(undefined)
    interstitialScheduleEnabled.value = false
    clearInterstitialArmQueue()
    return
  }

  const u = data.videoUrl
  interstitialSrc.value = typeof u === 'string' && u.length > 0 ? u : null
  interstitialIntervalMinutes.value = clampInterstitialIntervalMinutes(
    data.interstitialIntervalMinutes
  )
  interstitialScheduleEnabled.value = parseInterstitialScheduleEnabled(
    data.interstitialScheduleEnabled
  )
  if (!interstitialScheduleEnabled.value) clearInterstitialArmQueue()
}

const isAutoplayNotAllowedError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === 'NotAllowedError'

const startInterstitialPlayback = async () => {
  if (interstitialSrc.value) {
    try {
      await preloadVideo(interstitialSrc.value)
    } catch (e) {
      console.warn('[canvas] 插播影片預載失敗，改為直接嘗試播放', e)
    }
  }
  await nextTick()
  const video = videoRef.value
  if (!video || !interstitialSrc.value) return
  video.pause()
  video.currentTime = 0
  video.muted = false
  try {
    await video.play()
  } catch (e) {
    if (!isAutoplayNotAllowedError(e)) {
      console.error('[canvas] 插播影片播放失敗', e)
      onInterstitialVideoEnded()
      return
    }
    try {
      video.muted = true
      await video.play()
      console.warn(
        '[canvas] 插播改為靜音播放（瀏覽器自動播放政策：需使用者互動後才能自動有聲播放）'
      )
    } catch (e2) {
      console.error('[canvas] 插播影片播放失敗（靜音重試後仍失敗）', e2)
      onInterstitialVideoEnded()
    }
  }
}

const onInterstitialVideoEnded = () => {
  videoRef.value?.pause()
  showInterstitial.value = false
  finishInterstitial()
}

const canvasRef   = ref<HTMLElement | null>(null)
const liveZoneRef = ref<HTMLElement | null>(null)

/** 取得便利貼唯一 ID */
const getId = (item: any): string => item?.id ?? item?.token ?? ''

/* ══════════════════════════════════════════════
   隨機散落演算法 (Non-overlapping scatter)
   ══════════════════════════════════════════════ */

/** 已分配的位置快取 { flipId → { left, top, rot, size } } */
const positionMap = reactive<Record<string, { left: number; top: number; rot: number; size: number; cellKey: string }>>({})

/* ══════════════════════════════════════════════
   版面配置：中間 Logo + 大張 display，左右各 8 張、中間下方 2 張
   ══════════════════════════════════════════════ */

/** 左右兩側各自的欄 / 列數（2×4 = 8 張／側） */
const SIDE_COLS = 2
const SIDE_ROWS = 4
/** 中間下方張數 */
const BOTTOM_COUNT = 2
/** 版面總格數 = 左 8 + 右 8 + 下 2 */
const SLOT_TOTAL = SIDE_COLS * SIDE_ROWS * 2 + BOTTOM_COUNT
/** display 與周圍便利貼的最小間距（佔 display 邊長比例） */
const DISPLAY_GAP_RATIO = 0.04

/** 大張 display 便利貼佔螢幕高 / 寬的比例（取正方形較小邊，另乘 displayScale） */
const DISPLAY_H_RATIO = 0.52
const DISPLAY_W_RATIO = 0.30
/** display 距畫面頂端的比例（讓出上方空間給 Logo） */
const DISPLAY_TOP_RATIO = 0.26

/** 中間最上方 Logo：寬度佔舞台寬的比例、距頂端比例、原圖長寬比（寬度刻意與 display 齊寬）*/
const LOGO_W_RATIO = 0.3
const LOGO_TOP_RATIO = 0.04
const LOGO_ASPECT = 2045 / 769
/**
 * 散落區四邊留白：取舞台短邊的比例（最少 24px）。
 * 固定 px 在 4K LED 牆上等於沒有留白，便利貼會壓到 canvasBg 四角的花束與禮盒。
 */
const SCATTER_EDGE = 24
const SCATTER_EDGE_RATIO = 0.05
/** 便利貼佔格子的比例：刻意小於 1，剩下的空隙就是「錯位」可以用的範圍 */
const NOTE_FILL = 0.84
/** 錯位幅度：用掉格子剩餘空隙的比例（<1 保留最小間距，故不會互相重疊） */
const SCATTER_JITTER = 0.85
/** 隨機旋轉角度總範圍（度）：實際為 ±一半 */
const SCATTER_ROT_RANGE = 18

interface Box { left: number; top: number; size: number }
interface LogoBox { left: number; top: number; width: number; height: number }

const displayBox = ref<Box | null>(null)
const logoBox = ref<LogoBox | null>(null)

const displayBoxStyle = computed(() => {
  const b = displayBox.value
  if (!b) return { position: 'absolute' as const, opacity: 0 }
  return { position: 'absolute' as const, left: `${b.left}px`, top: `${b.top}px`, width: `${b.size}px`, height: `${b.size}px` }
})

const logoBoxStyle = computed(() => {
  const b = logoBox.value
  if (!b) return { position: 'absolute' as const, opacity: 0 }
  return { position: 'absolute' as const, left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` }
})

/** 舞台固定 16:9（置中留邊），所有版位以舞台為座標系，不能用視窗尺寸 */
const STAGE_ASPECT = 16 / 9

function getStageSize() {
  const stage = canvasRef.value
  if (stage?.clientWidth && stage.clientHeight) {
    return { W: stage.clientWidth, H: stage.clientHeight }
  }
  // 尚未顯示（v-show 期間量不到）時，用視窗推算：舞台是視窗內置中的最大 16:9 方框
  const W = Math.min(window.innerWidth, window.innerHeight * STAGE_ASPECT)
  return { W, H: W / STAGE_ASPECT }
}

/** 依舞台尺寸計算 Logo 與 display 大張展示區（舞台座標） */
function computeLayoutBoxes() {
  const { W, H } = getStageSize()
  const scale = displayNoteScale.value

  const logoW = W * LOGO_W_RATIO
  const logoH = logoW / LOGO_ASPECT
  logoBox.value = { left: (W - logoW) / 2, top: H * LOGO_TOP_RATIO, width: logoW, height: logoH }

  const size = Math.min(H * DISPLAY_H_RATIO, W * DISPLAY_W_RATIO) * scale
  const left = (W - size) / 2
  const top = H * DISPLAY_TOP_RATIO
  displayBox.value = { left, top, size }
}

/**
 * 由格子座標推出穩定亂數（0~1）。
 * 用格子（而非便利貼 ID）當種子，重算 / 換人佔位時錯位都不會跳動。
 */
function cellNoise(row: number, col: number, salt: number): number {
  let h = Math.imul(row + 1, 374761393) ^ Math.imul(col + 1, 668265263) ^ Math.imul(salt + 1, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

interface Slot { cx: number; cy: number; key: string }

/**
 * 建立固定版位：左右兩側各 SIDE_COLS×SIDE_ROWS 張，中間 display 下方 BOTTOM_COUNT 張。
 * 各區塊由 display / 邊界切出，天生就不會壓到 Logo 與大張展示區。
 * 每格再依格子種子做錯位（位移不超過格內空隙的一半 → 不重疊、不出血）。
 */
function buildSlots(W: number, H: number): { slots: Slot[]; noteSize: number } {
  const d = displayBox.value
  if (!d) return { slots: [], noteSize: 80 }

  const edge = Math.max(SCATTER_EDGE, Math.min(W, H) * SCATTER_EDGE_RATIO)
  const gap = d.size * DISPLAY_GAP_RATIO

  // 左右兩區：display 左右各一塊，寬度取兩側較窄者以維持左右對稱
  const sideW = Math.min(d.left - gap - edge, (W - edge) - (d.left + d.size + gap))
  const colW = sideW / SIDE_COLS
  const rowH = (H - edge * 2) / SIDE_ROWS

  // 中下區：display 底部到畫面下緣，橫向與 display 同寬
  const bottomTop = d.top + d.size + gap
  const bottomH = (H - edge) - bottomTop
  const bottomColW = d.size / BOTTOM_COUNT

  // 全部便利貼同尺寸：尺寸由左右格子決定；中下區只要塞得下就沿用（0.9 留給錯位），
  // 不讓較矮的中下區把整體便利貼一起縮小
  const base = Math.min(colW, rowH, bottomColW)
  const noteSize = Math.max(60, Math.min(base * NOTE_FILL * liveNoteScale.value, bottomH * 0.9))

  const jitter = (span: number) => Math.max(0, (span - noteSize) / 2) * SCATTER_JITTER
  const sideJx = jitter(colW)
  const sideJy = jitter(rowH)
  const bottomJx = jitter(bottomColW)
  const bottomJy = jitter(bottomH)

  const slots: Slot[] = []

  // 左 8 張（zone seed 0）／右 8 張（zone seed 10）
  const sides: { start: number; seed: number; tag: string }[] = [
    { start: edge, seed: 0, tag: 'L' },
    { start: W - edge - sideW, seed: 10, tag: 'R' }
  ]
  for (const side of sides) {
    for (let r = 0; r < SIDE_ROWS; r++) {
      for (let c = 0; c < SIDE_COLS; c++) {
        const seedCol = side.seed + c
        slots.push({
          cx: side.start + (c + 0.5) * colW + (cellNoise(r, seedCol, 1) * 2 - 1) * sideJx,
          cy: edge + (r + 0.5) * rowH + (cellNoise(r, seedCol, 2) * 2 - 1) * sideJy,
          key: `${side.tag}${r}-${c}`
        })
      }
    }
  }

  // 中間下方 2 張（zone seed 20）
  const bottomCy = bottomTop + bottomH / 2
  for (let i = 0; i < BOTTOM_COUNT; i++) {
    slots.push({
      cx: d.left + (i + 0.5) * bottomColW + (cellNoise(0, 20 + i, 1) * 2 - 1) * bottomJx,
      cy: bottomCy + (cellNoise(0, 20 + i, 2) * 2 - 1) * bottomJy,
      key: `B-${i}`
    })
  }

  return { slots, noteSize }
}

/**
 * 為所有 liveGrid 便利貼分配落點。
 * 版位固定（左 8 / 右 8 / 中下 2），讓現有便利貼留在原格、
 * 新便利貼取「離 display 最近的空格」，達到框住大張、位移最小。
 */
function recalcPositions() {
  const zone = liveZoneRef.value
  if (!zone) return
  computeLayoutBoxes()

  const W = zone.clientWidth
  const H = zone.clientHeight
  if (!W || !H) return

  const items = displayState.value.liveGrid.map((n: any) => getId(n))
  for (const id of Object.keys(positionMap)) {
    if (!items.includes(id)) delete positionMap[id]
  }
  if (!items.length) return

  const { slots: cells, noteSize } = buildSlots(W, H)
  if (!cells.length) return

  // 離 display 中心近者優先（新便利貼會先框住大張）
  const dcx = displayBox.value ? displayBox.value.left + displayBox.value.size / 2 : W / 2
  const dcy = displayBox.value ? displayBox.value.top + displayBox.value.size / 2 : H / 2
  cells.sort((a, b) => {
    const da = (a.cx - dcx) ** 2 + (a.cy - dcy) ** 2
    const db = (b.cx - dcx) ** 2 + (b.cy - dcy) ** 2
    return da - db
  })
  const cellByKey = new Map(cells.map(c => [c.key, c]))

  // 1) 現有便利貼若原格仍有效則保留原格
  const usedKeys = new Set<string>()
  const needCell: string[] = []
  for (const id of items) {
    const ex = positionMap[id]
    if (ex && cellByKey.has(ex.cellKey) && !usedKeys.has(ex.cellKey)) {
      usedKeys.add(ex.cellKey)
    } else {
      needCell.push(id)
    }
  }

  // 2) 需要新格子的便利貼：依序取「離 display 最近的未使用格」
  let cursor = 0
  for (const id of needCell) {
    while (cursor < cells.length && usedKeys.has(cells[cursor]!.key)) cursor++
    const cell = cells[cursor] ?? cells[cells.length - 1]!
    usedKeys.add(cell.key)
    const rot = positionMap[id]?.rot ?? (Math.random() - 0.5) * SCATTER_ROT_RANGE
    positionMap[id] = { left: cell.cx - noteSize / 2, top: cell.cy - noteSize / 2, rot, size: noteSize, cellKey: cell.key }
  }

  // 3) 保留原格者：以最新 noteSize 重新對齊（處理視窗縮放後尺寸變動）
  for (const id of items) {
    const ex = positionMap[id]
    if (!ex) continue
    const cell = cellByKey.get(ex.cellKey)
    if (!cell) continue
    positionMap[id] = { left: cell.cx - noteSize / 2, top: cell.cy - noteSize / 2, rot: ex.rot, size: noteSize, cellKey: ex.cellKey }
  }
}

/** 返回每張便利貼的 inline style（落點已是螢幕座標） */
function getScatterStyle(flipId: string) {
  const pos = positionMap[flipId]
  const size = pos?.size ?? 100
  if (!pos) return { width: `${size}px`, height: `${size}px` }
  return {
    position: 'absolute' as const,
    left: `${pos.left}px`,
    top: `${pos.top}px`,
    width: `${pos.size}px`,
    height: `${pos.size}px`,
    transform: `rotate(${pos.rot}deg)`
  }
}

/* ══════════════════════════════════════════════
   FLIP 動畫相關
   ══════════════════════════════════════════════ */

let flipSnapshot: any = null
let capturedElements: { 
  flipId: string; 
  rect: DOMRect; 
  offsetWidth: number; 
  offsetHeight: number; 
  transform: string; 
  clone: HTMLElement 
}[] = []

const beginCanvasSession = async () => {
  if (hasUserStarted.value) return
  hasUserStarted.value = true
  await nextTick()

  interstitialArmTimer = setInterval(() => {
    if (!interstitialScheduleEnabled.value) return
    const d = new Date()
    if (d.getSeconds() !== 0) return
    const n = interstitialIntervalMinutes.value
    const totalM = d.getHours() * 60 + d.getMinutes()
    if (totalM % n !== 0) return
    armInterstitialSlot(getInterstitialSlotKey(d, n))
  }, 1000)

  await startConductor({
    loopIntervalMs: displaySec.value * 1000,
    historyLimit:   maxNotes.value,
    getInterstitialVideoUrl: () => interstitialSrc.value,
    onInterstitialStart: () => {
      showInterstitial.value = true
      void startInterstitialPlayback()
    },

    /* ── BEFORE：拍快照 ── */
    onBeforeStateChange() {
      flipSnapshot = Flip.getState('.p-canvas__note-wrap')

      capturedElements = []
      document.querySelectorAll('.p-canvas__note-wrap').forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        if (flipId) {
          const rect = el.getBoundingClientRect()
          capturedElements.push({
            flipId,
            rect,
            offsetWidth: (el as HTMLElement).offsetWidth,
            offsetHeight: (el as HTMLElement).offsetHeight,
            transform: window.getComputedStyle(el).transform,
            clone: el.cloneNode(true) as HTMLElement
          })
        }
      })
    },

    /* ── AFTER：資料已修改，重算位置後執行動畫 ── */
    async onAfterStateChange() {
      // 重算散落位置（新的便利貼才會得到位置）
      recalcPositions()

      await nextTick()
      if (!flipSnapshot || !canvasRef.value) return

      // ▸ 手動 leave 動畫
      const currentIds = new Set<string>()
      document.querySelectorAll('.p-canvas__note-wrap').forEach(el => {
        const id = el.getAttribute('data-flip-id')
        if (id) currentIds.add(id)
      })

      // 動畫階層：1 進入 display > 2 display→live > 3 live 移出。先算出「之前在 display」的 ID
      const wasInDisplayIds = new Set<string>()
      for (const item of capturedElements) {
        if (item.clone.classList.contains('p-canvas__note-wrap--display')) {
          wasInDisplayIds.add(item.flipId)
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 情境 4：離場飛出 (Leave)
      //   - Phase 1：原地 scale 1→1.1（拿起感）
      //   - Phase 2：維持 1.1，透明度不變，飛往 live 上方離開畫面
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const liveLeaveRect = liveZoneRef.value!.getBoundingClientRect()
      const leaveTargetX = liveLeaveRect.left + liveLeaveRect.width / 2
      const leaveTargetY = -liveLeaveRect.height // 畫面上方完全超出視口

      for (const item of capturedElements) {
        if (!currentIds.has(item.flipId)) {
          const clone = item.clone
          clone.classList.add('is-leaving')
          clone.removeAttribute('data-flip-id')

          const centerX = item.rect.left + item.rect.width / 2
          const centerY = item.rect.top + item.rect.height / 2
          const fixedLeft = centerX - item.offsetWidth / 2
          const fixedTop = centerY - item.offsetHeight / 2

          clone.style.margin = '0'
          Object.assign(clone.style, {
            position: 'fixed',
            left: `${fixedLeft}px`,
            top: `${fixedTop}px`,
            width: `${item.offsetWidth}px`,
            height: `${item.offsetHeight}px`,
            transform: item.transform,
            zIndex: '50',
            pointerEvents: 'none',
          })
          canvasRef.value!.appendChild(clone)

          // Phase 1：原地放大到 1.1x（拿起感）
          gsap.to(clone, {
            scale: 1.1,
            duration: ANIM.scaleDuration,
            ease: 'power2.out',
            onComplete: () => {
              // Phase 2：維持 1.1，飛出畫面，透明度不變
              gsap.to(clone, {
                x: leaveTargetX - centerX,
                y: leaveTargetY - centerY,
                duration: ANIM.moveDuration,
                ease: 'power3.in',
                onComplete: () => clone.remove(),
              })
            },
          })
        }
      }

      // 依動畫類型設定 z-index（1 進入 display > 2 display→live > 靜態 live）
      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const elEl = el as HTMLElement
        const flipId = el.getAttribute('data-flip-id')
        if (el.classList.contains('p-canvas__note-wrap--display')) {
          elEl.style.zIndex = '300' // 1. 進入 display：最上層
        } else if (flipId && wasInDisplayIds.has(flipId)) {
          elEl.style.zIndex = '200' // 2. display→live：中層
        } else {
          elEl.style.zIndex = '100' // 3. 靜態 live：底層
        }
      })

      // 找出所有需要 Flip 動畫的元素
      const flipTargets: Element[] = []
      const crossInnerTargets: HTMLElement[] = [] // 跨區移動的元素，其內部元素需要額外縮放動畫
      const movingFlipTargets: Element[] = []     // 真正有產生位置變化的元素

      document.querySelectorAll('.p-canvas__note-wrap:not(.is-leaving)').forEach(el => {
        const flipId = el.getAttribute('data-flip-id')
        if (flipId) {
          flipTargets.push(el)

          // 判斷是否真的有移動
          const captured = capturedElements.find(c => c.flipId === flipId)
          let hasMoved = false

          if (captured) {
            const cur = el.getBoundingClientRect()
            hasMoved = (
              Math.abs(cur.left   - captured.rect.left)   > 1 ||
              Math.abs(cur.top    - captured.rect.top)    > 1 ||
              Math.abs(cur.width  - captured.rect.width)  > 1 ||
              Math.abs(cur.height - captured.rect.height) > 1
            )
          } else {
            hasMoved = true // 新進場的元素視同有移動
          }

          if (hasMoved) {
            movingFlipTargets.push(el)
          }

          if (hasMoved && wasInDisplayIds.has(flipId) && !el.classList.contains('p-canvas__note-wrap--display')) {
            // 從 display 區移動到 live 區的元素
            const inner = (el as HTMLElement).firstElementChild as HTMLElement
            if (inner) crossInnerTargets.push(inner)
          }
        }
      })

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 全部動畫：ONE Flip.from() 統一驅動
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 單一 Flip.from()，targets 包含所有需要動畫的元素
      if (flipTargets.length) {
        // 先建立 Flip 動畫時間軸
        const flipAnim = Flip.from(flipSnapshot, {
          targets: flipTargets,
          duration: ANIM.moveDuration,
          ease: 'power2.inOut',
          absolute: true,
          scale: true, // 關鍵：讓元素以 transform scale 的方式變形，而非直接改 width/height，避免瞬間爆大
          paused: true, // 先暫停，由我們的手動時間軸控制
          // 情境 1：新進場元素的飛入動畫
          onEnter: (elements: Element[]) => {
            // 飛入前子元素先設為 1.1
            elements.forEach(el => {
              const inner = (el as HTMLElement).firstElementChild as HTMLElement
              if (inner) gsap.set(inner, { scale: 1.1 })
            })

            const dZone = document.querySelector('.p-canvas__display-zone') as HTMLElement
            const dRect = dZone.getBoundingClientRect()
            const displayCenterX = dRect.left + dRect.width / 2
            // 起始 Y：display zone 底部再加上元素高度，確保完全在畫面外
            const entryBottomY = dRect.bottom

            gsap.from(elements, {
              x: (i, el) => {
                const rect = el.getBoundingClientRect()
                return displayCenterX - (rect.left + rect.width / 2)
              },
              y: (i, el) => {
                const rect = el.getBoundingClientRect()
                return entryBottomY + rect.height - (rect.top + rect.height / 2)
              },
              duration: ANIM.moveDuration,
              ease: 'power3.out',
              delay: flipTargets.length ? ANIM.scaleDuration : 0, // 等待拿起動作
              onComplete: () => {
                // 落地後：display 元素 scale 1.1→1
                elements.forEach(el => {
                  if (el.classList.contains('p-canvas__note-wrap--display')) {
                    const inner = (el as HTMLElement).firstElementChild as HTMLElement
                    if (inner) {
                      gsap.to(inner, {
                        scale: 1,
                        duration: ANIM.scaleDuration,
                        ease: 'power2.inOut',
                      })
                    }
                  }
                })
              },
            })
          }

        })

        // 提取所有要移動的元素的內部節點（用來放大縮小）
        const flipInnerTargets = movingFlipTargets.map(el => (el as HTMLElement).firstElementChild as HTMLElement).filter(Boolean)

        // 建立主時間軸，安排動畫順序： 1. 拿起(放大) -> 2. 移動(Flip) -> 3. 放下(縮小)
        const tl = gsap.timeline()

        // 步驟 1：所有要移動的元素原地放大 (拿起)
        if (flipInnerTargets.length) {
          tl.to(flipInnerTargets, {
            scale: 1.1,
            duration: ANIM.scaleDuration,
            ease: 'power2.out',
          })
        }

        // 步驟 2：執行所有位置移動 (Live重排 + 跨區移動)
        tl.add(flipAnim.play(), flipInnerTargets.length ? ANIM.scaleDuration : 0)

        // 步驟 3：所有移動的元素到達目的地後縮小 (放下)
        if (flipInnerTargets.length) {
          // `<` 代表對齊上一個動畫(也就是移動)的開端，加上移動時間代表「一抵達目標就馬上縮小」
          tl.to(flipInnerTargets, {
            scale: 1,
            duration: ANIM.scaleDuration,
            ease: 'power2.inOut',
          }, `<${ANIM.moveDuration}`)
        }

        // 僅 display 區：強制最終 translate 為 0 0，避免 FLIP 殘留導致跑到螢幕右下角
        tl.call(() => {
          document.querySelectorAll('.p-canvas__note-wrap--display').forEach(el => {
            gsap.set(el, { x: 0, y: 0 })
          })
        })
      }

      flipSnapshot = null
      capturedElements = []
    }
  })

  stopRecalcWatch?.()
  stopRecalcWatch = watch(
    () => [displayState.value.liveGrid.length, liveNoteScale.value],
    () => { recalcPositions() },
    { immediate: true }
  )
}

/** 視窗尺寸變動：重算三個固定區塊與散落落點（rAF 節流） */
let resizeRaf = 0
const onResize = () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    if (hasUserStarted.value) recalcPositions()
    else computeLayoutBoxes()
  })
}

onMounted(async () => {
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'

  // 先算好 display / logo / qr 三個固定區塊，讓大張展示區在首次 tick 前就定位
  computeLayoutBoxes()
  window.addEventListener('resize', onResize)

  try {
    const initialSnap = await getDoc(doc(db, 'system', 'canvas_video'))
    applyCanvasVideoConfig(initialSnap.exists() ? (initialSnap.data() as {
      videoUrl?: string
      interstitialIntervalMinutes?: number
      interstitialScheduleEnabled?: boolean
    }) : undefined)
  } catch (e) {
    console.warn('[canvas] 讀取初始插播設定失敗', e)
  }

  if (interstitialScheduleEnabled.value && interstitialSrc.value) {
    try {
      await preloadVideo(interstitialSrc.value)
    } catch (e) {
      console.warn('[canvas] 進入前預載插播影片失敗，略過等待', e)
    }
  }

  unsubCanvasVideo = onSnapshot(doc(db, 'system', 'canvas_video'), (snap) => {
    const data = snap.exists() ? (snap.data() as {
      videoUrl?: string
      interstitialIntervalMinutes?: number
      interstitialScheduleEnabled?: boolean
    }) : undefined
    applyCanvasVideoConfig(data)

    if (interstitialScheduleEnabled.value && interstitialSrc.value) {
      void preloadVideo(interstitialSrc.value).catch((e) => {
        console.warn('[canvas] 插播影片背景預載失敗', e)
      })
    }
  })

  isCanvasReady.value = true
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0 }
  stopRecalcWatch?.()
  stopRecalcWatch = null
  unsubCanvasVideo?.()
  unsubCanvasVideo = null
  if (interstitialArmTimer) {
    clearInterval(interstitialArmTimer)
    interstitialArmTimer = null
  }
  stopConductor()
  document.body.style.margin = ''
  document.body.style.overflow = ''
})
</script>
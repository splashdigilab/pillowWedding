<template>
  <div class="p-index" ref="containerRef">

    <!-- 便利貼牆不放 header：開場畫面的 logo 就是首頁的識別，進到牆上之後讓內容滿版 -->

    <!-- 開場畫面底色：蓋掉後方的便利貼牆（裝飾與內容分屬上下兩層，見下方 z-index） -->
    <Transition name="intro-fade">
      <div v-if="showIntroOverlay" class="p-index__intro-scrim" />
    </Transition>

    <!-- 畫布內容區，負責所有 transforms -->
    <TransitionGroup 
      tag="div" 
      class="p-index__canvas" 
      ref="canvasRef"
      :css="false"
      @leave="onLeave"
    >
      <!-- 便利貼容器 -->
      <div 
        v-for="item in displayItems" 
        :key="item.id || item.token"
        :data-id="item.id || item.token"
        class="p-index__note-wrap"
      >
        <StickyNote :note="item" />
      </div>
    </TransitionGroup>

    <!-- 上下滿版裝飾（開場與便利貼牆共用，不接收點擊） -->
    <img src="/system/top.webp" alt="" class="p-index__deco p-index__deco--top" />
    <img src="/system/bottom.webp" alt="" class="p-index__deco p-index__deco--bottom" />

    <!-- 開場畫面：主視覺 + 進入按鈕（疊在裝飾之上） -->
    <Transition name="intro-fade">
      <div v-if="showIntroOverlay" class="p-index__intro">
        <div class="p-index__intro-head">
          <img src="/system/logo.webp" alt="佑丞 & 子萱 2026.07.18" class="p-index__intro-brand" />
          <p class="p-index__intro-tagline">留下一句祝福，收藏每一份心意</p>
        </div>
        <img src="/system/lp-main.webp" alt="" class="p-index__intro-main" />
        <button
          type="button"
          class="p-index__intro-btn c-btn c-btn--primary"
          :disabled="loading"
          @click="onStartClick"
        >
          <span v-if="loading" class="p-index__intro-btn-inner">
            <span class="p-index__intro-spinner" aria-hidden="true" />
            載入中...
          </span>
          <span v-else>查看留言板</span>
        </button>
      </div>
    </Transition>

    <!-- UI Controls -->
    <div
      v-if="!showIntroOverlay"
      class="p-index__controls"
      @pointerdown.stop
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
    >
      <div class="p-index__controls-top">
        <button class="c-btn c-btn--icon p-index__center-btn" @click="centerContent" title="置中">
          <!-- Center Icon -->
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19 12h2"></path>
            <path d="M3 12h2"></path>
            <path d="M12 3v2"></path>
            <path d="M12 19v2"></path>
          </svg>
        </button>
      </div>
      <NuxtLink to="/editor" class="c-btn c-btn--fab p-index__fab">
        製作專屬便利貼
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { gsap } from 'gsap'
import type { QueuePendingItem, QueueHistoryItem } from '~/types'
import { useFirestore } from '~/composables/useFirestore'
import { usePanZoom, type PanZoomBounds } from '~/composables/usePanZoom'
import StickyNote from '~/components/StickyNote.vue'

definePageMeta({ layout: false, ssr: false })

const { getHistory } = useFirestore()

// ====== UI Refs ======
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)

// ====== Data ======
const displayItems = ref<QueueHistoryItem[]>([])
const showIntroOverlay = ref(true)
const loading = ref(true)
const HISTORY_FETCH_LIMIT = 100

// ====== Layout Math: Fermat's Spiral with Collision Detection ======
const ITEM_SIZE = 150 
const MARGIN = -20 // Increase margin significantly
// Ensure the collision radius accounts for the maximum possible bounding box of a rotated square
// A 150x150 square rotated 45 degrees has a diagonal of 150 * sqrt(2) ≈ 212
const MAX_BOUNDING_BOX = ITEM_SIZE * Math.SQRT2
const COLLISION_RADIUS = (MAX_BOUNDING_BOX + MARGIN) / 2 

// Cache calculated positions
interface Position { x: number; y: number }
const layoutCache = ref<Position[]>([])

// Compute bounding box based on layout cache
const computedBounds = computed<PanZoomBounds | null>(() => {
  if (layoutCache.value.length === 0) return null

  const firstPos = layoutCache.value[0]
  if (!firstPos) return null

  let minX = firstPos.x
  let maxX = firstPos.x
  let minY = firstPos.y
  let maxY = firstPos.y

  for (let i = 1; i < layoutCache.value.length; i++) {
    const pos = layoutCache.value[i]
    if (!pos) continue
    if (pos.x < minX) minX = pos.x
    if (pos.x > maxX) maxX = pos.x
    if (pos.y < minY) minY = pos.y
    if (pos.y > maxY) maxY = pos.y
  }

  // Force bounds to be perfectly symmetric around (0,0) so dragging feels centered
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX))
  const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY))

  // Account for the item size itself so bounds cover the entire objects
  const halfSize = MAX_BOUNDING_BOX / 2
  return {
    minX: -maxAbsX - halfSize,
    maxX: maxAbsX + halfSize,
    minY: -maxAbsY - halfSize,
    maxY: maxAbsY + halfSize
  }
})

// ====== Pan & Zoom ======
const { centerContent } = usePanZoom(containerRef, canvasRef, {
  minScale: 0.5,
  maxScale: 3,
  initialScale: 1,
  initialCenter: true,
  disabled: showIntroOverlay,
  bounds: computedBounds,
  boundsPadding: 0.9 // allow 70% of the screen width/height empty space margin
})

// Helper to check if a new position collides with any existing positions
// Optimize to O(1) by using Spatial Grid Partitioning
const getGridKey = (x: number, y: number, cellSize: number) => {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`
}

const isCollidingOptimized = (
  pos: Position,
  grid: Map<string, Position[]>,
  cellSize: number
): boolean => {
  const cellX = Math.floor(pos.x / cellSize)
  const cellY = Math.floor(pos.y / cellSize)
  
  // Check center cell and all 8 surrounding cells
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const neighbors = grid.get(`${cellX + dx},${cellY + dy}`)
      if (neighbors) {
        for (const existing of neighbors) {
          const distX = pos.x - existing.x
          const distY = pos.y - existing.y
          if (distX * distX + distY * distY < (COLLISION_RADIUS * 2) * (COLLISION_RADIUS * 2)) {
            return true
          }
        }
      }
    }
  }
  return false
}

/**
 * Calculates non-overlapping positions using Fermat's Spiral
 * index 0 is always exactly at (0, 0)
 */
const calculatePositions = (itemCount: number) => {
  const positions: Position[] = []
  const grid = new Map<string, Position[]>()
  const cellSize = COLLISION_RADIUS * 2 // Define grid size as the maximum possible collision diameter
  
  // c is the step multiplier.
  const c = 35 
  let spiralIndex = 0

  for (let i = 0; i < itemCount; i++) {
    if (i === 0) {
      const pos = { x: 0, y: 0 }
      positions.push(pos)
      const key = getGridKey(pos.x, pos.y, cellSize)
      grid.set(key, [pos])
      spiralIndex++
      continue
    }

    let found = false
    let currentPos: Position = { x: 0, y: 0 }
    
    // Keep traversing the spiral until we find a spot that doesn't collide
    while (!found) {
      const r = c * Math.sqrt(spiralIndex)
      const theta = spiralIndex * 137.508 * (Math.PI / 180)
      
      currentPos = {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta)
      }

      if (!isCollidingOptimized(currentPos, grid, cellSize)) {
        found = true
      }
      spiralIndex++
    }
    
    positions.push(currentPos)
    const key = getGridKey(currentPos.x, currentPos.y, cellSize)
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key)!.push(currentPos)
  }

  layoutCache.value = positions
}

const getStoredPosition = (index: number) => {
  if (layoutCache.value[index]) {
    return layoutCache.value[index]
  }
  return { x: 0, y: 0 }
}

// ====== Animation Logic ======
const ENTRY_ANIMATION_COUNT = 20 // 入場只對前 N 張播 fly-in，其餘直接出現在定位
let isFirstRender = true
let isReflowing = false

const playReflowSequence = async () => {
  if (isReflowing) return
  isReflowing = true

  await nextTick()
  const canvasEl = canvasRef.value ? ((canvasRef.value as any).$el || canvasRef.value) : null
  if (!canvasEl) {
    isReflowing = false
    return
  }

  const elements = Array.from(canvasEl.querySelectorAll('.p-index__note-wrap'))
  if (!elements.length) {
    isReflowing = false
    return
  }

  if (isFirstRender) {
    const totalCount = elements.length
    calculatePositions(displayItems.value.length)

    elements.forEach((el, index) => {
      const pos = getStoredPosition(index)
      const element = el as HTMLElement
      element.style.zIndex = `${1000 - index}`
      const rotation = (Math.random() - 0.5) * 15

      if (index < ENTRY_ANIMATION_COUNT) {
        // 前 30 張：fly-in 動畫，延遲上限避免 iOS 負擔
        const animDelay = Math.min(index * 0.05, 1.5)
        gsap.to(element, {
          x: pos.x,
          y: pos.y,
          scale: 1,
          opacity: 1,
          rotation,
          duration: 1.2 + Math.random() * 0.5,
          ease: 'power3.out',
          delay: animDelay
        })
      } else {
        // 第 31 張起：直接出現在應有位置
        gsap.set(element, {
          x: pos.x,
          y: pos.y,
          scale: 1,
          opacity: 1,
          rotation
        })
      }
    })
    isFirstRender = false
    isReflowing = false
    return
  }

  // Reflow: 直接從目前位置動畫到新位置（不再先收斂到原點）
  calculatePositions(displayItems.value.length)

  elements.forEach((el, index) => {
    const pos = getStoredPosition(index)
    const element = el as HTMLElement
    element.style.zIndex = `${1000 - index}`

    gsap.to(element, {
      x: pos.x,
      y: pos.y,
      scale: 1,
      opacity: 1,
      rotation: (Math.random() - 0.5) * 15,
      duration: 1.0 + Math.random() * 0.4,
      ease: 'power3.out',
      delay: Math.random() * 0.1
    })
  })
  isReflowing = false
}

let leavingCount = 0

const onLeave = (el: Element, done: () => void) => {
  leavingCount++
  
  // Fade out in place, then remove
  gsap.to(el, {
    opacity: 0,
    duration: 0.6,
    onComplete: () => {
      done()
      leavingCount--
      // Only recalculate layout for surviving nodes once ALL leaving nodes have finished their animation
      if (leavingCount === 0) {
        playReflowSequence()
      }
    }
  })
}

// 點擊「開始」：關閉 overlay 並播放進場動畫
const onStartClick = () => {
  if (loading.value) return
  showIntroOverlay.value = false
  nextTick(() => {
    playReflowSequence()
  })
}

// Watch array changes（overlay 還開著時不播動畫，等點「開始」再播）
watch(
  () => displayItems.value.length,
  async (newLen, oldLen) => {
    if (showIntroOverlay.value) return
    if (newLen > oldLen) {
      setTimeout(() => {
        playReflowSequence()
      }, 50)
    }
  }
)

let loadingTimer: ReturnType<typeof setTimeout> | null = null
const waitForNextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

const appendItemsInBatches = async (
  items: QueueHistoryItem[],
  batchSize = 12
) => {
  displayItems.value = []

  for (let i = 0; i < items.length; i += batchSize) {
    displayItems.value.push(...items.slice(i, i + batchSize))
    // 讓行動裝置在批次間有機會完成 layout/paint，避免一次性渲染尖峰
    await waitForNextFrame()
  }
}

onMounted(async () => {
  const waitForIntroImages = async () => {
    await nextTick()
    const introRoot = containerRef.value
    if (!introRoot) return
    // 開場的 logo 與主視覺（首頁改成 LP 版面後，選擇器要跟著換成 .p-index__intro）
    const images = Array.from(introRoot.querySelectorAll<HTMLImageElement>('.p-index__intro img'))
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.addEventListener('load', resolve as () => void, { once: true })
          img.addEventListener('error', resolve as () => void, { once: true })
        })
      })
    )
  }

  const windowLoaded = new Promise<void>(resolve => {
    if (document.readyState === 'complete') {
      resolve()
    } else {
      window.addEventListener('load', () => resolve(), { once: true })
    }
  })

  // 等待字體、圖片載入與最小延遲
  try {
    const historyPromise = getHistory(HISTORY_FETCH_LIMIT)
      .then(async ({ items }) => {
        await appendItemsInBatches(items)
      })
      .catch(e => console.error('Error fetching history:', e))

    await Promise.all([
      historyPromise,
      document.fonts.ready,
      windowLoaded,
      waitForIntroImages(),
      new Promise(resolve => {
        loadingTimer = setTimeout(resolve, 800)
      })
    ])
  } catch (e) {
    console.warn('Loading error', e)
  }
  
  loading.value = false
})

onUnmounted(() => {
  if (loadingTimer) clearTimeout(loadingTimer)
})
</script>

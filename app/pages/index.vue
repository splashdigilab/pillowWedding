<template>
  <div class="p-index" ref="containerRef">
    
    <!-- Header -->
    <AppHeader show-help @help="showIntroOverlay = true" />

    <!-- 活動介紹滿版 overlay：載入時顯示，loading 完後按「開始」關閉 -->
    <Transition name="intro-fade">
      <div v-if="showIntroOverlay" class="p-index__intro-overlay">
        <div class="p-index__intro-card">
          <!-- 邊緣裝飾貼紙 -->
          <img src="/svg/stickers/sticker-35.webp" class="p-index__card-sticker p-index__card-sticker--tl" alt="" />
          <img src="/svg/stickers/sticker-41.webp" class="p-index__card-sticker p-index__card-sticker--br" alt="" />

          <img src="/postBoardLogoColumn.svg" alt="WillMusic Logo" class="p-index__intro-logo" />
          <!-- <h1 class="p-index__intro-title">活動介紹</h1> -->
          <div class="p-index__intro-desc p-index__intro-rules">
            <p style="text-align: center">歡迎來到 WILL MUSIC 數位應援便利貼！<br>在這裡，您可以創作專屬於您的應援內容，<br>與大家一起分享對音樂的熱愛。</p>
          </div>
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
            <span v-else>開始</span>
          </button>
        </div>
      </div>
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

    <!-- UI Controls -->
    <div
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
        專屬便利貼
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

// ====== Intro Random Stickers ======
const introStickers = ref<{src: string, x: number, y: number, rotation: number, scale: number, zIndex: number}[]>([])
const generateRandomStickers = () => {
  // Use a mix of the available stickers
  const stickerFiles = [
    'sticker-1.svg', 'sticker-2.svg', 'sticker-3.svg', 'sticker-4.svg', 'sticker-5.svg',
    'sticker-10.svg', 'sticker-11.svg', 'sticker-12.svg', 'sticker-17.svg', 'sticker-25.svg',
    'sticker-32.svg', 'sticker-44.svg', 'sticker-51.svg', 'sticker-60.svg',
    'sticker-13.webp', 'sticker-16.webp', 'sticker-20.webp', 'sticker-35.webp', 'sticker-41.webp'
  ]
  const count = Math.floor(Math.random() * 5) + 6 // 6 to 10 stickers
  const result = []
  
  for (let i = 0; i < count; i++) {
    const file = stickerFiles[Math.floor(Math.random() * stickerFiles.length)]
    
    // Random position avoiding the center
    // Center card is roughly 400px wide (maybe 30vw to 70vw) and height (30vh to 70vh)
    let x = 0
    let y = 0
    let isCenter = true
    
    // Ensure it's not placed directly behind the intro card
    while(isCenter) {
      x = Math.random() * 90 // 0vw to 90vw
      y = Math.random() * 90 // 0vh to 90vh
      
      // If outside the 25% - 75% region (both X and Y), it's safe
      if (x < 25 || x > 75 || y < 25 || y > 75) {
        isCenter = false
      }
    }

    result.push({
      src: `/svg/stickers/${file}`,
      x,
      y,
      rotation: (Math.random() - 0.5) * 60, // -30deg to 30deg
      scale: 0.6 + Math.random() * 0.6, // 0.6x to 1.2x
      zIndex: Math.floor(Math.random() * 10)
    })
  }
  introStickers.value = result
}
generateRandomStickers()

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
    const images = Array.from(introRoot.querySelectorAll<HTMLImageElement>('.p-index__intro-overlay img'))
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

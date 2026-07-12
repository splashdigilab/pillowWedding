import { ref, readonly, onMounted, onUnmounted } from 'vue'

/**
 * 讓 In-App Browser（LINE / FB / IG）的鍵盤彈出變成「軟」的過場。
 *
 * 背景：這類瀏覽器是原生 WebView，鍵盤彈出時是 App 直接把 WebView 的 frame 砍矮，
 * 網頁端擋不掉（interactive-widget=overlays-content 只有 Chromium 系認得，LINE iOS 的
 * WKWebView 會忽略）。我們唯一能控制的是「版面怎麼反應」：
 *
 *   1. 版面高度不再直接綁 100dvh（瀏覽器一改就瞬間生效、無法補間），
 *      改綁本 composable 寫入的 --app-h，高度變化由我們驅動 → 可以掛 CSS transition。
 *   2. --app-base-h 是「沒有鍵盤時」的高度，給 body / #__nuxt 用：外層維持原本高度不縮，
 *      過場期間 .p-editor 才不會被外層 overflow 裁掉。
 *   3. keyboardBusy 讓頁面在鍵盤動畫期間停掉昂貴的量測（ResizeObserver → Vue 重繪）。
 *
 * 判斷依據刻意用 window.innerHeight（layout viewport）而不是 visualViewport：
 * 只有「瀏覽器真的把 WebView 壓小」才會變。鍵盤是疊在畫面上的瀏覽器（支援
 * overlays-content 的 iOS Safari / Android Chrome）innerHeight 不動，這裡就整個不作用，
 * 維持原本的行為。
 */

interface SoftKeyboardOptions {
  /**
   * 在把新高度寫進 CSS 變數「之前」呼叫，讓頁面還來得及量到尚未變形的版面。
   * next / prev = 鍵盤佔掉的高度（px）。
   */
  beforeApply?: (next: number, prev: number) => void
  /** 鍵盤高度不再變動、且過場動畫跑完後呼叫一次，用來做精確校正。 */
  onSettle?: () => void
}

/** 小於此值的視窗高度變化視為工具列收合（LINE 底部列、網址列），不是鍵盤 */
const KEYBOARD_MIN_HEIGHT = 120

/** 需大於 SCSS 的 $editor-keyboard-duration，動畫真的跑完才解除 busy */
const SETTLE_DELAY = 360

export const useSoftKeyboard = (options: SoftKeyboardOptions = {}) => {
  const keyboardHeight = ref(0)
  const keyboardOpen = ref(false)
  /** 鍵盤高度變化中（含我們自己的過場動畫）：期間應暫停量測與重繪 */
  const keyboardBusy = ref(false)

  let baseHeight = 0
  let rafId: number | null = null
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  const writeVars = () => {
    const style = document.documentElement.style
    style.setProperty('--app-base-h', `${baseHeight}px`)
    style.setProperty('--app-h', `${baseHeight - keyboardHeight.value}px`)
    style.setProperty('--kb-h', `${keyboardHeight.value}px`)
  }

  const scheduleSettle = () => {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      settleTimer = null
      keyboardBusy.value = false
      options.onSettle?.()
    }, SETTLE_DELAY)
  }

  const applyKeyboardHeight = (next: number) => {
    const prev = keyboardHeight.value
    if (next === prev) return

    keyboardBusy.value = true
    // 先給頁面量「還沒套用新高度」的版面，它才算得出過場的終點值
    options.beforeApply?.(next, prev)

    keyboardHeight.value = next
    keyboardOpen.value = next > 0
    writeVars()
    scheduleSettle()
  }

  const update = () => {
    const height = window.innerHeight
    if (!baseHeight) baseHeight = height

    const shrink = baseHeight - height
    if (shrink < KEYBOARD_MIN_HEIGHT) {
      // 視窗變高（工具列收合）→ 這才是真正的滿版高度，重新校準基準
      if (height > baseHeight) baseHeight = height
      applyKeyboardHeight(0)
      writeVars()
      return
    }

    applyKeyboardHeight(shrink)
  }

  const schedule = () => {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      update()
    })
  }

  // 旋轉會整個換一組尺寸：清掉基準，等瀏覽器回報新尺寸後重新量
  const onOrientationChange = () => {
    baseHeight = 0
    keyboardHeight.value = 0
    keyboardOpen.value = false
    keyboardBusy.value = true
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      settleTimer = null
      baseHeight = window.innerHeight
      writeVars()
      keyboardBusy.value = false
      options.onSettle?.()
    }, SETTLE_DELAY)
  }

  onMounted(() => {
    baseHeight = window.innerHeight
    writeVars()
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', onOrientationChange)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', onOrientationChange)
    if (rafId !== null) cancelAnimationFrame(rafId)
    if (settleTimer) clearTimeout(settleTimer)

    const style = document.documentElement.style
    style.removeProperty('--app-base-h')
    style.removeProperty('--app-h')
    style.removeProperty('--kb-h')
  })

  return {
    keyboardOpen: readonly(keyboardOpen),
    keyboardHeight: readonly(keyboardHeight),
    keyboardBusy
  }
}

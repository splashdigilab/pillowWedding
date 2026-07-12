import { ref, readonly, onMounted, onUnmounted } from 'vue'

/**
 * 讓 In-App Browser（LINE / FB / IG）的鍵盤行為向 iOS Safari / Chrome 看齊：
 * 鍵盤「疊」在畫面上，而不是把整個版面壓扁成一小條。
 *
 * 背景：這類瀏覽器是原生 WebView，鍵盤彈出時 App 直接把 WebView 的 frame 砍矮
 * （window.innerHeight 真的變小），網頁端擋不掉——interactive-widget=overlays-content
 * 只有 Chromium 系認得，LINE iOS 的 WKWebView 會忽略。
 *
 * 我們唯一能控制的是「版面怎麼反應」，所以策略是：不反應。
 *
 *   1. --app-base-h = 沒有鍵盤時的視窗高度。版面高度一律綁這個值，鍵盤彈出時
 *      完全不縮；被鍵盤蓋住的部分就落在 WebView 之外看不到而已——
 *      這正是 iOS Safari 疊加鍵盤時的樣子。
 *   2. --app-shift = 整個版面要往上平移多少，才能讓「正在打字的元素」露在鍵盤上緣之上。
 *      Safari 會自己捲 visual viewport 去追游標；我們的版面是 position: fixed、
 *      捲不動，這段位移只好自己算。
 *   3. keyboardBusy 讓頁面在鍵盤動畫期間停掉昂貴的量測（ResizeObserver → Vue 重繪）。
 *
 * 判斷依據刻意用 window.innerHeight（layout viewport）而不是 visualViewport：
 * 只有「瀏覽器真的把 WebView 壓小」才會變。鍵盤純疊加的瀏覽器（iOS Safari /
 * Android Chrome）innerHeight 不動 → keyboardHeight 恆為 0 → 這裡整組不作用，
 * 追游標的事交還給瀏覽器自己做。
 */

interface SoftKeyboardOptions {
  /** 鍵盤高度不再變動、且過場動畫跑完後呼叫一次，用來做精確校正。 */
  onSettle?: () => void
}

/** 小於此值的視窗高度變化視為工具列收合（LINE 底部列、網址列），不是鍵盤 */
const KEYBOARD_MIN_HEIGHT = 120

/** 需大於 SCSS 的 $editor-keyboard-duration，動畫真的跑完才解除 busy */
const SETTLE_DELAY = 360

/** 正在編輯的元素與鍵盤上緣之間至少留這麼多空隙 */
const CARET_MARGIN = 16

export const useSoftKeyboard = (options: SoftKeyboardOptions = {}) => {
  const keyboardHeight = ref(0)
  const keyboardOpen = ref(false)
  /** 鍵盤高度變化中（含我們自己的過場動畫）：期間應暫停量測與重繪 */
  const keyboardBusy = ref(false)

  let baseHeight = 0
  /** 目前版面往上平移的距離（px） */
  let shift = 0
  let rafId: number | null = null
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  const writeVars = () => {
    const style = document.documentElement.style
    style.setProperty('--app-base-h', `${baseHeight}px`)
    style.setProperty('--kb-h', `${keyboardHeight.value}px`)
    style.setProperty('--app-shift', `${shift}px`)
  }

  /** 目前聚焦、而且真的會叫出鍵盤的元素 */
  const focusedField = (): HTMLElement | null => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    if (el.isContentEditable) return el
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el : null
  }

  /**
   * 版面不縮，被鍵盤蓋住的部分就純粹看不到——所以要把整個版面往上推，
   * 讓正在打字的元素落在鍵盤上緣之上。
   */
  const computeShift = () => {
    if (keyboardHeight.value <= 0) return 0
    const el = focusedField()
    if (!el) return 0

    const visible = baseHeight - keyboardHeight.value
    const rect = el.getBoundingClientRect()
    // rect 量到的是「已套用目前 shift」的位置，先加回去還原成沒位移時的座標
    const top = rect.top + shift
    const bottom = rect.bottom + shift

    const needed = bottom + CARET_MARGIN - visible
    if (needed <= 0) return 0
    // 但不能推過頭，把元素自己頂出畫面上緣
    return Math.max(0, Math.min(needed, top - CARET_MARGIN))
  }

  const applyShift = () => {
    const next = computeShift()
    if (next === shift) return
    shift = next
    writeVars()
  }

  const scheduleSettle = () => {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      settleTimer = null
      keyboardBusy.value = false
      // 動畫跑完後，版面與鍵盤都靜止了，再校正一次位移
      applyShift()
      options.onSettle?.()
    }, SETTLE_DELAY)
  }

  const applyKeyboardHeight = (next: number) => {
    if (next === keyboardHeight.value) return

    keyboardBusy.value = true
    keyboardHeight.value = next
    keyboardOpen.value = next > 0
    shift = computeShift()
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

  /** 鍵盤還開著時換點另一個文字框：高度沒變、resize 不會來，得自己重算位移 */
  const onFocusIn = () => {
    if (!keyboardOpen.value) return
    keyboardBusy.value = true
    applyShift()
    scheduleSettle()
  }

  /**
   * 版面比 WebView 高，WKWebView 會忍不住捲動 document 去露出游標，
   * 捲完上方就空一塊。位移由我們自己算，這裡把它捲回去。
   */
  const onScroll = () => {
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }

  // 旋轉會整個換一組尺寸：清掉基準，等瀏覽器回報新尺寸後重新量
  const onOrientationChange = () => {
    baseHeight = 0
    shift = 0
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
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('scroll', onScroll, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', onOrientationChange)
    window.removeEventListener('focusin', onFocusIn)
    window.removeEventListener('scroll', onScroll)
    if (rafId !== null) cancelAnimationFrame(rafId)
    if (settleTimer) clearTimeout(settleTimer)

    const style = document.documentElement.style
    style.removeProperty('--app-base-h')
    style.removeProperty('--kb-h')
    style.removeProperty('--app-shift')
  })

  return {
    keyboardOpen: readonly(keyboardOpen),
    keyboardHeight: readonly(keyboardHeight),
    keyboardBusy
  }
}

/**
 * 偵測 In-App Browser 並提供警告功能
 */
export const useInAppBrowser = () => {
  const isInAppBrowser = ref(false)
  const browserName = ref('')
  const showWarning = ref(false)

  /**
   * 偵測是否為 In-App Browser
   */
  const detectInAppBrowser = () => {
    if (!import.meta.client) return

    const ua = navigator.userAgent || navigator.vendor || (window as any).opera

    // 偵測 LINE
    if (ua.includes('Line/') || ua.includes('LINE/')) {
      isInAppBrowser.value = true
      browserName.value = 'LINE'
      return
    }

    // 偵測 Instagram
    if (ua.includes('Instagram')) {
      isInAppBrowser.value = true
      browserName.value = 'Instagram'
      return
    }

    // 偵測 Facebook
    if (ua.includes('FBAN') || ua.includes('FBAV')) {
      isInAppBrowser.value = true
      browserName.value = 'Facebook'
      return
    }

    // 偵測 Twitter
    if (ua.includes('Twitter')) {
      isInAppBrowser.value = true
      browserName.value = 'Twitter'
      return
    }

    // 偵測微信
    if (ua.includes('MicroMessenger')) {
      isInAppBrowser.value = true
      browserName.value = '微信'
      return
    }

    isInAppBrowser.value = false
  }

  /**
   * 顯示警告
   */
  const showBrowserWarning = () => {
    if (isInAppBrowser.value) {
      showWarning.value = true
    }
  }

  /**
   * 關閉警告
   */
  const closeWarning = () => {
    showWarning.value = false
  }

  /**
   * 取得開啟外部瀏覽器的說明文字
   */
  const getInstructions = computed(() => {
    if (!import.meta.client || typeof navigator === 'undefined') {
      return '請使用 Safari 或 Chrome 等外部瀏覽器開啟此連結'
    }
    const ua = navigator.userAgent || ''
    const isIOS = /iPad|iPhone|iPod/.test(ua)

    if (browserName.value === 'LINE') {
      return isIOS
        ? '點擊右上角「...」→「在 Safari 中打開」'
        : '點擊右上角「⋮」→「在其他瀏覽器中開啟」'
    }

    if (browserName.value === 'Instagram') {
      return isIOS
        ? '點擊右上角「...」→「在 Safari 中打開」'
        : '點擊右上角「⋮」→「在 Chrome 中開啟」'
    }

    if (browserName.value === 'Facebook') {
      return '點擊右上角選單 → 在外部瀏覽器開啟'
    }

    return '請使用 Safari 或 Chrome 等外部瀏覽器開啟此連結'
  })

  // 自動偵測
  onMounted(() => {
    detectInAppBrowser()
  })

  return {
    isInAppBrowser: readonly(isInAppBrowser),
    browserName: readonly(browserName),
    showWarning: readonly(showWarning),
    instructions: getInstructions,
    showBrowserWarning,
    closeWarning
  }
}

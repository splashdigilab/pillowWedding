/**
 * 便利貼烘圖：把整張便利貼（背景 + 貼紙 + 文字 + 手繪）壓成單一張圖片。
 *
 * 為什麼要這樣做：牆上原本是把每張便利貼用 CSS 即時組回來，這代表瀏覽器必須同時抱著
 * 全部貼紙（1400px）、全部背景（1254px）、中文字體與每張便利貼的遮罩／陰影／混色暫存。
 * 壓成一張圖之後，牆上每張便利貼就只是一個 <img>，那些成本全部歸零。
 *
 * 這裡的前置流程（預載背景、強制載入圖片、內嵌字體、注入紙紋、iOS 預熱）每一步都是在
 * 對抗 html-to-image 在 off-screen 節點上的已知問題。少任何一步，某些手機就會輸出
 * 空白圖或掉字體。修改前請先確認你知道那一步在擋什麼。
 */
import { toCanvas } from 'html-to-image'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

/** export node 的實際尺寸，pixelRatio 以此為基準換算 */
const EXPORT_NODE_SIZE = 1080

/** 上傳用的便利貼圖尺寸。牆上顯示 150px、最大放大 3 倍，800px 足夠且記憶體只有原本的一小部分 */
export const UPLOAD_IMAGE_SIZE = 800

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise(resolve => canvas.toBlob(resolve, type, quality))

export const useNoteImage = () => {
  /**
   * html-to-image 若不自行提供 fontEmbedCSS，輸出圖會掉回系統字體（手機最明顯）。
   * 全站只有 ChenYuluoyan 一支字體，同 origin，沒有 CORS 問題。
   */
  const buildFontEmbedCSS = async (): Promise<string> => {
    try {
      const res = await fetch('/ChenYuluoyan-2.0-Thin.woff2')
      if (!res.ok) return ''
      const base64 = await blobToDataURL(await res.blob())
      return `@font-face{font-family:'ChenYuluoyan';src:url('${base64}') format('woff2');font-weight:normal;font-style:normal;}`
    } catch (e) {
      console.warn('[NoteImage] 字體嵌入失敗:', e)
      return ''
    }
  }

  /** 背景圖必須先進瀏覽器快取，否則 html-to-image 抓不到 */
  const preloadBackground = (bgUrl?: string): Promise<void> =>
    new Promise(resolve => {
      if (!bgUrl) return resolve()
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = bgUrl
    })

  /**
   * StickyNote 的 <img> 帶有 loading="lazy" + decoding="async"，在畫面外（-9999px）
   * 不會自動載入。必須改成 eager/sync 並等它們真的載完，否則會截到半成品。
   */
  const forceLoadImages = async (node: HTMLElement) => {
    const imgs = Array.from(node.querySelectorAll('img'))
    for (const img of imgs) {
      img.loading = 'eager'
      img.decoding = 'sync'
      if (!img.complete || img.naturalWidth === 0) {
        const src = img.src
        img.src = ''
        img.src = src
      }
    }
    await Promise.all(
      imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      })
    )
  }

  /**
   * 遮罩圖載入。造型 SVG 只有 viewBox、沒有 width/height，Safari 把這種 SVG 畫進 canvas 時
   * 尺寸會落在預設值而不是我們指定的大小，所以先把尺寸寫進去再載。
   */
  const loadMaskImage = async (url: string, size: number): Promise<HTMLImageElement> => {
    let src = url

    if (url.endsWith('.svg')) {
      const text = await (await fetch(url)).text()
      const sized = /<svg[^>]*\bwidth=/i.test(text)
        ? text
        : text.replace(/<svg\b/i, `<svg width="${size}" height="${size}"`)
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`遮罩圖載入失敗: ${url}`))
      img.src = src
    })
  }

  /**
   * 把便利貼的雙層遮罩（背景圖 ∩ 造型）事先在 canvas 上壓成單一張圖。
   *
   * 為什麼一定要這樣做：html-to-image 是用 style.setProperty('mask', ...) 來內嵌遮罩的 url()，
   * 這個動作會重設整個 mask 簡寫屬性，連帶把 mask-composite 從 intersect 打回預設的 add。
   * 兩層遮罩於是從「交集」變成「聯集」，遮罩範圍擴大成整個造型方框，紙紋與打光層就鋪滿方框、
   * 在便利貼輪廓外露出一塊灰色方塊。
   *
   * 單層遮罩沒有 composite 可言，所以先自己合成好，html-to-image 就沒有東西可以弄壞。
   */
  const flattenMask = async (node: HTMLElement) => {
    const MASK_SIZE = 1024
    const inners = Array.from(node.querySelectorAll<HTMLElement>('.c-sticky-note__inner'))

    for (const inner of inners) {
      const raw = inner.style.maskImage || inner.style.webkitMaskImage
      if (!raw) continue

      const urls = Array.from(raw.matchAll(/url\((['"]?)([^'")]+)\1\)/g)).map(m => m[2] as string)
      // 只有一層就沒有 composite 問題，不用動
      if (urls.length < 2) continue

      const canvas = document.createElement('canvas')
      canvas.width = MASK_SIZE
      canvas.height = MASK_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      const [first, ...rest] = urls
      ctx.drawImage(await loadMaskImage(first!, MASK_SIZE), 0, 0, MASK_SIZE, MASK_SIZE)

      // destination-in：只留下「兩者都不透明」的區域，也就是交集
      ctx.globalCompositeOperation = 'destination-in'
      for (const url of rest) {
        ctx.drawImage(await loadMaskImage(url, MASK_SIZE), 0, 0, MASK_SIZE, MASK_SIZE)
      }

      const merged = `url(${canvas.toDataURL('image/png')})`
      for (const [prop, value] of [
        ['mask-image', merged],
        ['-webkit-mask-image', merged],
        ['mask-size', '100% 100%'],
        ['-webkit-mask-size', '100% 100%']
      ]) {
        inner.style.setProperty(prop!, value!)
      }
      inner.style.removeProperty('mask-composite')
      inner.style.removeProperty('-webkit-mask-composite')
    }
  }

  /**
   * 紙紋是 ::after 偽元素的 background-image。相對 URL 在 off-screen 截圖時找不到，
   * 必須先轉成 base64 再用 <style> 覆寫回去。
   */
  const injectPaperTexture = async (node: HTMLElement): Promise<HTMLStyleElement | null> => {
    try {
      const res = await fetch('/paperTexture.webp')
      if (!res.ok) return null
      const base64 = await blobToDataURL(await res.blob())
      const style = document.createElement('style')
      style.textContent = `.c-sticky-note__inner::after{background-image:url('${base64}') !important;}`
      node.appendChild(style)
      return style
    } catch (e) {
      console.warn('[NoteImage] 紙張材質嵌入失敗:', e)
      return null
    }
  }

  /**
   * 把 export node 畫成 canvas。呼叫前 node 必須已經掛載並完成 paint。
   * @param outputSize 產出的邊長（px）
   */
  const renderToCanvas = async (
    node: HTMLElement,
    bgUrl: string | undefined,
    outputSize: number
  ): Promise<HTMLCanvasElement> => {
    await preloadBackground(bgUrl)
    await forceLoadImages(node)
    await flattenMask(node)

    const fontEmbedCSS = await buildFontEmbedCSS()
    const textureStyle = await injectPaperTexture(node)

    try {
      // iOS 預熱：先用低解析度跑一次，強迫 html-to-image 綁定所有資源。
      // 少了這一步，iOS 上第一次的正式輸出常常是空白或缺圖。
      await toCanvas(node, { cacheBust: true, fontEmbedCSS, pixelRatio: 0.5 }).catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 300))

      return await toCanvas(node, {
        pixelRatio: outputSize / EXPORT_NODE_SIZE,
        cacheBust: true,
        fontEmbedCSS
      })
    } finally {
      textureStyle?.remove()
    }
  }

  /**
   * 產出上傳用的圖。
   * 便利貼是不規則形狀（扇貝邊、打孔），必須保留透明度，所以退路只能是 PNG——
   * 換成 JPEG 會讓透明區域變成一片白。
   */
  const renderToUploadBlob = async (
    node: HTMLElement,
    bgUrl: string | undefined
  ): Promise<Blob> => {
    const canvas = await renderToCanvas(node, bgUrl, UPLOAD_IMAGE_SIZE)

    const webp = await canvasToBlob(canvas, 'image/webp', 0.85)
    if (webp && webp.type === 'image/webp') return webp

    // iOS 16.4 以前的 Safari 不支援 canvas 輸出 WebP，退回 PNG（檔案較大，但透明度保得住）
    const png = await canvasToBlob(canvas, 'image/png')
    if (png) return png

    throw new Error('便利貼圖片產生失敗')
  }

  /**
   * 上傳到 Firebase Storage。
   *
   * 檔名帶一段隨機字尾：Storage 規則禁止覆寫既有檔案（否則任何人都能蓋掉別人的便利貼），
   * 但重試時如果沿用同一個路徑，第二次就會被那條規則擋下來。每次上傳走全新路徑可以同時
   * 滿足兩者；失敗留下的孤兒檔案很便宜，不值得為它放寬規則。
   *
   * 便利貼一旦送出就不會再變，設 immutable 讓瀏覽器與 CDN 永久快取——
   * 牆上的重複造訪因此可以一個 byte 都不用重新下載。
   */
  const uploadNoteImage = async (blob: Blob, noteId: string): Promise<string> => {
    const { $storage } = useNuxtApp()
    const ext = blob.type === 'image/webp' ? 'webp' : 'png'
    const suffix = crypto.randomUUID().slice(0, 8)
    const fileRef = storageRef($storage as any, `notes/${noteId}-${suffix}.${ext}`)

    await uploadBytes(fileRef, blob, {
      contentType: blob.type,
      cacheControl: 'public, max-age=31536000, immutable'
    })

    return await getDownloadURL(fileRef)
  }

  /**
   * 烘圖 + 上傳，失敗自動重試。
   * 烘圖在低階手機上偶爾會因為記憶體壓力失敗，重跑一次通常就過了，所以不要一次失敗就放棄。
   */
  const bakeAndUpload = async (
    node: HTMLElement,
    bgUrl: string | undefined,
    noteId: string,
    attempts = 3
  ): Promise<string> => {
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const blob = await renderToUploadBlob(node, bgUrl)
        return await uploadNoteImage(blob, noteId)
      } catch (e) {
        lastError = e
        console.warn(`[NoteImage] 第 ${attempt}/${attempts} 次烘圖上傳失敗:`, e)
        if (attempt < attempts) {
          // 遞增退避：給瀏覽器一點時間回收上一次失敗留下的記憶體
          await new Promise(resolve => setTimeout(resolve, 500 * attempt))
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('便利貼圖片上傳失敗')
  }

  return {
    buildFontEmbedCSS,
    renderToCanvas,
    renderToUploadBlob,
    uploadNoteImage,
    bakeAndUpload
  }
}

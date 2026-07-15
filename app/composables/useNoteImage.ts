/**
 * 便利貼烘圖：把整張便利貼（背景 + 貼紙 + 文字 + 手繪）壓成單一張圖片。
 *
 * 為什麼要這樣做：牆上原本是把每張便利貼用 CSS 即時組回來，這代表瀏覽器必須同時抱著
 * 全部貼紙（1400px）、全部背景（1254px）、中文字體與每張便利貼的遮罩／陰影／混色暫存。
 * 壓成一張圖之後，牆上每張便利貼就只是一個 <img>，那些成本全部歸零。
 *
 * 這裡的前置流程（預載背景、強制載入圖片、內嵌字體分包、注入紙紋、iOS 預熱）每一步都是在
 * 對抗 html-to-image 在 off-screen 節點上的已知問題。少任何一步，某些手機就會輸出
 * 空白圖或掉字體。修改前請先確認你知道那一步在擋什麼。
 *
 * 手機的失敗方式特別陰險：不會拋錯，而是安靜地輸出一張全透明的圖。所以輸出前一定要過
 * isCanvasBlank 這關，否則空白便利貼會一路上傳到牆上（實際發生過，成因是整支字體太大）。
 */
import { toCanvas } from 'html-to-image'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'

/** export node 的實際尺寸，pixelRatio 以此為基準換算 */
const EXPORT_NODE_SIZE = 1080

/** 上傳用的便利貼圖尺寸。牆上顯示 150px、最大放大 3 倍，800px 足夠且記憶體只有原本的一小部分 */
export const UPLOAD_IMAGE_SIZE = 800

/** 字體分包（由 scripts/split-font.mjs 產生，見該檔說明） */
const FONT_CHUNK_DIR = '/fonts/chenyuluoyan'

/** [檔名（不含副檔名）, "4e00-4e05,4e2d"] */
type FontChunk = [string, string]

/**
 * bakeAndUpload 回報的進度。
 * 烘圖沒有內部進度可讀（toCanvas 不給），所以只能說「開始烘了」；上傳則有真實的位元組比例。
 */
export type BakeProgress =
  | { phase: 'bake' }
  | { phase: 'upload'; fraction: number }

let fontManifest: Promise<FontChunk[]> | null = null
/** 分包 → base64 data URI。同一次送出會烘圖多次（預熱、重試），不重抓 */
const fontChunkCache = new Map<string, string>()
/** 紙紋 base64，只轉一次 */
let paperTexture: Promise<string> | null = null

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise(resolve => canvas.toBlob(resolve, type, quality))

/** "4e00-4e05,4e2d" 內是否含有 code 這個字 */
const rangeCovers = (ranges: string, code: number): boolean =>
  ranges.split(',').some(part => {
    const [from, to] = part.split('-')
    const start = parseInt(from!, 16)
    return code >= start && code <= (to ? parseInt(to, 16) : start)
  })

export const useNoteImage = () => {
  /**
   * 只把「這張便利貼真的用到的字」嵌進輸出圖。
   *
   * 為什麼不能整支字體塞進去：SVG 被當成 <img> 載入時無法向外抓任何資源，字體只能內嵌成
   * data URI；而 ChenYuluoyan 是 4.6MB 的全字集手寫字型，base64 之後 6.4MB、URL-encode
   * 進 SVG 是 6.8MB。桌機扛得住，手機的 WebKit／Chromium 解不動這麼大的 SVG——<img> 會
   * onload 但畫不出東西，drawImage 於是畫出一張全透明的圖，牆上就出現空白便利貼。
   *
   * 改成只挑用到的分包後，實測 45 字的便利貼約 320KB，小了二十倍。
   * 分包檔由 scripts/split-font.mjs 產生。
   */
  const loadFontManifest = (): Promise<FontChunk[]> => {
    fontManifest ??= fetch(`${FONT_CHUNK_DIR}/manifest.json`).then(res => {
      if (!res.ok) throw new Error(`manifest ${res.status}`)
      return res.json() as Promise<FontChunk[]>
    })
    return fontManifest
  }

  const buildFontEmbedCSS = async (text: string): Promise<string> => {
    const codes = new Set(
      Array.from(text)
        .map(ch => ch.codePointAt(0)!)
        // 半形空白（U+0020）也要算進來：它在 ChenYuluoyan 裡只有 0.195em，掉回系統字體會變成
        // 0.25em 以上。而 html-to-image 會把 max-content 量到的寬度凍結成固定 px（零餘裕），
        // 每個空白多出來的那 1~2px 會直接把整行擠到下一行——編輯器沒斷行，牆上卻斷了。
        .filter(code => code >= 0x20)
    )
    if (!codes.size) return ''

    try {
      const manifest = await loadFontManifest()

      const needed = manifest.filter(([, ranges]) =>
        Array.from(codes).some(code => rangeCovers(ranges, code))
      )

      const faces = await Promise.all(
        needed.map(async ([file, ranges]) => {
          let dataUrl = fontChunkCache.get(file)
          if (!dataUrl) {
            const res = await fetch(`${FONT_CHUNK_DIR}/${file}.woff2`)
            if (!res.ok) throw new Error(`分包 ${file} ${res.status}`)
            dataUrl = await blobToDataURL(await res.blob())
            fontChunkCache.set(file, dataUrl)
          }
          // 同一個 family 掛多個 face 時，unicode-range 是瀏覽器挑對分包的依據，不能省
          return (
            `@font-face{font-family:'ChenYuluoyan';src:url('${dataUrl}') format('woff2');` +
            `font-weight:normal;font-style:normal;unicode-range:${ranges
              .split(',')
              .map(r => `U+${r}`)
              .join(',')};}`
          )
        })
      )

      return faces.join('')
    } catch (e) {
      // 抓不到分包就讓它掉回系統字體：字醜總比整張空白好，之後的空白偵測也還會擋一層
      console.warn('[NoteImage] 字體嵌入失敗:', e)
      fontManifest = null
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
   *
   * 84KB 的圖轉 base64 不便宜，而一次送出會烘圖多次（預熱＋最多三次重試），所以只做一次。
   */
  const injectPaperTexture = async (node: HTMLElement): Promise<HTMLStyleElement | null> => {
    try {
      paperTexture ??= fetch('/paperTexture.webp')
        .then(res => {
          if (!res.ok) throw new Error(`paperTexture ${res.status}`)
          return res.blob()
        })
        .then(blobToDataURL)
      const base64 = await paperTexture
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
   * export node 的前置準備：載圖 + 壓遮罩。手機上這兩件事要 0.5～1.1 秒。
   *
   * 可以（也應該）在使用者按下送出之前就先做完——確認視窗一跳出來，便利貼的內容就定案了，
   * 沒有理由等他按確定才開始載圖。編輯器會在開視窗時先叫一次，烘圖時再叫一次：
   * 第二次幾乎不花時間，因為圖已經 complete、遮罩已經被壓成單層（flattenMask 會直接跳過）。
   */
  const warmExportNode = async (node: HTMLElement, bgUrl?: string) => {
    await Promise.all([
      preloadBackground(bgUrl),
      forceLoadImages(node),
      flattenMask(node)
    ])
  }

  /**
   * 輸出是不是一張全透明的圖。
   *
   * 手機上 html-to-image 失敗的方式不是丟例外，而是安靜地畫出空白：SVG 太大時 <img> 照樣
   * onload，drawImage 卻什麼都沒畫上去。沒有這道檢查，空白便利貼就會一路上傳到牆上
   * （而且重試機制永遠不會被觸發，因為根本沒人拋錯）。
   */
  const isCanvasBlank = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // 每隔幾十個像素抽一次 alpha 就夠：真的有畫東西的話，不可能整張都抽不到不透明的點
    for (let i = 3; i < data.length; i += 4 * 31) {
      if (data[i]! > 8) return false
    }
    return true
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
    const tPrep = performance.now()
    // 這幾步彼此不相干（載圖、壓遮罩、抓字體分包、抓紙紋），沒有理由排隊等
    const [, fontEmbedCSS, textureStyle] = await Promise.all([
      warmExportNode(node, bgUrl),
      buildFontEmbedCSS(node.textContent || ''),
      injectPaperTexture(node)
    ])
    const tRender = performance.now()

    try {
      // 不開 cacheBust：素材全是同 origin 又設了 immutable 快取，cacheBust 只會讓每張圖
      // 都繞過瀏覽器快取重抓一次（手機網路上這就是好幾百毫秒）。
      //
      // 這裡原本會先用低解析度「暖機」跑一次 toCanvas，理由是 iOS 第一次輸出常常空白或缺圖。
      // 拿掉的原因：那個空白的真正成因是整支 4.6MB 字體撐爆 SVG（見 buildFontEmbedCSS），
      // 已經修掉了；而萬一還是輸出空白，下面的 isCanvasBlank 會擋下來、由 bakeAndUpload 重試，
      // 那次重試本身就等於暖機——換句話說，最壞情況跟以前一樣慢，正常情況直接省下一整趟。
      const canvas = await toCanvas(node, {
        pixelRatio: outputSize / EXPORT_NODE_SIZE,
        fontEmbedCSS
      })

      // 空白就當成失敗丟出去，讓外層的重試接手（bakeAndUpload）
      if (isCanvasBlank(canvas)) throw new Error('便利貼烘圖結果為空白')

      console.info(
        `[NoteImage] 烘圖計時：前置(載圖/字體/紙紋) ${Math.round(tRender - tPrep)}ms、toCanvas ${Math.round(performance.now() - tRender)}ms`
      )
      return canvas
    } finally {
      textureStyle?.remove()
    }
  }

  /**
   * 先把烘圖要用的素材抓下來（字體分包、紙紋、背景圖），結果進快取，之後烘圖直接用。
   *
   * 這是「上傳很慢」的主要解法，不是小優化：實測手機上烘圖的時間有一半到三分之二是卡在
   * 抓字體分包（中階手機 1.0 秒、低階 2.4 秒）。但便利貼的文字在使用者打字的當下就已經知道了，
   * 沒有理由等到他按下送出才開始抓。編輯器會在打字停下來時呼叫這裡，等他真的送出時，
   * 分包早就躺在快取裡，這段時間直接歸零。
   *
   * 抓失敗不要緊，烘圖時會自己再抓一次。
   */
  const prefetchBakeAssets = (text: string, bgUrl?: string) => {
    void loadFontManifest().catch(() => { fontManifest = null })
    void buildFontEmbedCSS(text).catch(() => {})
    void injectPaperTexture(document.createElement('div')).catch(() => {})
    void preloadBackground(bgUrl)
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

    const tEncode = performance.now()
    const webp = await canvasToBlob(canvas, 'image/webp', 0.85)
    if (webp && webp.type === 'image/webp') {
      console.info(
        `[NoteImage] 編碼 WebP ${Math.round(performance.now() - tEncode)}ms、${Math.round(webp.size / 1024)}KB`
      )
      return webp
    }

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
  const uploadNoteImage = async (
    blob: Blob,
    noteId: string,
    onProgress?: (fraction: number) => void
  ): Promise<string> => {
    const { $storage } = useNuxtApp()
    const ext = blob.type === 'image/webp' ? 'webp' : 'png'
    const suffix = crypto.randomUUID().slice(0, 8)
    const fileRef = storageRef($storage as any, `notes/${noteId}-${suffix}.${ext}`)

    // uploadBytesResumable 而不是 uploadBytes：只有前者會回報 bytesTransferred，進度條才有真實
    // 數字可讀。代價是多一趟開 session 的 round trip（便利貼圖只有一兩百 KB，本來一趟就送完），
    // 換掉「使用者盯著沒有反應的畫面」是划算的。
    const tUpload = performance.now()
    const task = uploadBytesResumable(fileRef, blob, {
      contentType: blob.type,
      cacheControl: 'public, max-age=31536000, immutable'
    })

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        snapshot => {
          if (snapshot.totalBytes > 0) {
            onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes)
          }
        },
        reject,
        resolve
      )
    })

    const tUrl = performance.now()
    const url = await getDownloadURL(fileRef)
    console.info(
      `[NoteImage] 上傳計時：傳位元組 ${Math.round(tUrl - tUpload)}ms、取下載網址 ${Math.round(performance.now() - tUrl)}ms、檔案 ${Math.round(blob.size / 1024)}KB`
    )
    return url
  }

  /** 遞增退避：給瀏覽器一點時間回收上一次失敗留下的記憶體 */
  const backoff = (attempt: number) =>
    new Promise(resolve => setTimeout(resolve, 500 * attempt))

  /**
   * 烘圖成一張可上傳的 Blob，失敗自動重試。
   * 低階手機偶爾會因為記憶體壓力失敗（或安靜地輸出空白，見 isCanvasBlank），重跑一次通常就過。
   *
   * 這件事跟「上傳」是分開的，因為它不需要網路、也不需要任何權限，所以可以在使用者還在讀
   * 「確認上傳」視窗的時候就先做掉——編輯器就是這樣用的（見 editor.vue 的 prebake）。
   */
  const bakeToBlob = async (
    node: HTMLElement,
    bgUrl: string | undefined,
    attempts = 3
  ): Promise<Blob> => {
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await renderToUploadBlob(node, bgUrl)
      } catch (e) {
        lastError = e
        console.warn(`[NoteImage] 第 ${attempt}/${attempts} 次烘圖失敗:`, e)
        if (attempt < attempts) await backoff(attempt)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('便利貼圖片產生失敗')
  }

  /** 上傳 Blob，失敗自動重試（手機網路斷斷續續，一次失敗不代表傳不上去） */
  const uploadWithRetry = async (
    blob: Blob,
    noteId: string,
    options: { attempts?: number; onProgress?: (fraction: number) => void } = {}
  ): Promise<string> => {
    const { attempts = 3, onProgress } = options
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        onProgress?.(0)
        return await uploadNoteImage(blob, noteId, onProgress)
      } catch (e) {
        lastError = e
        console.warn(`[NoteImage] 第 ${attempt}/${attempts} 次上傳失敗:`, e)
        if (attempt < attempts) await backoff(attempt)
      }
    }

    throw lastError instanceof Error ? lastError : new Error('便利貼圖片上傳失敗')
  }

  /**
   * 烘圖 + 上傳，失敗自動重試。
   *
   * onProgress 只說「現在在烘圖」或「上傳到幾成」，不換算成整體百分比——整條送出流程還有
   * GPS 驗證與 Firestore 寫入，那個加權是呼叫端（編輯器）的事，見 useSubmitProgress。
   */
  const bakeAndUpload = async (
    node: HTMLElement,
    bgUrl: string | undefined,
    noteId: string,
    options: { attempts?: number; onProgress?: (progress: BakeProgress) => void } = {}
  ): Promise<string> => {
    const { attempts, onProgress } = options

    onProgress?.({ phase: 'bake' })
    const blob = await bakeToBlob(node, bgUrl, attempts)

    return await uploadWithRetry(blob, noteId, {
      attempts,
      onProgress: fraction => onProgress?.({ phase: 'upload', fraction })
    })
  }

  return {
    buildFontEmbedCSS,
    prefetchBakeAssets,
    warmExportNode,
    renderToCanvas,
    renderToUploadBlob,
    uploadNoteImage,
    bakeToBlob,
    uploadWithRetry,
    bakeAndUpload
  }
}

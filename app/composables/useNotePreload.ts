/**
 * 便利貼烘好的圖：在它要出場之前先載好。
 *
 * 為什麼需要：牆上與大螢幕的便利貼是 <img>，瀏覽器要等元素進了 DOM 才會開始抓圖。
 * 但那時 GSAP 的進場／Flip 動畫已經在跑了，圖片是在動畫「飛到定位之後」才浮出來，
 * 看起來就像便利貼先出現一個空殼再補上內容。
 *
 * 解法是把載圖提前到「還知道它遲早要出場」的那一刻：
 *  - 牆（index）：排版算完、動畫開始前先等圖（有 timeout，壞掉的圖不會卡住整面牆）
 *  - 大螢幕（canvas）：便利貼還在 queue_pending 排隊時就先抓，通常領先好幾十秒
 *
 * 圖片設了 immutable 快取，所以「預載」對之後真正的 <img> 來說就是直接命中快取。
 */

/** url → 載入中／已載入。同一張圖不會抓第二次 */
const inflight = new Map<string, Promise<void>>()

const preloadImage = (url?: string | null): Promise<void> => {
  if (!url) return Promise.resolve()

  let task = inflight.get(url)
  if (!task) {
    task = new Promise<void>(resolve => {
      const img = new Image()
      // 失敗也 resolve：預載只是加速，不該讓任何人因為它而卡住
      img.onerror = () => resolve()
      img.onload = () => {
        // decode() 把解碼也一起做完，否則第一次 paint 仍可能掉一兩幀
        const decoded = img.decode?.() ?? Promise.resolve()
        decoded.catch(() => {}).then(() => resolve())
      }
      img.src = url
    })
    inflight.set(url, task)
  }
  return task
}

export const useNotePreload = () => {
  /** 背景預載，不等它。用在「知道它之後會出場，但現在不急」的地方 */
  const prefetchNoteImages = (notes: Array<{ imageUrl?: string }>) => {
    for (const note of notes) void preloadImage(note.imageUrl)
  }

  /**
   * 等圖載完再往下走，但最多等 timeoutMs。
   * 逾時就照原樣播動畫——圖晚到總比整面牆停在黑畫面好。
   */
  const waitForNoteImages = (
    notes: Array<{ imageUrl?: string }>,
    timeoutMs = 2500
  ): Promise<void> =>
    Promise.race([
      Promise.all(notes.map(note => preloadImage(note.imageUrl))).then(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
    ])

  return { prefetchNoteImages, waitForNoteImages }
}

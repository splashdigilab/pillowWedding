/**
 * 送出便利貼時的進度條。
 *
 * 為什麼不是直接把 Firebase 的 bytesTransferred 換算成百分比：真正花時間的是烘圖
 * （手機上 1～3 秒），而上傳的 800px WebP 只有一兩百 KB，手機網路不到一秒就送完。
 * 只讀上傳位元組的話，進度條會卡在 0% 好幾秒、再一瞬間跳到 100%，比沒有進度條更糟。
 *
 * 所以改成把整條送出流程切成幾段、各佔一段區間，每段內部再用兩種方式推進：
 *   - 讀得到真實進度的（上傳位元組）：照比例填。
 *   - 讀不到內部進度的（GPS／Token 驗證、烘圖、寫入 Firestore）：用經過時間去逼近該段上限，
 *     越接近上限走得越慢、永遠不會自己走完——真的做完了才由下一段接手。
 *
 * 這樣百分比全程都在動，而且不會出現「自己走到 100% 卻還沒好」的假象。
 */

/** 各階段佔的百分比區間。tau 越大，該段時間推進得越慢（單位：毫秒） */
const PHASES = {
  verify: { label: '驗證中', from: 0, to: 15, tau: 1500 },
  bake: { label: '產生便利貼圖片', from: 15, to: 65, tau: 2500 },
  upload: { label: '上傳中', from: 65, to: 95, tau: 3000 },
  // 刻意停在 99：100% 只有真的成功時才由 finish() 給
  save: { label: '寫入資料', from: 95, to: 99, tau: 1200 }
} as const

export type SubmitPhase = keyof typeof PHASES

export const useSubmitProgress = () => {
  const percent = ref(0)
  const label = ref('')

  let phase: SubmitPhase | null = null
  let phaseStart = 0
  let timer: ReturnType<typeof setInterval> | null = null

  /**
   * 只進不退。烘圖失敗重試時階段會倒回 bake，但進度條不該跟著往回跳——
   * 使用者看到數字變小只會覺得壞掉了。
   */
  const advance = (value: number) => {
    percent.value = Math.max(percent.value, Math.min(100, Math.round(value)))
  }

  /** 指數逼近該段上限：走得越久越慢，永遠碰不到 to */
  const tick = () => {
    if (!phase) return
    const { from, to, tau } = PHASES[phase]
    const elapsed = performance.now() - phaseStart
    advance(from + (to - from) * (1 - Math.exp(-elapsed / tau)))
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
    phase = null
  }

  const setPhase = (next: SubmitPhase) => {
    // 已經在這個階段就不要重設計時器：上傳階段每收到一次位元組回報都會再叫一次 setPhase，
    // 每次都重設的話，時間推進永遠停在該段起點（真實比例還在，但網路一卡就完全不動了）
    if (phase === next) return

    phase = next
    phaseStart = performance.now()
    label.value = PHASES[next].label
    advance(PHASES[next].from)
  }

  /**
   * 讀得到真實進度的階段（目前只有上傳）用這個把該段填到對應比例。
   * @param fraction 0～1，該階段自己的完成度
   */
  const setPhaseFraction = (fraction: number) => {
    if (!phase) return
    const { from, to } = PHASES[phase]
    advance(from + (to - from) * Math.min(1, Math.max(0, fraction)))
  }

  const start = () => {
    // 歸零在 start 而不是 stop：送出結束時把數字清成 0，Modal 淡出的那 0.2 秒會閃一下「0%」
    percent.value = 0
    label.value = ''
    phase = null
    setPhase('verify')
    timer ??= setInterval(tick, 120)
  }

  const finish = () => {
    stop()
    advance(100)
    label.value = '完成'
  }

  // 送出中途離開頁面（例如按下上一頁）時，別把 interval 留在背景空轉
  onScopeDispose(stop)

  return { percent, label, start, setPhase, setPhaseFraction, finish, stop }
}

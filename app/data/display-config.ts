/**
 * 大螢幕顯示與即時牆共用常數
 * ─── 兩個可直接設定的時間參數 ───
 *   HOLD_SECONDS：每張便利貼「靜止不動」的秒數
 *   TRANSITION_SECONDS：過場動畫的秒數（Display + Live 共用此段時間同時動）
 *
 * ─── 衍生時間 ───
 *   halfTransition = transition / 2（前半 / 後半各幾秒）
 *   slotDuration   = hold + transition（總播放秒數）
 */

/** display 閒置輪播與 live 即時牆共用的歷史張數（同一份「最新 N 張」） */
export const HISTORY_POOL_SIZE = 4

/** 每張便利貼「靜止不動」的秒數（可隨意調整） */
export const HOLD_SECONDS = 3

/** 過場動畫秒數（可隨意調整） */
export const TRANSITION_SECONDS = 2

// ─── 衍生常數（由上面兩個參數自動計算，不要直接修改）──────────────────────────

/** 前半 / 後半各幾秒 */
export const HALF_TRANSITION_SECONDS = TRANSITION_SECONDS / 2

/** 每張便利貼總播放秒數（靜止 + 過場） */
export const DISPLAY_SLOT_DURATION_SECONDS = HOLD_SECONDS + TRANSITION_SECONDS

/** 每張播放毫秒數 */
export const DISPLAY_SLOT_DURATION_MS = DISPLAY_SLOT_DURATION_SECONDS * 1000

// ─── Display 動畫視覺設定 ────────────────────────────────────────────────────

/** 畫面外的 scale（進出場的起點 / 終點） */
export const DISPLAY_SCALE_OFF = 0.5

/** 動畫中的 scale 峰值（進場先到此再變 1，出場從 1 先到此再飛出） */
export const DISPLAY_SCALE_PEAK = 1.1

// ─── Live 牆動畫設定 ───────────────────────────────────────────────────────────

/** Live 畫面外 / 飛行中的 scale */
export const LIVE_SCALE_OFF = 2

/** Live 動畫中間的 scale */
export const LIVE_SCALE_PEAK = 1.1

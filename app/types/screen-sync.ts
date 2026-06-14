import type { SerializedNote } from '~/utils/screen-sync-payload'

/**
 * BroadcastChannel 跨分頁訊息協議（note 以 SerializedNote 傳送，可被 structured clone）
 * Display（指揮端）↔ Live（執行端）
 */
export type ScreenSyncMessage =
  /** Display → Live：閒置時請求借一張 history note 做輪播 */
  | { type: 'BORROW_REQUEST' }
  /** Live → Display：已選好這張並開始出場動畫，夾帶 note 資料供 Display 預先渲染 */
  | { type: 'BORROW_DEPARTING'; note: SerializedNote }
  /**
   * Display → Live：過場開始，Live 應同步執行前半動畫
   *   nextSource='history'：下一張是歷史便利貼（規則一/二前半）
   *   nextSource='pending'：下一張是新便利貼（規則三）
   *   isExitingPending=true：目前正在從 Display 出場的是新便利貼，Live 需要擠出最舊的並留空位（規則四）
   */
  | {
    type: 'TRANSITION_START'
    noteId: string
    nextSource: 'history' | 'pending'
    isExitingPending: boolean
    exitingPendingNote?: SerializedNote
  }
  /** Display → Live：idle note 出場完畢，Live 可讓此 note 從右側飛回原 slot（規則一/二/三後半） */
  | { type: 'DISPLAY_EXIT_DONE'; noteId: string }

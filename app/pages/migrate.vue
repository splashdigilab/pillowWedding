<template>
  <div class="p-migrate">
    <h1 class="p-migrate__title">便利貼資料遷移</h1>

    <p class="p-migrate__desc">
      把舊便利貼轉成新格式：整張便利貼會在這個瀏覽器裡重新烘成一張圖、上傳到 Storage，
      文件裡的手繪 base64 隨之移除。保留最新的
      <strong>{{ KEEP_COUNT }}</strong> 張，其餘全部刪除。
    </p>

    <div v-if="!scanned" class="p-migrate__actions">
      <button class="p-migrate__btn" :disabled="busy" @click="scan">
        {{ busy ? '掃描中…' : '掃描現有便利貼' }}
      </button>
    </div>

    <template v-else>
      <ul class="p-migrate__stats">
        <li>目前 history 共 <strong>{{ allNotes.length }}</strong> 張</li>
        <li>將保留並轉檔最新的 <strong>{{ toMigrate.length }}</strong> 張（已是新格式的會跳過）</li>
        <li class="p-migrate__stats-danger">將<strong>永久刪除</strong> <strong>{{ toDelete.length }}</strong> 張</li>
      </ul>

      <div v-if="!done" class="p-migrate__actions">
        <label class="p-migrate__confirm">
          刪除無法復原。請輸入 <code>DELETE</code> 以確認：
          <input v-model="confirmText" class="p-migrate__input" placeholder="DELETE" />
        </label>
        <button
          class="p-migrate__btn p-migrate__btn--danger"
          :disabled="busy || confirmText !== 'DELETE'"
          @click="run"
        >
          {{ busy ? '執行中…' : '開始遷移' }}
        </button>
      </div>

      <ol v-if="log.length" class="p-migrate__log">
        <li v-for="(line, i) in log" :key="i" :data-kind="line.kind">{{ line.text }}</li>
      </ol>
    </template>

    <!--
      烘圖來源。跟 editor 的 export node 同樣是 1080×1080、off-screen、opacity:0。
      force-render 是必要的：要烘的就是完整 DOM，不能拿烘好的圖再烘一次。
    -->
    <div
      v-if="bakingNote"
      style="position: fixed; left: -9999px; top: -9999px; pointer-events: none; opacity: 0;"
    >
      <div ref="exportNodeRef" style="width: 1080px; height: 1080px; background: transparent;">
        <div style="width: 100%; height: 100%; position: relative;">
          <StickyNote
            :note="bakingNote"
            force-render
            style="position: absolute; left: 0; top: 0; width: 100%; height: 100%;"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, deleteField
} from 'firebase/firestore'
import type { QueueHistoryItem } from '~/types'
import StickyNote from '~/components/StickyNote.vue'
import { useNoteImage } from '~/composables/useNoteImage'

definePageMeta({ layout: false })

/** 保留最新幾張 */
const KEEP_COUNT = 10

const { $firestore } = useNuxtApp()
const db = $firestore as any
const { bakeAndUpload } = useNoteImage()

const exportNodeRef = ref<HTMLElement | null>(null)
const bakingNote = ref<QueueHistoryItem | null>(null)

const busy = ref(false)
const scanned = ref(false)
const done = ref(false)
const confirmText = ref('')
const allNotes = ref<QueueHistoryItem[]>([])
const log = ref<{ text: string; kind: 'info' | 'ok' | 'error' }[]>([])

const say = (text: string, kind: 'info' | 'ok' | 'error' = 'info') => log.value.push({ text, kind })

const toMigrate = computed(() => allNotes.value.slice(0, KEEP_COUNT))
const toDelete = computed(() => allNotes.value.slice(KEEP_COUNT))

const scan = async () => {
  busy.value = true
  try {
    const snap = await getDocs(query(collection(db, 'queue_history'), orderBy('playedAt', 'desc')))
    allNotes.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as QueueHistoryItem))
    scanned.value = true
  } catch (e: any) {
    say(`掃描失敗：${e?.message || e}`, 'error')
  } finally {
    busy.value = false
  }
}

/** 掛上 export node 並等它畫完（雙 RAF：確保 layout 與 paint 都完成，遮罩與背景圖才會就位） */
const mountExportNode = async (note: QueueHistoryItem): Promise<HTMLElement> => {
  bakingNote.value = note
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  if (!exportNodeRef.value) throw new Error('export node 未就緒')
  return exportNodeRef.value
}

const run = async () => {
  busy.value = true
  log.value = []

  try {
    let migrated = 0
    let skipped = 0

    for (const note of toMigrate.value) {
      const label = `${note.id?.slice(0, 8)}…`

      if (note.imageUrl) {
        skipped++
        say(`跳過 ${label}（已是新格式）`)
        continue
      }

      try {
        const node = await mountExportNode(note)
        const imageUrl = await bakeAndUpload(node, note.style?.backgroundImage, note.id!)

        // 手繪 base64 已經烘進圖裡，從文件移除——這是文件從 ~400KB 縮到 ~2KB 的原因
        await updateDoc(doc(db, 'queue_history', note.id!), {
          imageUrl,
          'style.drawing': deleteField()
        })

        migrated++
        say(`✅ 轉檔 ${label}`, 'ok')
      } catch (e: any) {
        say(`❌ 轉檔失敗 ${label}：${e?.message || e}`, 'error')
      } finally {
        bakingNote.value = null
      }
    }

    say(`轉檔完成：成功 ${migrated}、跳過 ${skipped}`, 'ok')

    let deleted = 0
    for (const note of toDelete.value) {
      try {
        await deleteDoc(doc(db, 'queue_history', note.id!))
        deleted++
      } catch (e: any) {
        say(`❌ 刪除失敗 ${note.id?.slice(0, 8)}…：${e?.message || e}`, 'error')
      }
    }
    say(`已刪除 ${deleted} / ${toDelete.value.length} 張`, 'ok')

    done.value = true
  } finally {
    bakingNote.value = null
    busy.value = false
  }
}
</script>

<style scoped>
.p-migrate {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
}

.p-migrate__title {
  font-size: 1.5rem;
  font-weight: 700;
}

.p-migrate__desc {
  margin: 0.75rem 0 1.5rem;
  color: #444;
}

.p-migrate__stats {
  margin: 0 0 1.5rem;
  padding: 1rem 1rem 1rem 2rem;
  background: #f6f6f6;
  border-radius: 0.5rem;
}

.p-migrate__stats-danger {
  color: #b3261e;
}

.p-migrate__actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.p-migrate__confirm {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.p-migrate__input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 0.375rem;
  font: inherit;
}

.p-migrate__btn {
  padding: 0.65rem 1.25rem;
  border: 0;
  border-radius: 0.375rem;
  background: #1a1a1a;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.p-migrate__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.p-migrate__btn--danger {
  background: #b3261e;
}

.p-migrate__log {
  margin: 0;
  padding: 1rem 1rem 1rem 2.25rem;
  background: #101010;
  color: #ddd;
  border-radius: 0.5rem;
  font-family: ui-monospace, monospace;
  font-size: 0.82rem;
}

.p-migrate__log li[data-kind='ok'] {
  color: #6ee787;
}

.p-migrate__log li[data-kind='error'] {
  color: #ff7b72;
}
</style>

<template>
  <div class="p-qrcode">
    <div v-if="activeToken" class="p-qrcode__container">
      <div class="p-qrcode__header">
        <h1 class="p-qrcode__title">掃描加入互動</h1>
        <p class="p-qrcode__subtitle">
          請使用手機相機掃描下方條碼<br>
          <span class="p-qrcode__timer">（{{ timeLeft }} 秒後關閉）</span>
        </p>
      </div>
      
      <div class="p-qrcode__box">
        <canvas ref="qrCanvas" class="p-qrcode__canvas"></canvas>
      </div>
      
      <div class="p-qrcode__footer">
        <code>{{ activeToken }}</code>
      </div>
    </div>
    
    <div v-else class="p-qrcode__empty">
      <h2 class="p-qrcode__standby">等待生成中...</h2>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import QRCode from 'qrcode'

definePageMeta({ layout: false })

const { $firestore } = useNuxtApp()
const db = $firestore as any

const activeToken = ref<string | null>(null)
const expiresAt = ref<number | null>(null)
const timeLeft = ref(0)
const qrCanvas = ref<HTMLCanvasElement | null>(null)

let unsub: (() => void) | null = null
let timer: ReturnType<typeof setInterval> | null = null

const startCountdown = () => {
  if (timer) clearInterval(timer)
  
  const updateTimer = () => {
    if (!expiresAt.value) {
      timeLeft.value = 0
      return
    }
    const remain = Math.ceil((expiresAt.value - Date.now()) / 1000)
    if (remain <= 0) {
      timeLeft.value = 0
      activeToken.value = null
      expiresAt.value = null
      clearInterval(timer!)
    } else {
      timeLeft.value = remain
    }
  }
  
  updateTimer()
  timer = setInterval(updateTimer, 1000)
}

const renderQRCode = async () => {
  if (!activeToken.value || !qrCanvas.value) return
  const url = `${window.location.origin}/editor?token=${activeToken.value}`
  
  try {
    // Generate a high-contrast Black & White QR
    await QRCode.toCanvas(qrCanvas.value, url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })
  } catch (err) {
    console.error('QR Code render error:', err)
  }
}

onMounted(() => {
  unsub = onSnapshot(doc(db, 'system', 'active_token'), (snap) => {
    if (snap.exists()) {
      const data = snap.data()
      // If token is explicitly set to null/cleared remotely, reset state
      if (!data.token || !data.expiresAt || data.expiresAt <= Date.now()) {
        activeToken.value = null
        expiresAt.value = null
        if (timer) clearInterval(timer)
      } else {
        activeToken.value = data.token
        expiresAt.value = data.expiresAt
        startCountdown()
        nextTick(() => renderQRCode())
      }
    } else {
      activeToken.value = null
      expiresAt.value = null
    }
  })
})

onUnmounted(() => {
  if (unsub) unsub()
  if (timer) clearInterval(timer)
})

</script>

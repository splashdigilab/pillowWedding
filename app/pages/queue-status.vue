<template>
  <div class="p-queue-status-minimal">
    <AppHeader />
    <div class="p-queue-status-minimal__container">
      
      <!-- Queue Info -->
      <div class="p-queue-status-minimal__content">
        <h1 class="p-queue-status-minimal__title">等待中</h1>
        
        <div class="p-queue-status-minimal__stats">
          <div class="p-queue-status-minimal__stat-item">
            <span class="p-queue-status-minimal__stat-label">目前佇列</span>
            <span class="p-queue-status-minimal__stat-value">{{ queueCount }} <small>張</small></span>
          </div>

          <div class="p-queue-status-minimal__stat-divider"></div>

          <div class="p-queue-status-minimal__stat-item">
            <span class="p-queue-status-minimal__stat-label">預估時間</span>
            <span class="p-queue-status-minimal__stat-value">
              {{ formattedTime }}
            </span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-queue-status-minimal__actions">
        <NuxtLink to="/" class="p-queue-status-minimal__btn-home">
          回到首頁
        </NuxtLink>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { collection, query, onSnapshot } from 'firebase/firestore'

definePageMeta({
  layout: false
})

const { $firestore } = useNuxtApp()
const db = $firestore as any

const queueCount = ref(0)
let unsubscribe: (() => void) | null = null

// 每張便利貼的預估顯示時間（秒）
const displaySec = 15

const startListening = () => {
  const q = query(collection(db, 'queue_pending'))
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    queueCount.value = snapshot.size
  }, (error) => {
    console.error('Error listening to queue:', error)
  })
}

const formattedTime = computed(() => {
  const total = queueCount.value * displaySec
  
  if (total <= 60) {
    // 一分鐘內一律顯示「準備顯示」，不再顯示秒數倒數
    return '準備顯示'
  }
  
  const minutes = Math.ceil(total / 60)

  // 使用「大概時間」區間文案，而不是精確分秒
  if (minutes <= 2) {
    return '約 2 分鐘內'
  }
  if (minutes <= 3) {
    return '約 3 分鐘內'
  }
  if (minutes <= 4) {
    return '約 4 分鐘內'
  }
  if (minutes <= 5) {
    return '約 5 分鐘內'
  }
  if (minutes <= 6) {
    return '約 6 分鐘內'
  }
  if (minutes <= 7) {
    return '約 7 分鐘內'
  }
  if (minutes <= 8) {
    return '約 8 分鐘內'
  }
  if (minutes <= 9) {
    return '約 9 分鐘內'
  }
  if (minutes <= 10) {
    return '約 10 分鐘內'
  }
  if (minutes <= 15) {
    return '約 15 分鐘內'
  }
  if (minutes <= 20) {
    return '約 20 分鐘內'
  }

  if (minutes <= 25) {
    return '約 25 分鐘內'
  }

  if (minutes <= 30) {
    return '約 30 分鐘內'
  }

  return '超過 30 分鐘'
})

onMounted(() => {
  startListening()
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

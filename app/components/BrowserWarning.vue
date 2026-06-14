<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="c-browser-warning-overlay" @click="onClose">
        <div class="c-browser-warning-modal" @click.stop>
          <div class="c-browser-warning-icon">⚠️</div>
          
          <h2 class="c-browser-warning-title">
            請使用外部瀏覽器開啟
          </h2>
          
          <p class="c-browser-warning-message">
            偵測到您正在使用 <strong>{{ browserName }}</strong> 應用程式內建瀏覽器
          </p>
          
          <div class="c-browser-warning-instructions">
            <p class="instructions-title">請依照以下步驟操作：</p>
            <p class="instructions-text">{{ instructions }}</p>
          </div>
          
          <div class="c-browser-warning-reason">
            <p><strong>為什麼需要這樣做？</strong></p>
            <p>內建瀏覽器可能會導致資料儲存失效，造成您編輯的內容遺失。</p>
          </div>
          
          <button class="c-browser-warning-button" @click="onClose">
            我知道了（繼續使用）
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  show: boolean
  browserName: string
  instructions: string
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const onClose = () => {
  emit('close')
}
</script>

<style scoped>
/* 所有樣式已移至 app/assets/scss/components/_browser-warning.scss */
</style>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="c-modal-overlay" @click="handleOverlayClick">
        <div class="c-modal" @click.stop>
          
          <div v-if="icon" class="c-modal__icon">{{ icon }}</div>
          
          <h2 v-if="title" class="c-modal__title">{{ title }}</h2>
          <p v-if="message" class="c-modal__message" v-html="message"></p>

          <!-- For injecting previews like StickyNote -->
          <div v-if="$slots.preview" class="c-modal__preview-wrapper">
            <slot name="preview"></slot>
          </div>

          <!-- 進度條：只有 loading 且呼叫端有給 progress 時才出現 -->
          <div v-if="loading && progress !== null" class="c-modal__progress">
            <div
              class="c-modal__progress-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="clampedProgress"
            >
              <div
                class="c-modal__progress-bar"
                :style="{ transform: `scaleX(${clampedProgress / 100})` }"
              ></div>
            </div>
            <p class="c-modal__progress-text">
              {{ progressLabel }} {{ clampedProgress }}%
            </p>
          </div>

          <div class="c-modal__actions">
            <!-- Secondary/Cancel Button -->
            <button 
              v-if="cancelText"
              class="c-button c-button--secondary" 
              @click="handleCancel"
              :disabled="loading"
            >
              {{ cancelText }}
            </button>
            <slot name="secondary-action"></slot>

            <!-- Primary/Confirm Button -->
            <button 
              v-if="confirmText"
              class="c-button" 
              :class="confirmButtonClass"
              @click="handleConfirm"
              :disabled="loading"
            >
              {{ loading ? loadingText : confirmText }}
            </button>
            <slot name="primary-action"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '確認'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  confirmButtonClass: {
    type: String,
    default: 'c-button--primary'
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingText: {
    type: String,
    default: '處理中...'
  },
  /** 0～100。給 null（預設）就完全不顯示進度條，維持原本只有「處理中...」的行為 */
  progress: {
    type: Number as PropType<number | null>,
    default: null
  },
  /** 進度條下方的階段說明，例如「上傳中」 */
  progressLabel: {
    type: String,
    default: ''
  },
  closeOnOverlay: {
    type: Boolean,
    default: false
  }
})

const clampedProgress = computed(() =>
  Math.round(Math.min(100, Math.max(0, props.progress ?? 0)))
)

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const handleOverlayClick = () => {
  if (props.closeOnOverlay && !props.loading) {
    emit('update:modelValue', false)
    emit('cancel')
  }
}

const handleCancel = () => {
  emit('update:modelValue', false)
  emit('cancel')
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<style lang="scss">
// Common styles injected into the app scope for the teleported modal
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
  
  .c-modal {
    transition: transform 0.2s ease;
  }
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  
  .c-modal {
    transform: scale(0.95);
  }
}
</style>

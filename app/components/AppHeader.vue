<template>
  <header class="c-header" :class="{ 'c-header--transparent': transparent, 'c-header--relative': relative }">
    <button v-if="showBack" class="c-header__back-btn" aria-label="返回" @click="$emit('back')">
      <!-- 用 mask 而不是 <img>：svg 才能吃 currentColor 上色 -->
      <span class="c-header__icon" style="--icon: url('/back-btn.svg')" aria-hidden="true" />
    </button>
    <div class="c-header__logo">
      <img src="/system/logo.webp" alt="佑丞 & 子萱 婚禮留言板" />
    </div>
    <div v-if="$slots.trailing || showHelp" class="c-header__trailing">
      <slot name="trailing">
        <button
          v-if="showHelp"
          type="button"
          class="c-header__help-btn"
          aria-label="說明"
          @click="$emit('help')"
        >
          <span class="c-header__icon" style="--icon: url('/question.svg')" aria-hidden="true" />
        </button>
      </slot>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  showBack?: boolean
  showHelp?: boolean
  transparent?: boolean
  relative?: boolean
}>()

defineEmits(['back', 'help'])
</script>



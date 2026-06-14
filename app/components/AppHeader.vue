<template>
  <header class="c-header" :class="{ 'c-header--transparent': transparent, 'c-header--relative': relative }">
    <button v-if="showBack" class="c-header__back-btn" @click="$emit('back')">
      <img src="/back-btn.svg" alt="返回" />
    </button>
    <div class="c-header__logo">
      <img src="/postBoardLogo.svg" alt="WillMusic Logo" />
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
          <img src="/question.svg" alt="" />
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



<template>
  <div class="p-queue-status-minimal">
    <!-- 與編輯器同一顆 header：白底、精簡 logo -->
    <AppHeader relative />

    <div class="p-queue-status-minimal__container">
      <h1 class="p-queue-status-minimal__title">送出成功</h1>

      <NuxtLink to="/" class="p-queue-status-minimal__btn-home">
        回到首頁
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})
</script>

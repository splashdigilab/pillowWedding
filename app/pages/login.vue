<template>
  <div class="p-login">
    <div class="p-login__card">
      <h1 class="p-login__title">管理後台登入</h1>
      <p class="p-login__subtitle">請輸入帳號與密碼以繼續。</p>

      <form class="p-login__form" @submit.prevent="handleSubmit">
        <label class="p-login__field">
          <span class="p-login__label">帳號</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            class="p-login__input"
            required
          />
        </label>

        <label class="p-login__field">
          <span class="p-login__label">密碼</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="p-login__input"
            required
          />
        </label>

        <p v-if="error" class="p-login__error">{{ error }}</p>

        <button
          type="submit"
          class="p-login__submit"
          :disabled="submitting"
        >
          {{ submitting ? '登入中...' : '登入' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

const route = useRoute()
const router = useRouter()
const { login, loggedIn } = useAdminAuth()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const redirectTo = computed(() => {
  const q = route.query.redirect
  return typeof q === 'string' && q ? q : '/admin'
})

const handleSubmit = async () => {
  error.value = ''
  submitting.value = true
  const ok = await login(username.value.trim(), password.value)
  submitting.value = false
  if (!ok) {
    error.value = '帳號或密碼錯誤'
    return
  }
  await router.replace(redirectTo.value)
}

onMounted(async () => {
  if (loggedIn.value) {
    await router.replace(redirectTo.value)
  }
})
</script>

<style scoped>
.p-login {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  padding: 1.5rem;
  box-sizing: border-box;
}

.p-login__card {
  width: 100%;
  max-width: 420px;
  background: #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  padding: 2.25rem 2rem 2.5rem;
  box-sizing: border-box;
}

.p-login__title {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
  text-align: center;
  color: #333;
}

.p-login__subtitle {
  margin: 0 0 1.5rem;
  text-align: center;
  font-size: 0.9rem;
  color: #666666;
}

.p-login__form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.p-login__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.p-login__label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333333;
}

.p-login__input {
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  border: 1px solid #ddd;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.p-login__input:focus {
  border-color: #000000;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
  background-color: #ffffff;
}

.p-login__error {
  margin: 0;
  font-size: 0.85rem;
  color: #d93025;
}

.p-login__submit {
  margin-top: 0.5rem;
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: none;
  background: #000000;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.p-login__submit:disabled {
  opacity: 0.7;
  cursor: default;
  box-shadow: none;
}

.p-login__submit:not(:disabled):active {
  transform: translateY(1px);
  box-shadow: 0 6px 12px rgba(255, 111, 155, 0.35);
}
</style>


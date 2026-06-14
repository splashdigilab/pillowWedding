import { defineNuxtRouteMiddleware, navigateTo } from '#imports'
import { onAuthStateChanged } from 'firebase/auth'
import { useAdminAuth } from '~/composables/useAdminAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  // Firebase auth plugin 是 client-only，SSR 階段不做登入判斷，避免刷新時被誤導向 /login
  if (process.server) return

  // 只保護特定頁面
  const protectedPaths = ['/qrcode', '/canvas', '/admin']
  if (!protectedPaths.includes(to.path)) return

  const { loggedIn, ensureInitialized } = useAdminAuth()
  ensureInitialized()

  if (loggedIn.value) return

  // 等待一次 Firebase Auth 初始化結果，避免初次載入時 currentUser 還沒就緒
  const nuxtApp = useNuxtApp() as any
  const auth = nuxtApp.$auth

  const user = auth?.currentUser
  if (user) return

  if (!auth) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub()
      if (u) {
        resolve()
      } else {
        resolve()
      }
    })
  })

  if (!auth.currentUser) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  }
})


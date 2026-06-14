import { useState, useNuxtApp } from '#imports'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'

export const useAdminAuth = () => {
  const { $auth } = useNuxtApp() as any

  const authState = useState<{
    initialized: boolean
    user: User | null
  }>('admin-auth-state', () => ({
    initialized: false,
    user: null
  }))

  const ensureInitialized = () => {
    if (authState.value.initialized || !$auth) return
    authState.value.initialized = true
    if (process.client) {
      onAuthStateChanged($auth, (user) => {
        authState.value.user = user
      })
    }
  }

  ensureInitialized()

  const loggedIn = computed(() => !!authState.value.user)

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      await signInWithEmailAndPassword($auth, email, password)
      return true
    } catch (e) {
      console.error('[Auth] signIn failed', e)
      return false
    }
  }

  const logout = async () => {
    try {
      await signOut($auth)
    } catch (e) {
      console.error('[Auth] signOut failed', e)
    }
  }

  return {
    loggedIn,
    login,
    logout,
    ensureInitialized
  }
}



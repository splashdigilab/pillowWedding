import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebase?.apiKey || '',
    authDomain: config.public.firebase?.authDomain || '',
    projectId: config.public.firebase?.projectId || '',
    storageBucket: config.public.firebase?.storageBucket || '',
    messagingSenderId: config.public.firebase?.messagingSenderId || '',
    appId: config.public.firebase?.appId || ''
  }

  // 檢查必要配置
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('[Firebase] 缺少必要配置，請檢查 .env 檔案是否有設定:')
    console.error('  - NUXT_PUBLIC_FIREBASE_API_KEY')
    console.error('  - NUXT_PUBLIC_FIREBASE_PROJECT_ID')
  }

  try {
    const app = initializeApp(firebaseConfig)

    // Use the new way to enable offline persistence in Firebase 10+
    let db;
    if (import.meta.client) {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache(/*settings*/{ tabManager: persistentMultipleTabManager() })
      })
    } else {
      db = getFirestore(app)
    }

    const auth = getAuth(app)
    const storage = getStorage(app)

    return {
      provide: {
        firebase: app,
        firestore: db,
        auth,
        storage
      }
    }
  } catch (error) {
    console.error('[Firebase] 初始化失敗:', error)
    throw error
  }
})

# 佑丞 & 子萱 婚禮留言板

數位互動裝置 - 為婚禮打造的即時便利貼留言板系統

## 📝 專案概述

佑丞 & 子萱 婚禮留言板是一個互動式數位裝置專案，使用者可以透過手機建立數位便利貼，這些便利貼會即時顯示在大型 LED 螢幕上。

## 🛠 技術棧

- **框架**: Nuxt 3 (Vue 3, Composition API, TypeScript)
- **樣式**: SCSS + CSS Variables
- **動畫**: GSAP (GreenSock)
- **資料庫**: Firebase Firestore (Client-side SDK)
- **部署**: AWS Amplify
- **狀態管理**: Pinia

## 🏗 架構說明

### 無後端架構
- 前端直接連接 Firestore Web SDK
- 無需傳統後端 API
- 所有邏輯在客戶端執行

### 客戶端類型
1. **手機端 (Mobile Client)** - `/` 
   - 建立便利貼
   - 查看歷史紀錄
   - Token 驗證

2. **顯示端 (Display Client)** - `/display`
   - LED 螢幕控制器
   - 佇列管理與自動播放
   - 即時顯示便利貼

## 🗄 Firestore 資料結構

### Collections

#### `queue_pending`
待處理佇列，等待顯示的便利貼
```typescript
{
  content: string        // 便利貼內容
  style: {               // 樣式配置
    backgroundColor: string
    textColor: string
    fontSize: number
    pattern?: string
  }
  token: string          // 提交 Token
  timestamp: Timestamp   // 建立時間
  status: "waiting"      // 狀態
}
```

#### `queue_history`
歷史紀錄，已播放的便利貼
```typescript
{
  content: string
  style: {...}
  token: string
  timestamp: Timestamp
  status: "played"
  playedAt: Timestamp    // 播放時間（索引：DESC）
}
```

#### `tokens`
Token 管理系統
```typescript
{
  status: "unused" | "used"
  createdAt: Timestamp
}
```

## 🚀 開始使用

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定 Firebase

複製 `.env.example` 到 `.env`：

```bash
cp .env.example .env
```

編輯 `.env` 並填入你的 Firebase 配置：

```env
NUXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NUXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NUXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Firestore 安全規則

在 Firebase Console 設定以下 Firestore 規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 允許讀取所有 collections
    match /{document=**} {
      allow read: if true;
    }
    
    // queue_pending: 允許建立，顯示端可刪除
    match /queue_pending/{docId} {
      allow create: if true;
      allow delete: if true;
    }
    
    // queue_history: 允許建立
    match /queue_history/{docId} {
      allow create: if true;
    }
    
    // tokens: 允許讀取和更新
    match /tokens/{docId} {
      allow read, update: if true;
      allow create: if true; // 用於建立新 token
    }
  }
}
```

### 4. 建立 Firestore 索引

在 Firebase Console > Firestore > Indexes，建立以下索引：

- Collection: `queue_history`
- Field: `playedAt`
- Order: Descending

### 5. 啟動開發伺服器

```bash
npm run dev
```

伺服器會在 `http://localhost:3000` 啟動

### 6. 訪問頁面

- 手機端：`http://localhost:3000/`
- 顯示端：`http://localhost:3000/display`

## 📱 使用流程

### 手機端操作
1. 選擇便利貼樣式（顏色、花紋）
2. 輸入訊息內容（最多 200 字元）
3. 輸入有效的 Token
4. 提交便利貼
5. 便利貼進入佇列等待顯示
6. 可在「歷史紀錄」tab 查看已播放的便利貼

### 顯示端運作
1. 自動監聽 `queue_pending` 佇列
2. 依序播放便利貼（每個顯示 8 秒）
3. 播放完畢後移至 `queue_history`
4. 顯示下一個佇列項目預覽
5. 即時更新佇列長度和狀態

## 🎨 特色功能

- ✅ 即時同步（Firestore Realtime Listeners）
- ✅ 流暢動畫（GSAP + CSS Transitions）
- ✅ 響應式設計（手機/大螢幕適配）
- ✅ Token 驗證系統（防止濫用）
- ✅ 無限捲動歷史紀錄
- ✅ 自動佇列管理
- ✅ 多種便利貼樣式

## 📦 專案結構

```
app/
├── assets/
│   └── scss/              # SCSS 樣式系統
│       ├── base/          # 基礎樣式、變數
│       ├── components/    # 元件樣式
│       ├── mixins/        # SCSS Mixins
│       └── pages/         # 頁面樣式
├── components/
│   ├── StickyNote.vue     # 便利貼元件
│   └── StylePicker.vue    # 樣式選擇器
├── composables/
│   ├── useFirestore.ts    # Firestore 操作
│   └── useQueue.ts        # 佇列管理
├── pages/
│   ├── index.vue          # 手機端頁面
│   └── display.vue        # 顯示端頁面
├── plugins/
│   ├── firebase.client.ts # Firebase 初始化
│   └── gsap.client.ts     # GSAP 初始化
├── types/
│   └── index.ts           # TypeScript 型別定義
└── app.vue                # 根元件
```

## 🚢 部署到 AWS Amplify

### 1. 建構專案

```bash
npm run build
```

### 2. 在 Amplify Console 設定

1. 連接 Git Repository
2. 設定建構指令：`npm run build`
3. 設定輸出目錄：`.output/public`
4. 新增環境變數（Firebase 配置）
5. 部署

### 3. 環境變數設定

在 Amplify Console 的 Environment Variables 中新增：

```
NUXT_PUBLIC_FIREBASE_API_KEY
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NUXT_PUBLIC_FIREBASE_PROJECT_ID
NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NUXT_PUBLIC_FIREBASE_APP_ID
```

## 🔧 開發建議

### Token 管理
目前需要手動在 Firestore 中建立 tokens。建議建立管理後台或使用 Cloud Functions 自動生成。

### 顯示時長調整
在 `app/pages/display.vue` 中修改 `displayDuration` 變數（單位：毫秒）：

```typescript
const displayDuration = 8000 // 8 秒
```

### 樣式客製化
在 `app/types/index.ts` 中修改 `DEFAULT_STYLES` 陣列，新增或修改便利貼樣式。

## 📄 授權

此專案為私有專案。

## 👨‍💻 維護者

Kevin

---

**Enjoy creating sky memos! 🎵✨**

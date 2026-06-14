# RWD 斷點 Mixin 使用指南

## 📚 目錄
- [基本用法](#基本用法)
- [進階用法](#進階用法)
- [實際範例](#實際範例)
- [所有可用斷點](#所有可用斷點)

---

## 基本用法

### 1. 引入 Mixin

在您的 SCSS 檔案中引入：

```scss
@use '~/assets/scss/mixins' as *;
```

或者在特定檔案中：

```scss
@use '../mixins' as *;
```

---

## 主要 Mixin

### 📱 `respond-to()` - 最大寬度斷點（桌面優先）

適用於從大螢幕向小螢幕調整的設計。

```scss
.element {
  font-size: 18px;
  
  @include respond-to('tablet') {
    font-size: 16px;  // 當螢幕 ≤ 768px
  }
  
  @include respond-to('mobile') {
    font-size: 14px;  // 當螢幕 ≤ 480px
  }
}
```

### 📱 `respond-from()` - 最小寬度斷點（移動優先）

適用於從小螢幕向大螢幕擴展的設計。

```scss
.element {
  font-size: 14px;
  
  @include respond-from('mobile') {
    font-size: 16px;  // 當螢幕 ≥ 481px
  }
  
  @include respond-from('tablet') {
    font-size: 18px;  // 當螢幕 ≥ 769px
  }
}
```

### 📱 `respond-between()` - 範圍斷點

只在特定範圍內套用樣式。

```scss
.element {
  @include respond-between('mobile', 'tablet') {
    // 只在 481px ~ 768px 之間套用
    padding: 20px;
  }
}
```

---

## 進階用法

### 🎯 快捷方式 Mixin

```scss
// 只在手機套用
@include mobile-only {
  .nav { display: none; }
}

// 只在平板套用
@include tablet-only {
  .sidebar { width: 300px; }
}

// 只在桌面套用
@include desktop-only {
  .container { max-width: 1200px; }
}
```

### 📐 自定義斷點

```scss
// 自定義最小寬度
@include custom-breakpoint($min: 900px) {
  .element { width: 80%; }
}

// 自定義最大寬度
@include custom-breakpoint($max: 1100px) {
  .element { width: 90%; }
}

// 自定義範圍
@include custom-breakpoint($min: 600px, $max: 900px) {
  .element { width: 85%; }
}
```

### 🔄 螢幕方向

```scss
// 橫向螢幕
@include landscape {
  .video { width: 100%; }
}

// 直向螢幕
@include portrait {
  .video { height: 100%; }
}
```

### ✨ 高解析度螢幕（Retina）

```scss
.logo {
  background-image: url('logo.png');
  
  @include retina {
    background-image: url('logo@2x.png');
    background-size: 100px 50px;
  }
}
```

### 👆 裝置類型檢測

```scss
// 觸控裝置（手機、平板）
@include touch-device {
  .button {
    min-height: 44px;  // 增加觸控區域
  }
}

// 滑鼠裝置（桌面）
@include mouse-device {
  .button:hover {
    background: #f0f0f0;
  }
}
```

---

## 所有可用斷點

| 斷點名稱 | 寬度 | 適用裝置 |
|---------|------|---------|
| `mobile-sm` | 375px | iPhone SE 等小型手機 |
| `mobile` | 480px | 一般手機 |
| `mobile-lg` | 640px | 大型手機 / 小平板 |
| `tablet` | 768px | iPad 等平板 |
| `tablet-lg` | 1024px | iPad Pro 等大型平板 |
| `desktop` | 1280px | 筆電 / 桌面 |
| `desktop-lg` | 1440px | 大型桌面 |
| `desktop-xl` | 1920px | 超大螢幕 / 4K |

---

## 實際範例

### 範例 1：響應式導航列

```scss
.navbar {
  display: flex;
  justify-content: space-between;
  padding: 20px 40px;
  
  @include respond-to('tablet') {
    padding: 15px 20px;
  }
  
  @include respond-to('mobile') {
    flex-direction: column;
    padding: 10px;
  }
  
  .nav-menu {
    display: flex;
    gap: 30px;
    
    @include mobile-only {
      display: none;
      
      &.active {
        display: flex;
        flex-direction: column;
      }
    }
  }
  
  .hamburger {
    display: none;
    
    @include mobile-only {
      display: block;
    }
  }
}
```

### 範例 2：響應式網格系統

```scss
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 30px;
  
  @include respond-to('desktop') {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  
  @include respond-to('tablet') {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
  
  @include respond-to('mobile') {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
```

### 範例 3：響應式排版

```scss
.typography {
  h1 {
    font-size: 48px;
    line-height: 1.2;
    
    @include respond-to('tablet') {
      font-size: 36px;
    }
    
    @include respond-to('mobile') {
      font-size: 28px;
    }
  }
  
  p {
    font-size: 18px;
    line-height: 1.6;
    
    @include respond-to('mobile') {
      font-size: 16px;
      line-height: 1.5;
    }
  }
}
```

### 範例 4：組合使用

```scss
.hero {
  height: 600px;
  padding: 80px 40px;
  
  // 平板尺寸調整
  @include respond-to('tablet') {
    height: 500px;
    padding: 60px 30px;
  }
  
  // 手機尺寸調整
  @include respond-to('mobile') {
    height: 400px;
    padding: 40px 20px;
  }
  
  // 橫向螢幕特殊處理
  @include landscape {
    @include mobile-only {
      height: 300px;
    }
  }
  
  // 觸控裝置增加按鈕大小
  .cta-button {
    padding: 12px 24px;
    
    @include touch-device {
      padding: 16px 32px;
      min-height: 48px;
    }
  }
}
```

---

## 💡 最佳實踐

1. **優先使用預設斷點**：除非有特殊需求，否則使用預設的斷點名稱
2. **移動優先 vs 桌面優先**：根據項目需求選擇適合的方法
3. **避免過度嵌套**：保持 mixin 嵌套深度在 3 層以內
4. **保持一致性**：團隊內統一使用相同的斷點策略
5. **測試各裝置**：確保在實際裝置上測試響應式效果

---

## 🔧 自定義斷點

如需修改預設斷點，編輯 `_breakpoints.scss`：

```scss
$breakpoints: (
  'mobile': 480px,
  'tablet': 768px,
  'desktop': 1280px,
  // ... 添加或修改
) !default;
```

---

## ❓ 常見問題

### Q: 為什麼 `respond-from()` 會加 1px？
A: 為了避免在斷點邊界重疊。例如 `respond-to('mobile')` 是 ≤480px，`respond-from('mobile')` 是 ≥481px。

### Q: 應該用 `respond-to` 還是 `respond-from`？
A: 看設計方式：
- 桌面優先：用 `respond-to`（由大到小）
- 移動優先：用 `respond-from`（由小到大）

### Q: 如何在現有項目中導入？
A: 
1. 引入 mixin
2. 逐步替換現有的 `@media` 查詢
3. 測試所有斷點


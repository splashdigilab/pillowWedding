# SCSS Mixins 資料夾

這個資料夾包含所有可重用的 SCSS mixins。

## 📁 檔案結構

```
mixins/
├── _index.scss         # Mixins 總入口（統一匯出）
├── _breakpoints.scss   # RWD 斷點 mixins
├── README.md          # 本檔案
└── USAGE.md           # 詳細使用指南
```

## 🚀 快速開始

### 在 SCSS 檔案中引入所有 mixins：

```scss
@use '~/assets/scss/mixins' as *;
```

### 使用 RWD 斷點：

```scss
.element {
  font-size: 18px;
  
  @include respond-to('tablet') {
    font-size: 16px;
  }
  
  @include respond-to('mobile') {
    font-size: 14px;
  }
}
```

## 📚 詳細文檔

請查看 [USAGE.md](./USAGE.md) 獲取完整使用指南和範例。

## 🎯 可用的 Mixins

### 斷點相關 (Breakpoints)
- `respond-to()` - 最大寬度斷點（桌面優先）
- `respond-from()` - 最小寬度斷點（移動優先）
- `respond-between()` - 範圍斷點
- `custom-breakpoint()` - 自定義斷點
- `mobile-only` - 只在手機套用
- `tablet-only` - 只在平板套用
- `desktop-only` - 只在桌面套用
- `landscape` - 橫向螢幕
- `portrait` - 直向螢幕
- `retina` - 高解析度螢幕
- `touch-device` - 觸控裝置
- `mouse-device` - 滑鼠裝置

## 💡 添加新的 Mixin

1. 在 `mixins/` 資料夾創建新的 `_your-mixin.scss` 檔案
2. 在 `_index.scss` 中添加：
   ```scss
   @forward './your-mixin';
   ```
3. 更新此 README 說明新增的 mixin

## 🔧 自定義斷點

編輯 `_breakpoints.scss` 中的 `$breakpoints` 變數來自定義斷點：

```scss
$breakpoints: (
  'mobile': 480px,
  'tablet': 768px,
  'desktop': 1280px,
  // 添加您的自定義斷點...
) !default;
```

## 📖 相關資源

- [SCSS @use 規則](https://sass-lang.com/documentation/at-rules/use)
- [SCSS Mixins](https://sass-lang.com/documentation/at-rules/mixin)
- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries)


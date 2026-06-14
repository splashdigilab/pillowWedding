#!/usr/bin/env python3
"""
批量更新 Vue 頁面的 class 名稱為新的命名規範
"""

import re
import sys

# Editor.vue class 映射
EDITOR_CLASS_MAP = {
    'editor-page': 'p-editor',
    'editor-header': 'p-editor__header',
    'header-btn': 'p-editor__header-btn',
    'header-title': 'p-editor__header-title',
    'canvas-section': 'p-editor__canvas-section',
    'canvas-container': 'p-editor__canvas-container',
    'canvas': 'p-editor__canvas',
    'canvas-text': 'p-editor__canvas-text',
    'character-count': 'p-editor__character-count',
    'sticker': 'p-editor__sticker',
    'sticker-delete': 'p-editor__sticker-delete',
    'control-panel': 'p-editor__control-panel',
    'control-section': 'p-editor__control-section',
    'control-title': 'p-editor__control-title',
    'color-grid': 'p-editor__color-grid',
    'color-btn': 'p-editor__color-btn',
    'color-check': 'p-editor__color-check',
    'slider': 'p-editor__slider',
    'slider-value': 'p-editor__slider-value',
    'sticker-categories': 'p-editor__sticker-categories',
    'category-btn': 'p-editor__category-btn',
    'sticker-grid': 'p-editor__sticker-grid',
    'sticker-btn': 'p-editor__sticker-btn',
    'bottom-actions': 'p-editor__bottom-actions',
    'action-btn': 'p-editor__action-btn',
    'modal-overlay': 'p-editor__modal-overlay',
    'modal-content': 'p-editor__modal-content',
    'modal-icon': 'p-editor__modal-icon',
    'modal-title': 'p-editor__modal-title',
    'modal-message': 'p-editor__modal-message',
    'modal-actions': 'p-editor__modal-actions',
    'preview-modal': 'p-editor__preview-modal',
    'preview-header': 'p-editor__preview-header',
    'preview-content': 'p-editor__preview-content',
    'close-btn': 'p-editor__close-btn',
    'token-section': 'p-editor__token-section',
    'token-label': 'p-editor__token-label',
    'token-input-row': 'p-editor__token-input-row',
    'token-input': 'p-editor__token-input',
    'token-link': 'p-editor__token-link',
    'token-hint': 'p-editor__token-hint',
}

# Admin.vue class 映射
ADMIN_CLASS_MAP = {
    'admin-page': 'p-admin',
    'admin-container': 'p-admin__container',
    'admin-header': 'p-admin__header',
    'admin-title': 'p-admin__title',
    'admin-subtitle': 'p-admin__subtitle',
    'admin-card': 'p-admin__card',
    'card-title': 'p-admin__card-title',
    'stats-grid': 'p-admin__stats-grid',
    'stat-item': 'p-admin__stat-item',
    'stat-value': 'p-admin__stat-value',
    'stat-label': 'p-admin__stat-label',
    'generate-btn': 'p-admin__generate-btn',
    'token-list': 'p-admin__token-list',
    'token-item': 'p-admin__token-item',
    'token-text': 'p-admin__token-text',
    'token-actions': 'p-admin__token-actions',
    'btn-copy': 'p-admin__btn-copy',
    'btn-open-editor': 'p-admin__btn-open-editor',
    'clear-btn': 'p-admin__clear-btn',
    'empty-state': 'p-admin__empty-state',
    'back-btn': 'p-admin__back-btn',
}

# Queue Status.vue class 映射
QUEUE_STATUS_CLASS_MAP = {
    'queue-status-page': 'p-queue-status',
    'queue-status-container': 'p-queue-status__container',
    'queue-status-header': 'p-queue-status__header',
    'queue-status-icon': 'p-queue-status__icon',
    'queue-status-title': 'p-queue-status__title',
    'queue-status-subtitle': 'p-queue-status__subtitle',
    'queue-status-card': 'p-queue-status__card',
    'status-container': 'p-queue-status__status-container',
    'queue-number': 'p-queue-status__queue-number',
    'queue-label': 'p-queue-status__queue-label',
    'estimated-time': 'p-queue-status__estimated-time',
    'time-value': 'p-queue-status__time-value',
    'time-note': 'p-queue-status__time-note',
    'info-box': 'p-queue-status__info-box',
    'info-title': 'p-queue-status__info-title',
    'info-list': 'p-queue-status__info-list',
    'info-item': 'p-queue-status__info-item',
    'display-link': 'p-queue-status__display-link',
    'actions': 'p-queue-status__actions',
    'btn-home': 'p-queue-status__btn-home',
    'btn-new': 'p-queue-status__btn-new',
    'message-box': 'p-queue-status__message-box',
    'message-text': 'p-queue-status__message-text',
    'loading': 'p-queue-status__loading',
    'loading-spinner': 'p-queue-status__loading-spinner',
}

def replace_classes(content, class_map):
    """替換 class 名稱"""
    # 排序：先處理長的 class 名稱，避免部分匹配
    sorted_keys = sorted(class_map.keys(), key=len, reverse=True)
    
    for old_class, new_class in [(k, class_map[k]) for k in sorted_keys]:
        # 替換 class="xxx"
        content = re.sub(
            r'class="([^"]*\b)' + re.escape(old_class) + r'(\b[^"]*)"',
            lambda m: f'class="{m.group(1)}{new_class}{m.group(2)}"',
            content
        )
    
    return content

def remove_style_block(content):
    """移除 style scoped 區塊"""
    # 找到 <style scoped lang="scss"> 到 </style>
    pattern = r'<style scoped lang="scss">.*?</style>'
    replacement = '<style scoped>\n/* 所有樣式已移至對應的 SCSS 檔案 */\n</style>'
    return re.sub(pattern, replacement, content, flags=re.DOTALL)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python update_classes.py <file>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    # 讀取檔案
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 根據檔案名選擇對應的映射
    if 'editor.vue' in filepath:
        content = replace_classes(content, EDITOR_CLASS_MAP)
    elif 'admin.vue' in filepath:
        content = replace_classes(content, ADMIN_CLASS_MAP)
    elif 'queue-status.vue' in filepath:
        content = replace_classes(content, QUEUE_STATUS_CLASS_MAP)
    
    # 移除 style 區塊
    content = remove_style_block(content)
    
    # 寫回檔案
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✅ 已更新: {filepath}")

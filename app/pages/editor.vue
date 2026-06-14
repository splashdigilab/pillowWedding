<template>
  <div class="p-editor">
      <!-- Header -->
      <AppHeader show-back show-help relative @back="goBack" @help="showTutorialModal = true" />

      <!-- 活動介紹滿版 overlay：載入時顯示，loading 完後按「開始」關閉 -->
      <Transition name="intro-fade">
        <div v-if="showIntroOverlay" class="p-index__intro-overlay p-editor__intro-overlay">
          <div class="p-index__intro-card">
            <img src="/svg/stickers/sticker-35.webp" class="p-index__card-sticker p-index__card-sticker--tl" alt="" />
            <img src="/svg/stickers/sticker-41.webp" class="p-index__card-sticker p-index__card-sticker--br" alt="" />
            <img src="/postBoardLogoColumn.svg" alt="WillMusic Logo" class="p-index__intro-logo" />
            <div class="p-index__intro-desc p-index__intro-rules">
              <ol>
                <li>於南西旗艦店消費達 599 元，即可獲得一張數位應援便利貼。</li>
                <li>取得便利貼後，須於 30 分鐘內完成個人專屬內容製作並送出。（禁止任何敏感詞彙或圖像；如有違反，品牌有權不另行通知逕行撤下內容。若多次惡意違規，將依情節嚴重程度採取相應處置。微樂客對違規內容保有最終解釋之權利）</li>
                <li>便利貼內容經審核通過後，將於 LED 牆輪播展示，並輪流放大顯示 15 秒。</li>
              </ol>
              <label class="p-index__intro-terms">
                <input type="checkbox" v-model="termsAccepted" />
                <span>我已閱讀並同意上述活動規範</span>
              </label>
            </div>
            <button
              type="button"
              class="p-index__intro-btn c-btn c-btn--primary"
              :disabled="loading"
              @click="onStartClick"
            >
              <span v-if="loading" class="p-index__intro-btn-inner">
                <span class="p-index__intro-spinner" aria-hidden="true" />
                載入中...
              </span>
              <span v-else>開始</span>
            </button>
          </div>
        </div>
      </Transition>

    <!-- Tutorial Modal -->
    <EditorTutorialModal v-model="showTutorialModal" />

    <AppModal
      v-model="showTermsModal"
      title="提示"
      message="請先閱讀並同意活動規範"
      confirm-text="確定"
      cancel-text=""
      @confirm="showTermsModal = false"
    />

    <!-- Draft Modal -->
    <AppModal
      v-model="showDraftModal"
      icon="📝"
      title="發現草稿"
      message="您有一份未完成的草稿，要繼續編輯還是重新開始？"
      confirmText="使用草稿"
      cancelText="重新開始"
      @confirm="handleDraftDecision(true)"
      @cancel="handleDraftDecision(false)"
    />

    <!-- Exit Confirmation Modal -->
    <AppModal
      v-model="showExitModal"
      title="確定離開？"
      message="目前的進度已經為您自動儲存為草稿。確定要離開編輯器嗎？"
      confirmText="確定離開"
      cancelText="留在本頁"
      @confirm="handleExitConfirm"
      @cancel="showExitModal = false"
    />

    <!-- Alert Modal -->
    <AppModal
      v-model="showAlertModal"
      :icon="alertIcon"
      :title="alertTitle"
      :message="alertMessage"
      :confirmText="alertConfirmText"
      :cancelText="''"
      @confirm="handleAlertConfirm"
    />

    <!-- Submit Confirmation Modal -->
    <AppModal
      v-model="showSubmitModal"
      title="確認上傳"
      message="請確認您的便利貼樣貌，上傳後將無法修改。"
      :loading="isSubmitting"
      @confirm="confirmSubmit"
      @cancel="showSubmitModal = false"
    >
      <template #preview>
        <StickyNote v-if="previewNoteData" :note="previewNoteData" />
      </template>
    </AppModal>

    <!-- Clear All Confirmation Modal -->
    <AppModal
      v-model="showClearAllModal"
      icon="⚠️"
      title="確認清除"
      message="確定要清除畫面上所有的內容嗎？此動作無法復原。"
      confirmText="確定清除"
      cancelText="取消"
      @confirm="confirmClearAll"
      @cancel="showClearAllModal = false"
    />

    <!-- Canvas Area -->
    <div class="p-editor__canvas-section">
      <div
        ref="canvasRef"
        class="p-editor__canvas-container"
        :class="{ 'is-draw-mode': drawMode }"
        @click="deselectAll"
        @mousedown="onCanvasMouseDown"
        @touchstart.capture="onCanvasTouchStart"
        @touchmove.capture="onCanvasTouchMove"
        @touchend.capture="onCanvasTouchEnd"
        @touchcancel.capture="onCanvasTouchEnd"
      >
        <!-- 虛擬縮放層：永遠固定 600px 大小 -->
        <div class="p-editor__canvas-scaler" :style="[scalerStyle, wrapperStyles]">
          <!-- 可裁切層：背景、文字內容、貼紙圖片 -->
          <div class="p-editor__canvas p-editor__canvas--stage" :style="canvasStyle">
            <!-- 文字內容（可裁切）— 多文字區塊 -->
          <div
            v-for="block in textBlocks"
            :key="block.id"
            :data-text-block-id="block.id"
            class="p-editor__text-content"
            :style="[getTextBlockStyleComputed(block), drawMode ? STYLE_POINTER_NONE : STYLE_EMPTY, { zIndex: getObjectZIndex(block.id) }]"
            @click.stop="() => { if (!drawMode) selectTextBlock(block.id) }"
          >
            <!-- 外層包裹器：接收 padding，點擊時觸發拖曳 -->
            <div
              class="p-editor__canvas-text-wrapper"
              :style="getTextStyleForBlock(block)"
              @touchstart="onLockedTextTouchStart(block.id, $event)"
              @touchend="onLockedTextTouchEnd"
              @touchcancel="onLockedTextTouchEnd"
            >
              <div
                :ref="(el: any) => setContentEditableRef(block.id, el)"
                class="p-editor__canvas-text"
                :class="{
                  'is-empty': !block.content.trim() && !(selectedTextBlockId === block.id && isComposing),
                  'is-locked': block.locked
                }"
                :contenteditable="!drawMode"
                @compositionstart="() => { isComposing = true }"
                @compositionend="(e: Event) => handleCompositionEnd(e, block.id)"
                @input="(e: Event) => handleTextInput(e, block.id)"
                @click.stop="() => { if (!drawMode && !block.locked) selectTextBlock(block.id) }"
                @focus="() => { if (!drawMode && !block.locked) selectTextBlock(block.id) }"
                data-placeholder="在這裡輸入文字..."
              />
            </div>
          </div>

          <!-- 貼紙圖片（可裁切）；便利貼/文字 tab 時點擊可進入貼紙編輯 -->
          <div
            v-for="sticker in stickers"
            :key="sticker.id"
            class="p-editor__sticker-content"
            :class="{ 'is-sticker-clickable': !drawMode }"
            :style="[getStickerStyle(sticker), { zIndex: getObjectZIndex(sticker.id) }]"
            @click.stop="selectSticker(sticker.id)"
            @touchstart.stop="() => { if (!isTwoFingerGesture) selectSticker(sticker.id) }"
          >
            <img 
              v-if="getStickerById(sticker.type)?.svgFile"
              :src="getStickerById(sticker.type)?.svgFile"
              :alt="getStickerById(sticker.type)?.id"
              class="p-editor__sticker-img"
            />
          </div>

          <!-- 手繪層 (Fabric.js) -->
          <div
            ref="drawingLayerRef"
            class="p-editor__drawing-layer"
            :class="{ 'is-active': drawMode }"
            :style="{ 
              pointerEvents: drawMode ? 'auto' : 'none',
              zIndex: getObjectZIndex('drawing-layer')
            }"
          >
            <!-- Fabric.js canvas：始終留在 DOM（init 需要），縮小後視覺空白 -->
            <canvas ref="drawingCanvasRef" class="p-editor__drawing-canvas" />
            <!-- 非繪圖模式時，用已儲存的 PNG 靜態預覽蓋住空白的縮小 canvas -->
            <img
              v-if="!drawMode && drawingData"
              :src="drawingData"
              class="p-editor__drawing-preview"
              alt=""
              draggable="false"
            />
          </div>
        </div>

        <!-- UI 層：編輯框置頂，不被裁切（繪圖模式時隱藏以便手繪） -->
        <div class="p-editor__canvas-ui" :style="{ pointerEvents: drawMode ? 'none' : undefined }">
          <!-- 中心對齊參考線 -->
          <div
            v-if="showVerticalCenterGuide"
            class="p-editor__guide-line p-editor__guide-line--vertical"
            aria-hidden="true"
          />
          <div
            v-if="showHorizontalCenterGuide"
            class="p-editor__guide-line p-editor__guide-line--horizontal"
            aria-hidden="true"
          />
          <!-- 文字區塊編輯框：僅在文字 tab 且該區塊被選取時顯示；按完成後消失 -->
          <div
            v-for="block in textBlocks"
            :key="`ui-text-${block.id}`"
            v-show="activeTab === 'text' && selectedTextBlockId === block.id"
            :data-text-block-id="block.id"
            class="p-editor__edit-frame p-editor__edit-frame--text"
            :class="{ 
              'is-selected': selectedTextBlockId === block.id,
              'is-dragging': textBlockDragging && selectedTextBlockId === block.id,
              'is-transforming': textBlockTransforming && selectedTextBlockId === block.id
            }"
            :style="[getTextBlockStyleComputed(block), { zIndex: getObjectZIndex(block.id) }]"
            @mousedown="() => selectTextBlock(block.id)"
            @touchstart="() => { if (!isTwoFingerGesture) selectTextBlock(block.id) }"
          >
            <!-- 隱藏 sizer：與 contenteditable 同字體/padding，讓編輯框寬高與文字一致；空白時用 placeholder 撐開寬度 -->
            <span class="p-editor__edit-frame-sizer" aria-hidden="true" :style="getTextStyleForBlock(block)">{{ (selectedTextBlockId === block.id && composingPreviewText != null) ? (composingPreviewText || '在這裡輸入文字...') : (block.content || '在這裡輸入文字...') }}</span>
            <!-- 刪除按鈕 -->
            <button
              v-if="selectedTextBlockId === block.id"
              class="p-editor__edit-frame-delete"
              @click.stop="removeTextBlock(block.id)"
              @touchstart.stop.prevent="removeTextBlock(block.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 貼紙編輯框：在貼紙 tab，或 default 狀態且有選取貼紙時顯示 -->
          <div
            v-for="sticker in stickers"
            :key="`ui-${sticker.id}`"
            v-show="showStickerEditFrame && selectedStickerId === sticker.id"
            class="p-editor__edit-frame p-editor__edit-frame--sticker"
            :data-sticker-id="sticker.id"
            :class="{ 
              'is-selected': selectedStickerId === sticker.id,
              'is-dragging': draggingStickerId === sticker.id,
              'is-transforming': transformingStickerId === sticker.id
            }"
            :style="[getStickerStyle(sticker), { zIndex: getObjectZIndex(sticker.id) }]"
            @mousedown="onStickerMouseDown($event, sticker)"
            @touchstart="onStickerTouchStart($event, sticker)"
            @click.stop="onStickerClick(sticker.id)"
          >
            <button
              class="p-editor__edit-frame-delete"
              @click.stop="removeSticker(sticker.id)"
              @touchstart.stop.prevent="removeSticker(sticker.id)"
              aria-label="刪除"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <!-- <div
              class="p-editor__edit-frame-transform-handle"
              @mousedown.stop="onTransformHandleMouseDown($event, sticker)"
              @touchstart.stop="onTransformHandleTouchStart($event, sticker)"
            >
              ↻
            </div> -->
          </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 一鍵清除：在 control-panel 外、tab 上方，與 tab 同顯示條件；v-if + transition 才有漸變 -->
    <transition name="p-editor-top-actions">
      <div
        v-if="!drawMode && activeTab !== 'text' && activeTab !== 'note' && activeTab !== 'sticker'"
        class="p-editor__top-actions"
      >
        <button
          type="button"
          class="p-editor__clear-btn"
          @click="handleClearAll"
          aria-label="清除全部"
        >
          <img src="/undo.svg" alt="清除全部" class="p-editor__clear-btn-icon" />
        </button>
      </div>
    </transition>

    <!-- Control Panel -->
    <div class="p-editor__control-panel">
      <!-- Tab Bar（操作文字或繪圖時隱藏；v-if + transition 才會有出現/消失動畫） -->
      <transition name="p-editor-tab-bar">
        <div v-if="!drawMode && activeTab !== 'text' && activeTab !== 'note' && activeTab !== 'sticker'" class="p-editor__tab-bar">
          <button
            v-for="tab in EDITOR_TABS"
            :key="tab.id"
            class="p-editor__tab-btn"
            :class="{ 'is-active': activeTab === tab.id }"
            @click="handleTabClick(tab.id)"
          >
            <img :src="tab.icon" :alt="tab.label" class="p-editor__tab-icon" />
            <span class="p-editor__tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </transition>

      <!-- Tab: 便利貼（v-if 才能觸發 leave 動畫，v-show 只切 display 不會跑 transition） -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'note'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇便利貼材質</h3>
            <div class="p-editor__background-grid">
              <button
                v-for="bg in backgrounds"
                :key="bg.id"
                class="p-editor__background-btn"
                :class="{ 'is-active': backgroundImage === bg.url }"
                @click="backgroundImage = bg.url"
              >
                <img :src="bg.url" :alt="bg.id" loading="lazy" class="p-editor__background-img" />
                <img v-if="backgroundImage === bg.url" src="/check.svg" alt="" class="p-editor__background-check" />
              </button>
            </div>
          </div>
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇便利貼造型</h3>
            <div class="p-editor__shape-grid">
              <button
                v-for="shapeItem in shapes"
                :key="shapeItem.id"
                class="p-editor__shape-btn"
                :class="{ 'is-active': shape === shapeItem.id }"
                :style="{ '--shape-svg': `url(${shapeItem.svg})` }"
                @click="shape = shapeItem.id"
              >
                <span class="p-editor__shape-icon" :aria-label="shapeItem.id" />
                <img v-if="shape === shapeItem.id" src="/check.svg" alt="" class="p-editor__shape-check" />
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Tab: 文字 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'text'" class="p-editor__tab-content">
          <template v-if="selectedBlock">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇文字顏色</h3>
            <div class="p-editor__color-grid">
              <button
                v-for="color in TEXT_COLORS"
                :key="color.value"
                class="p-editor__color-btn"
                :class="{ 'is-active': selectedBlock.color === color.value }"
                :style="{ '--btn-color': color.value }"
                @click="selectedBlock.color = color.value; saveDraftData()"
              >
                <img v-if="selectedBlock.color === color.value" src="/check.svg" alt="" class="p-editor__color-check" />
              </button>
            </div>
          </div>
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">文字對齊</h3>
            <div class="p-editor__align-row">
              <button
                v-for="opt in TEXT_ALIGN_OPTIONS"
                :key="opt.value"
                type="button"
                class="p-editor__align-btn"
                :class="{ 'is-active': selectedBlock.align === opt.value }"
                :aria-label="opt.value === 'left' ? '置左' : opt.value === 'center' ? '置中' : '置右'"
                @click="selectedBlock.align = opt.value; saveDraftData()"
              >
                <img :src="opt.svg" :alt="''" class="p-editor__align-icon" />
              </button>
            </div>
          </div>
          </template>
          <div v-else class="p-editor__control-section">
            <p style="text-align: center; opacity: 0.6;">請先選取一個文字區塊</p>
          </div>
        </div>
      </transition>

      <!-- Tab: 繪圖 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'draw'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇筆刷顏色</h3>
            <div class="p-editor__color-grid">
              <!-- 橡皮擦按鈕（第一個） -->
              <button
                class="p-editor__color-btn p-editor__color-btn--eraser"
                :class="{ 'is-active': eraserMode }"
                @click="eraserMode = true"
              >
                <img src="/erase.svg" alt="橡皮擦" class="p-editor__color-eraser-icon" />
              </button>
              <button
                v-for="c in BRUSH_COLORS"
                :key="c.value"
                class="p-editor__color-btn"
                :class="{ 'is-active': !eraserMode && brushColor === c.value }"
                :style="{ '--btn-color': c.value }"
                @click="() => { brushColor = c.value; eraserMode = false }"
              >
                <img v-if="!eraserMode && brushColor === c.value" src="/check.svg" alt="" class="p-editor__color-check" />
              </button>
            </div>
          </div>
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">調整筆刷大小</h3>
            <input
              v-model.number="brushWidth"
              type="range"
              min="2"
              max="40"
              class="p-editor__brush-slider"
            />
          </div>
        </div>
      </transition>

      <!-- Tab: 貼紙 -->
      <transition name="p-editor-tab">
        <div v-if="activeTab === 'sticker'" class="p-editor__tab-content">
          <div class="p-editor__control-section">
            <h3 class="p-editor__control-title">選擇貼紙</h3>
            <div class="p-editor__sticker-grid">
            <button
              v-for="sticker in STICKER_LIBRARY"
              :key="sticker.id"
              class="p-editor__sticker-btn"
              @click="addSticker(sticker.id)"
            >
              <img 
                v-if="sticker.svgFile"
                :src="sticker.svgFile"
                :alt="sticker.id"
                loading="lazy"
                class="p-editor__sticker-btn-img"
              />
            </button>
          </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Hidden node for high-res export (html-to-image)：只在實際分享時才掛載，避免長時間佔用 GPU 記憶體
         注意：不能使用 visibility:hidden，否則 html-to-image 會輸出透明圖片；改用 off-screen + opacity:0 -->
    <div
      v-if="showExportNode"
      style="position: fixed; left: -9999px; top: -9999px; pointer-events: none; opacity: 0;"
    >
      <div ref="exportNodeRef" style="width: 1080px; height: 1080px; background: transparent; display: flex; justify-content: center; align-items: center;">
        <div style="width: 100%; height: 100%; position: relative;">
          <StickyNote :note="previewNoteData" style="position: absolute; left: 0; top: 0; transform: none; width: 100%; height: 100%;" />
        </div>
      </div>
    </div>

    <!-- Bottom Actions -->
    <div class="p-editor__bottom-actions">
      <!-- 繪圖模式：上一步 / 完成繪圖 / 下一步 -->
      <template v-if="drawMode">
        <button
          type="button"
          class="p-editor__draw-btn p-editor__draw-btn--undo"
          :disabled="!drawCanUndo"
          @click="fabricBrush.undo()"
        >
          <img src="/undo.svg" alt="上一步" class="p-editor__draw-btn-icon" />
        </button>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--complete"
          @click="activeTab = null"
        >
          完成繪圖
        </button>
        <button
          type="button"
          class="p-editor__draw-btn p-editor__draw-btn--redo"
          :disabled="!drawCanRedo"
          @click="fabricBrush.redo()"
        >
          <img src="/undo.svg" alt="下一步" class="p-editor__draw-btn-icon p-editor__draw-btn-icon--redo" />
        </button>
      </template>

      <!-- 文字模式：完成（回到 default，Tab Bar 會再出現） + 鎖定圖層 -->
      <template v-else-if="activeTab === 'text'">
        <div class="p-editor__text-actions">
          <button
            type="button"
            class="p-editor__action-btn p-editor__action-btn--secondary p-editor__action-btn--lock"
            :disabled="!selectedBlock || !selectedBlock.content.trim()"
            @click="toggleLockSelectedTextBlock"
          >
            {{ selectedBlock?.locked ? '解除鎖定' : '鎖定（長按可解鎖）' }}
          </button>
          <button
            type="button"
            class="p-editor__action-btn p-editor__action-btn--primary"
            @click="completeTextEditing"
          >
            完成
          </button>
        </div>
      </template>

      <!-- 便利貼模式：完成（回到 default，Tab Bar 會再出現） -->
      <template v-else-if="activeTab === 'note'">
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full"
          @click="activeTab = null"
        >
          完成
        </button>
      </template>

      <!-- 貼紙模式：完成（回到 default，編輯框消失） -->
      <template v-else-if="activeTab === 'sticker'">
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full"
          @click="completeStickerEditing"
        >
          完成
        </button>
      </template>
      
      <!-- default 狀態：上傳大螢幕（草稿自動儲存） -->
      <template v-else>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--share" 
          :disabled="isSubmitting || isSharing"
          @click="handleShare"
        >
          {{ isSharing ? '處理中...' : '下載 / 分享便利貼' }}
        </button>
        <button
          type="button"
          class="p-editor__action-btn p-editor__action-btn--primary p-editor__action-btn--full" 
          :disabled="isSubmitting || isSharing"
          @click="openSubmitModal"
        >
          上傳大螢幕
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { StickerInstance, DraftData, StickyNoteStyle, TextBlockInstance } from '~/types'
import { getStickerById, STICKER_LIBRARY } from '~/data/stickers'
import { BACKGROUND_IMAGES } from '~/data/backgrounds'
import { STICKY_NOTE_SHAPES, DEFAULT_SHAPE_ID, getShapeById } from '~/data/shapes'
import { EDITOR_TABS, TEXT_ALIGN_OPTIONS, TEXT_COLORS, BRUSH_COLORS, MAX_CONTENT_LENGTH } from '~/data/editor-config'
import { getTextBlockStyle, getStickerStyle } from '~/utils/sticky-note-style'
import { useStickyNoteStyle, type StickyNoteStyleProps } from '~/composables/useStickyNoteStyle'
import { useTextBlockInteraction } from '~/composables/useTextBlockInteraction'
import { useStickerInteraction } from '~/composables/useStickerInteraction'
import { useCanvasPinch } from '~/composables/useCanvasPinch'
import { useStorage } from '~/composables/useStorage'
import { useFirestore } from '~/composables/useFirestore'
import { useFabricBrush } from '~/composables/useFabricBrush'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '#imports'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import StickyNote from '~/components/StickyNote.vue'
import AppModal from '~/components/AppModal.vue'
import EditorTutorialModal from '~/components/EditorTutorialModal.vue'

definePageMeta({ ssr: false })

useHead({
  meta: [
    // interactive-widget=overlays-content：iOS 鍵盤以疊加方式顯示，不壓縮 layout viewport。
    // 核心作用：防止鍵盤彈出 → body 100dvh 縮小 → canvas container 尺寸改變 → ResizeObserver 在
    // 300ms 鍵盤動畫期間觸發 ~18 次 → Vue 重新渲染整個編輯器 → 每次渲染分配虛擬 DOM 記憶體 →
    // 疊加鍵盤本身的 ~100MB → 超出 iOS Safari tab 上限 → 「重複發生問題」崩潰。
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content' }
  ],
  bodyAttrs: { class: 'is-editor-page' }
})

const route = useRoute()
const router = useRouter()
const { $firestore } = useNuxtApp()
const db = $firestore as any
const { saveDraft, loadDraft, clearDraft, saveToken, loadToken, clearToken } = useStorage()

const MAX_TEXT_BLOCKS = 3

// Loading state
const loading = ref(true)
const showIntroOverlay = ref(true)
const termsAccepted = ref(false)
const showTermsModal = ref(false)

const onStartClick = () => {
  if (loading.value) return
  if (!termsAccepted.value) {
    showTermsModal.value = true
    return
  }
  showIntroOverlay.value = false
  
  // 顯示教學或草稿邏輯移至開始之後
  checkInitialModals()
}

// Editor State
const backgroundImage = ref(BACKGROUND_IMAGES?.[0]?.url ?? '') // 預設第一張背景
const shape = ref(DEFAULT_SHAPE_ID)
const stickers = ref<StickerInstance[]>([])
const selectedStickerId = ref<string | null>(null)
const draggingStickerId = ref<string | null>(null)

// 多文字區塊
const textBlocks = ref<TextBlockInstance[]>([])
const selectedTextBlockId = ref<string | null>(null)
const textBlockDragging = ref(false)
const textBlockTransforming = ref(false)

// 每個物件（文字區塊 / 貼紙）各自疊放順序：點選時 bringToFront，完成後該物件維持最頂層
const objectZOrder = ref<Record<string, number>>({})
let zOrderCounter = 0
const getObjectZIndex = (id: string) => objectZOrder.value[id] ?? 1
const bringToFront = (id: string) => {
  zOrderCounter += 1
  objectZOrder.value = { ...objectZOrder.value, [id]: zOrderCounter }
}

// 文字編輯時的原始內容快照（用於取消還原）
const textBlockInitialContents = new Map<string, string>()
// 這次文字編輯流程中新建立的文字區塊（用於判斷取消時要刪除還是還原）
const newTextBlockIds = new Set<string>()

const snapshotTextBlockInitial = (blockId: string) => {
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) {
    textBlockInitialContents.set(blockId, block.content)
  }
}

const hasCurrentTextEdits = () => {
  const id = selectedTextBlockId.value
  if (!id) return false
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return false
  const initial = textBlockInitialContents.get(id) ?? ''
  return block.content !== initial
}

// 文字模式「完成」：移除空白文字區塊，結束文字編輯流程；保留選取使該區塊維持最上層
const completeTextEditing = () => {
  // 若 IME 組字中按完成，先提交組字內容
  commitComposingContent()

  // 將內容為空（或只含空白）的文字區塊 in-place 刪除（避免整個陣列替換觸發全量 v-for diff）
  for (let i = textBlocks.value.length - 1; i >= 0; i--) {
    const b = textBlocks.value[i]
    if (b && !b.content.trim()) {
      textBlocks.value.splice(i, 1)
    }
  }

  textBlockInitialContents.clear()
  newTextBlockIds.clear()
  if (selectedTextBlockId.value && !textBlocks.value.some(b => b.id === selectedTextBlockId.value)) {
    selectedTextBlockId.value = null
  }
  activeTab.value = null

  // 延遲到下一個 event loop：讓 Vue 先完成 DOM 更新，再做 JSON.stringify + localStorage 重 I/O，
  // 避免同步 JSON.stringify 大型 drawingData（500KB+ base64）與 DOM 更新搶 CPU 造成 OOM
  setTimeout(saveDraftData, 0)
}

const completeStickerEditing = () => {
  selectedStickerId.value = null
  activeTab.value = null
}

// 計算屬性：當前選取的文字區塊
const selectedBlock = computed(() => {
  if (!selectedTextBlockId.value) return null
  return textBlocks.value.find(b => b.id === selectedTextBlockId.value) ?? null
})

// contenteditable ref map
const contentEditableRefs = new Map<string, HTMLDivElement | null>()
const setContentEditableRef = (blockId: string, el: HTMLDivElement | null) => {
  if (el) {
    contentEditableRefs.set(blockId, el)
  } else {
    contentEditableRefs.delete(blockId)
  }
}

const canvasRef = ref<HTMLElement | null>(null)
const drawingLayerRef = ref<HTMLElement | null>(null)
const drawingCanvasRef = ref<HTMLCanvasElement | null>(null)

// IG 風格中心對齊參考線
const showVerticalCenterGuide = ref(false)
const showHorizontalCenterGuide = ref(false)

// Tab: 便利貼 | 文字 | 繪圖 | 貼紙
const activeTab = ref<'note' | 'text' | 'draw' | 'sticker' | null>(null)

// 文字編輯模式：有選取文字區塊時
const isTextEditMode = computed(() => selectedTextBlockId.value !== null)

const transformingStickerId = ref<string | null>(null)
const showDraftModal = ref(false)
const showTutorialModal = ref(false)
const showExitModal = ref(false)
const showSubmitModal = ref(false)

const showAlertModal = ref(false)
const alertIcon = ref('⚠️')
const alertTitle = ref('提示')
const alertMessage = ref('')
const alertConfirmText = ref('關閉')
const alertConfirmHandler = ref<(() => void | Promise<void>) | null>(null)

const handleAlertConfirm = async () => {
  const handler = alertConfirmHandler.value
  if (handler) {
    await handler()
    return
  }
  showAlertModal.value = false
}

const showAlert = (
  msg: string,
  title = '提示',
  icon = '⚠️',
  options?: {
    confirmText?: string
    onConfirm?: () => void | Promise<void>
  }
) => {
  alertIcon.value = icon
  alertTitle.value = title
  alertMessage.value = msg
  alertConfirmText.value = options?.confirmText || '關閉'
  alertConfirmHandler.value = options?.onConfirm || null
  showAlertModal.value = true
}

// Token 相關提示：標題、內文與 icon
const TOKEN_ALERT_TITLE = '只差最後一步！'
const TOKEN_ALERT_ICON = '🛍️'
const TOKEN_ALERT_MESSAGE = '目前您還沒有取得大螢幕的上傳權限。<br>請放心，剛剛的作品已經保存在您的手機裡了！<br>只要在店內消費，結帳時掃描店員提供的 QR Code，系統就會自動幫您一鍵發送上牆喔！'
const GPS_DENIED_MESSAGE = '需要開啟定位權限才能上傳大螢幕。<br><br>iPhone（Safari）：到「設定 > Safari > 定位」改為「允許」。<br>Android（Chrome）：到「瀏覽器網址列左側鎖頭/網站設定 > 位置」改為「允許」。<br><br>完成後回到此頁，點擊「重新詢問定位」再試一次。'
const GPS_OUTSIDE_MESSAGE = '您目前不在合法上傳區域內，請移動到店內指定範圍後再試。'
/** 設為 false 時略過上傳前 GPS／地理柵欄驗證 */
const ENABLE_GPS_VALIDATION = false
const TOKEN_DISABLED_SUBMIT_COOLDOWN_MS = 3 * 60 * 1000
const TOKEN_DISABLED_LAST_SUBMIT_AT_KEY = 'willmusic_token_disabled_last_submit_at'
const tokenRequiredForSubmit = ref(false)
let unsubTokenRequirement: (() => void) | null = null

const getTokenDisabledRemainingCooldownMs = (): number => {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(TOKEN_DISABLED_LAST_SUBMIT_AT_KEY)
    const lastSubmitAt = Number(raw)
    if (!Number.isFinite(lastSubmitAt) || lastSubmitAt <= 0) return 0
    const elapsed = Date.now() - lastSubmitAt
    return Math.max(0, TOKEN_DISABLED_SUBMIT_COOLDOWN_MS - elapsed)
  } catch {
    return 0
  }
}

const formatCooldownRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds} 秒`
  if (seconds <= 0) return `${minutes} 分鐘`
  return `${minutes} 分 ${seconds} 秒`
}

const saveTokenDisabledSubmitTimestamp = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TOKEN_DISABLED_LAST_SUBMIT_AT_KEY, String(Date.now()))
  } catch {
    // ignore storage write errors
  }
}

const isSharing = ref(false)
const showExportNode = ref(false)  // 控制 1080px export node 的掛載時機
const exportNodeRef = ref<HTMLElement | null>(null)

// 手繪筆刷
const drawMode = ref(false)
const drawCanUndo = ref(false)
const drawCanRedo = ref(false)
const brushColor = ref('#ffffff')
const brushWidth = ref(8)
const eraserMode = ref(false)
const drawingData = ref<string | null>(null)
// 資料來源
const backgrounds = BACKGROUND_IMAGES
const shapes = STICKY_NOTE_SHAPES

// 是否顯示貼紙編輯框：有選取貼紙 且 非便利貼/繪圖狀態（便利貼或繪圖 tab 時編輯框消失）
const showStickerEditFrame = computed(() => {
  return !!selectedStickerId.value && activeTab.value !== 'note' && activeTab.value !== 'draw'
})

// Sticker Management

// ── 繪圖存檔防抖
// 每筆畫完成 (path:created) 後 exportToDataURL 會產生大型 PNG 字串，
// 加上 JSON.stringify 存到 localStorage 會短暫分配 1–2MB。
// 防抖 1.5s 確保快速畫多筆時只存一次，顯著降低 iOS Safari 的 GC 壓力。
let drawSaveTimer: ReturnType<typeof setTimeout> | null = null

// 僅在有實際筆畫時更新 drawingData；saveImmediately=true 時略過防抖（離開繪圖模式時使用）
const syncDrawingDataFromFabric = (saveImmediately = false) => {
  if (!fabricBrush.canUndo()) {
    // 當前沒有任何筆畫：保留既有的 drawingData（例如使用者先前的繪圖），
    // 清空動作交給「一鍵清除」等顯式操作，避免誤將完成的畫作設為 null。
    return
  }
  const data = fabricBrush.exportToDataURL()
  if (data && data !== drawingData.value) {
    drawingData.value = data
    if (saveImmediately) {
      if (drawSaveTimer) { clearTimeout(drawSaveTimer); drawSaveTimer = null }
      saveDraftData()
    } else {
      if (drawSaveTimer) clearTimeout(drawSaveTimer)
      drawSaveTimer = setTimeout(() => {
        drawSaveTimer = null
        saveDraftData()
      }, 1500)
    }
  }
}

const fabricBrush = useFabricBrush(() => {
  syncDrawingDataFromFabric()
})
// 切換 tab 時同步繪圖模式與文字選取狀態
watch(activeTab, (tab) => {
  // 繪圖：進入/退出繪圖模式
  if (tab === 'draw') {
    drawMode.value = true
    // 恢復畫布尺寸（從 1×1 最小化還原為 600×600，重新分配 GPU backing store）
    fabricBrush.restoreCanvas()
    fabricBrush.setDrawingMode(true)
    bringToFront('drawing-layer')
  } else {
    if (drawMode.value) {
      // 離開繪圖模式：立即存檔（saveImmediately=true），不用防抖，避免資料遺失
      syncDrawingDataFromFabric(true)
      fabricBrush.setDrawingMode(false)
      // 最小化畫布：釋放 ~1.4MB GPU backing store，降低文字編輯時的記憶體壓力
      fabricBrush.minimizeCanvas()
      // 使用者剛離開繪圖模式（例如按下完成），清除所有物件選取，確保沒有殘留的編輯框
      selectedTextBlockId.value = null
      selectedStickerId.value = null
    }
    drawMode.value = false
  }
  // 文字：切到其他 tab（便利貼/繪圖/貼紙）時才取消文字選取；按「完成」時 tab 為 null，保留選取讓文字維持最上層
  if (tab !== 'text') {
    if (tab != null) {
      selectedTextBlockId.value = null
    }
    nextTick(() => {
      contentEditableRefs.forEach(el => el?.blur())
    })
  }
}, { immediate: true })

watch(brushColor, (c) => {
  fabricBrush.setBrushColor(c)
}, { immediate: false })

watch(brushWidth, (w) => {
  fabricBrush.setBrushWidth(w)
  fabricBrush.setEraserWidth(w)
}, { immediate: false })

watch(eraserMode, (toEraser) => {
  fabricBrush.setEraserMode(toEraser)
}, { immediate: false })

watch(drawMode, (v) => {
  if (v) {
    contentEditableRefs.forEach(el => el?.blur())
    if (fabricBrush.isInitialized()) {
      fabricBrush.setOnUndoRedoChange(() => {
        drawCanUndo.value = fabricBrush.canUndo()
        drawCanRedo.value = fabricBrush.canRedo()
        syncDrawingDataFromFabric()
      })
      drawCanUndo.value = fabricBrush.canUndo()
      drawCanRedo.value = fabricBrush.canRedo()
    }
  }
})

const noteStyleProps = computed<StickyNoteStyleProps>(() => ({
  shape: shape.value || DEFAULT_SHAPE_ID,
  textColor: '#ffffff', // 預設白色，各文字區塊有各自的顏色
  textAlign: 'center',
  backgroundImage: backgroundImage.value
}))

const { wrapperStyles, innerStyles: canvasStyle } = useStickyNoteStyle(noteStyleProps)

// 畫面是否有內容（文字 / 貼紙 / 繪圖任一存在，或背景/形狀已被更改）
const hasAnyContent = computed(() =>
  textBlocks.value.some(b => b.content.trim()) ||
  stickers.value.length > 0 ||
  !!drawingData.value ||
  backgroundImage.value !== (BACKGROUND_IMAGES?.[0]?.url ?? '') ||
  shape.value !== DEFAULT_SHAPE_ID
)

// 快取靜態 style 物件：避免每次 render 都建立新物件，降低 GC 壓力
const STYLE_POINTER_NONE = Object.freeze({ pointerEvents: 'none' as const })
const STYLE_EMPTY = Object.freeze({})

// 文字區塊位置/大小樣式（接受 TextBlockInstance）
const getTextBlockStyleComputed = (block: TextBlockInstance) => ({
  ...getTextBlockStyle(block.x, block.y, block.scale, block.rotation),
  textAlign: block.align
})

// 文字區塊文字樣式（顏色與對齊：針對單一文字物件）
const getTextStyleForBlock = (block: TextBlockInstance) => ({
  ...wrapperStyles.value,
  color: block.color,
  textAlign: block.align,
  '--text-color': block.color,
})


// 文字 scale 上下限（與 useCanvasPinch 一致）
const TEXT_SCALE_MIN = 1
const TEXT_SCALE_MAX = 5

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** 當輸入導致文字框超出畫布時：縮小 scale 並調整位置，使整個框留在邊界內 */
const clampSelectedTextBlockToCanvas = () => {
  const id = selectedTextBlockId.value
  const el = canvasRef.value
  if (!id || !el) return
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return
  const frameEl = el.querySelector(
    `.p-editor__edit-frame--text[data-text-block-id="${id}"]`
  ) as HTMLElement | null
  if (!frameEl) return
  const rect = el.getBoundingClientRect()
  const fr = frameEl.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const halfWidthPct = (fr.width / rect.width) * 50
  const halfHeightPct = (fr.height / rect.height) * 50
  const eps = 1e-6
  const maxScaleX = halfWidthPct > eps ? (50 * block.scale) / halfWidthPct : TEXT_SCALE_MAX
  const maxScaleY = halfHeightPct > eps ? (50 * block.scale) / halfHeightPct : TEXT_SCALE_MAX
  const maxScale = Math.min(maxScaleX, maxScaleY, TEXT_SCALE_MAX)
  const oldScale = block.scale
  if (block.scale > maxScale) {
    block.scale = clamp(maxScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX)
  }
  const newHalfW = halfWidthPct * (block.scale / oldScale)
  const newHalfH = halfHeightPct * (block.scale / oldScale)
  block.x = clamp(block.x, newHalfW, 100 - newHalfW)
  block.y = clamp(block.y, newHalfH, 100 - newHalfH)
}

// ── IME 狀態追蹤（韓文/日文/中文輸入法）
const isComposing = ref(false)
// 組字中的即時文字：僅供 sizer 使用，不觸發 textBlocks 深層反應鏈
const composingPreviewText = ref<string | null>(null)

// ── RAF-throttled clamp：合併同一幀內多次呼叫為一次，避免重複 getBoundingClientRect 引發回流
let _clampRafId: number | null = null
const scheduleClamp = () => {
  if (_clampRafId !== null) return
  _clampRafId = requestAnimationFrame(() => {
    _clampRafId = null
    clampSelectedTextBlockToCanvas()
  })
}

// 清理 IME 組字狀態並將 contenteditable 中的最終文字寫入 block.content
const commitComposingContent = () => {
  if (selectedTextBlockId.value) {
    const el = contentEditableRefs.get(selectedTextBlockId.value)
    if (el) {
      const text = el.innerText.slice(0, MAX_CONTENT_LENGTH)
      const block = textBlocks.value.find(b => b.id === selectedTextBlockId.value)
      if (block && block.content !== text) block.content = text
    }
  }
  isComposing.value = false
  composingPreviewText.value = null
}

// Methods
const handleTextInput = (e: Event, blockId: string) => {
  const target = e.target as HTMLElement
  const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)

  if (isComposing.value || (e as InputEvent).isComposing) {
    // IME 組字中：僅更新輕量 composingPreviewText（只驅動 sizer 寬度），
    // 不碰 block.content → 不觸發 hasAnyContent / previewNoteData 等重型 computed
    composingPreviewText.value = text
    scheduleClamp()
    return
  }

  composingPreviewText.value = null
  const block = textBlocks.value.find(b => b.id === blockId)
  if (block) block.content = text
  if (target.innerText.length > MAX_CONTENT_LENGTH) {
    target.innerText = text
    placeCaretAtEnd(target)
  }
  scheduleClamp()
}

const handleCompositionEnd = (e: Event, blockId: string) => {
  // 保持 isComposing=true 直到 block.content 提交完成，避免 placeholder 閃現
  nextTick(() => {
    const target = e.target as HTMLElement
    const text = target.innerText.slice(0, MAX_CONTENT_LENGTH)
    const block = textBlocks.value.find(b => b.id === blockId)
    if (block) block.content = text
    isComposing.value = false
    composingPreviewText.value = null
    if (target.innerText.length > MAX_CONTENT_LENGTH) {
      target.innerText = text
      placeCaretAtEnd(target)
    }
    scheduleClamp()
  })
}

const placeCaretAtEnd = (el: HTMLElement) => {
  const range = document.createRange()
  const sel = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** 將游標放到指定座標位置（模擬手機點擊移動游標） */
const placeCaretAtPoint = (el: HTMLElement, clientX: number, clientY: number) => {
  let range: Range | null = null

  // Chrome / Safari / Edge
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY)
  }
  // Firefox
  else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(clientX, clientY)
    if (pos) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
      range.collapse(true)
    }
  }

  if (range) {
    // 確保 range 在目標 contenteditable 元素內
    if (el.contains(range.startContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
  }

  // fallback：無法定位時放到最後
  placeCaretAtEnd(el)
}

const syncContentToDom = () => {
  nextTick(() => {
    textBlocks.value.forEach(block => {
      const el = contentEditableRefs.get(block.id)
      if (el) {
        el.innerText = block.content
      }
    })
  })
}

// 文字區塊管理
const addTextBlock = (): TextBlockInstance => {
  const newBlock: TextBlockInstance = {
    id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    content: '',
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 2,
    rotation: 0,
    color: '#ffffff',
    align: 'center',
    locked: false
  }
  textBlocks.value.push(newBlock)
  snapshotTextBlockInitial(newBlock.id)
  newTextBlockIds.add(newBlock.id)
  saveDraftData()
  return newBlock
}

const removeTextBlock = (blockId: string) => {
  // Debug：確認事件有沒有進來、目前有幾個文字區塊
  // eslint-disable-next-line no-console
  console.log('[Editor] removeTextBlock clicked', { blockId, textBlocksCount: textBlocks.value.length })

  textBlocks.value = textBlocks.value.filter(b => b.id !== blockId)
  textBlockInitialContents.delete(blockId)
  newTextBlockIds.delete(blockId)
  if (selectedTextBlockId.value === blockId) {
    selectedTextBlockId.value = null
    // 刪除目前選取的文字區塊後，回到「無 tab 被選取」的預設狀態
    activeTab.value = null
  }
  saveDraftData()
}

// Tab 點擊處理：文字 tab 自動新增文字區塊
const handleTabClick = (tabId: string) => {
  if (tabId === 'text') {
    if (textBlocks.value.length < MAX_TEXT_BLOCKS) {
      const newBlock = addTextBlock()
      selectedTextBlockId.value = newBlock.id
      selectedStickerId.value = null
      bringToFront(newBlock.id)
      activeTab.value = 'text'
      nextTick(() => {
        const el = contentEditableRefs.get(newBlock.id)
        if (el) {
          el.focus()
          placeCaretAtEnd(el)
        }
      })
    } else {
      // 已經到達上限：改為直接選取最後一組文字區塊，不再顯示提示
      const lastBlock = textBlocks.value[textBlocks.value.length - 1]
      if (lastBlock) {
        snapshotTextBlockInitial(lastBlock.id)
        newTextBlockIds.delete(lastBlock.id)
        selectedTextBlockId.value = lastBlock.id
        selectedStickerId.value = null
        bringToFront(lastBlock.id)
        activeTab.value = 'text'
        nextTick(() => {
          const el = contentEditableRefs.get(lastBlock.id)
          if (el) {
            el.focus()
            placeCaretAtEnd(el)
          }
        })
      }
    }
  } else {
    activeTab.value = tabId as any
  }
}

// 文字模式「取消」：新增未輸入時 = 刪除；編輯時 = 還原到編輯前內容
const cancelTextEditing = () => {
  // 清除任何進行中的 IME 狀態
  isComposing.value = false
  composingPreviewText.value = null

  const id = selectedTextBlockId.value
  if (!id) {
    activeTab.value = null
    return
  }
  const block = textBlocks.value.find(b => b.id === id)
  const initial = textBlockInitialContents.get(id) ?? ''
  const isNew = newTextBlockIds.has(id)

  if (block && isNew) {
    removeTextBlock(id)
    activeTab.value = null
    return
  }

  if (block) {
    block.content = initial
    syncContentToDom()
    setTimeout(saveDraftData, 0)
  }

  textBlockInitialContents.delete(id)
  selectedTextBlockId.value = null
  activeTab.value = null
}

const MAX_STICKERS = 10

const addSticker = (stickerType: string) => {
  if (stickers.value.length >= MAX_STICKERS) {
    showAlert(
      `每張便利貼最多只能貼 ${MAX_STICKERS} 個貼紙喔！如果需要更多空間，可以先刪除一些。`,
      '貼紙數量達上限',
      '⚠️'
    )
    return
  }

  const newSticker: StickerInstance = {
    id: `sticker-${Date.now()}`,
    type: stickerType,
    x: 50 + (Math.random() - 0.5) * 20,
    y: 50 + (Math.random() - 0.5) * 20,
    scale: 3,
    rotation: (Math.random() - 0.5) * 30
  }
  stickers.value.push(newSticker)
  saveDraftData()
  // 選取新貼紙並切到貼紙 tab，讓編輯框出現
  selectedStickerId.value = newSticker.id
  selectedTextBlockId.value = null
  bringToFront(newSticker.id)
  activeTab.value = 'sticker'
}

const selectSticker = (id: string) => {
  // 若正在文字編輯模式，先提交 IME 並自動完成之前的編輯
  if (activeTab.value === 'text' && selectedTextBlockId.value) {
    commitComposingContent()
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }
  // 如果正在便利貼模式（選擇材質/形狀），點擊貼紙時回到 default tab（null）
  if (activeTab.value === 'note') {
    activeTab.value = null
  }
  
  selectedStickerId.value = id
  selectedTextBlockId.value = null
  bringToFront(id)
}

const selectTextBlock = (blockId: string) => {
  const isCurrentlyEditing = selectedTextBlockId.value === blockId && activeTab.value === 'text'

  activeTab.value = 'text'

  if (isCurrentlyEditing) {
    bringToFront(blockId)
    // 已經在文字模式下再次點擊同一個文字區塊：確保重新聚焦並叫出鍵盤
    focusSelectedTextBlock()
    return
  }

  // 切換到另一組文字時，先提交舊區塊的 IME 組字並自動完成/取消編輯
  if (selectedTextBlockId.value && selectedTextBlockId.value !== blockId) {
    commitComposingContent()
    if (hasCurrentTextEdits()) {
      completeTextEditing()
    } else {
      cancelTextEditing()
    }
  }
  
  snapshotTextBlockInitial(blockId)
  selectedTextBlockId.value = blockId
  selectedStickerId.value = null
  bringToFront(blockId)
  
  nextTick(() => {
    const el = contentEditableRefs.get(blockId)
    if (el) {
      el.focus()
      placeCaretAtEnd(el)
    }
  })
}

const focusSelectedTextBlock = () => {
  const id = selectedTextBlockId.value
  if (!id) return
  nextTick(() => {
    const el = contentEditableRefs.get(id)
    if (el) {
      el.focus()
      placeCaretAtEnd(el)
    }
  })
}

const toggleLockSelectedTextBlock = () => {
  const id = selectedTextBlockId.value
  if (!id) return
  const block = textBlocks.value.find(b => b.id === id)
  if (!block) return
  block.locked = !block.locked
  // 鎖定時回到 default 模式並清除選取與編輯狀態；解鎖則僅改狀態，需長按重新選取才能編輯
  if (block.locked) {
    activeTab.value = null
    selectedTextBlockId.value = null
    textBlockDragging.value = false
    textBlockTransforming.value = false
    // 清除所有文字框的 focus，避免仍可輸入文字
    contentEditableRefs.forEach(el => el?.blur())
  }
  saveDraftData()
}

let lockedLongPressTimer: ReturnType<typeof setTimeout> | null = null

const onLockedTextTouchStart = (blockId: string, e: TouchEvent) => {
  const block = textBlocks.value.find(b => b.id === blockId)
  if (!block?.locked) return

  if (e.cancelable) e.preventDefault()
  e.stopPropagation()

  if (lockedLongPressTimer) {
    clearTimeout(lockedLongPressTimer)
    lockedLongPressTimer = null
  }

  lockedLongPressTimer = setTimeout(() => {
    lockedLongPressTimer = null
    const target = textBlocks.value.find(b => b.id === blockId)
    if (!target) return
    target.locked = false
    selectTextBlock(blockId)
  }, 600)
}

const onLockedTextTouchEnd = () => {
  if (lockedLongPressTimer) {
    clearTimeout(lockedLongPressTimer)
    lockedLongPressTimer = null
  }
}


const deselectAll = () => {
  if (lastCanvasDragEndAt.value && Date.now() - lastCanvasDragEndAt.value < 400) return
  if (selectedTextBlockId.value) commitComposingContent()
  selectedStickerId.value = null
  selectedTextBlockId.value = null
}

// saveDraftData 需在 composable 之前定義（作為 callback）
const saveDraftData = () => {
  // 如果沒有任何有效內容（文字、貼紙、繪圖皆為空，且背景/形狀皆為預設值），不存草稿
  const hasContent =
    textBlocks.value.some(b => b.content.trim()) ||
    stickers.value.length > 0 ||
    !!drawingData.value ||
    backgroundImage.value !== (BACKGROUND_IMAGES?.[0]?.url ?? '') ||
    shape.value !== DEFAULT_SHAPE_ID
  if (!hasContent) return

  // 僅儲存有內容的文字區塊（空白內容的區塊不存入草稿）
  const nonEmptyTextBlocks = textBlocks.value.filter(b => b.content.trim())

  const draft: DraftData = {
    content: nonEmptyTextBlocks.map(b => b.content).join('\n'),
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: nonEmptyTextBlocks[0]?.color ?? '#ffffff',
    textAlign: nonEmptyTextBlocks[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: nonEmptyTextBlocks[0] ? { x: nonEmptyTextBlocks[0].x, y: nonEmptyTextBlocks[0].y, scale: nonEmptyTextBlocks[0].scale, rotation: nonEmptyTextBlocks[0].rotation } : undefined,
    textBlocks: nonEmptyTextBlocks,
    drawing: drawingData.value ?? undefined,
    objectLayerOrder: { ...objectZOrder.value },
    timestamp: Date.now()
  }
  saveDraft(draft)
}

const {
  onTextBlockTransformMouseDown,
  onTextBlockTransformTouchStart
} = useTextBlockInteraction({
  canvasRef,
  textBlocks,
  selectedTextBlockId,
  textBlockDragging,
  textBlockTransforming,
  selectTextBlock,
  onDragEnd: saveDraftData,
  onTransformEnd: saveDraftData
})

const {
  onCanvasTouchStart,
  onCanvasTouchMove,
  onCanvasTouchEnd,
  onCanvasMouseDown,
  lastCanvasDragEndAt,
  isTwoFingerGesture
} = useCanvasPinch({
  canvasRef,
  drawMode,
  selectedTextBlockId,
  selectedStickerId,
  textBlocks,
  stickers,
  textBlockDragging,
  textBlockTransforming,
  draggingStickerId,
  transformingStickerId,
  onTextTransformEnd: () => {
    focusSelectedTextBlock()
    saveDraftData()
  },
  onStickerTransformEnd: saveDraftData,
  onTextDragEnd: () => {
    focusSelectedTextBlock()
    saveDraftData()
  },
  onStickerDragEnd: saveDraftData,
  onTextTap: (blockId: string, clientX: number, clientY: number) => {
    const alreadySelected = selectedTextBlockId.value === blockId
    selectTextBlock(blockId)
    if (!alreadySelected) {
      // 切換到新的文字區塊：游標放到最後（selectTextBlock 內部已處理）
    }
    // 已選取的文字區塊：不做任何操作，瀏覽器已在 touchstart 自然定位游標
  },
  onTextDragStart: (blockId: string) => selectTextBlock(blockId),
  showVerticalCenterGuide,
  showHorizontalCenterGuide
})

const {
  onStickerMouseDown,
  onStickerTouchStart,
  onStickerClick,
  onTransformHandleMouseDown,
  onTransformHandleTouchStart
} = useStickerInteraction({
  canvasRef,
  stickers,
  selectedStickerId,
  draggingStickerId,
  transformingStickerId,
  selectSticker,
  onDragEnd: saveDraftData,
  onTransformEnd: saveDraftData,
  isTwoFingerGesture
})

const removeSticker = (id: string) => {
  stickers.value = stickers.value.filter(s => s.id !== id)
  selectedStickerId.value = null
  saveDraftData()
}

const loadDraftData = async (draft: DraftData) => {
  backgroundImage.value = draft.backgroundImage
  shape.value = draft.shape
  stickers.value = draft.stickers
  drawingData.value = draft.drawing ?? null

  // 多文字區塊：優先使用 textBlocks，否則從舊格式轉換
  if (draft.textBlocks && draft.textBlocks.length > 0) {
    textBlocks.value = draft.textBlocks
  } else if (draft.content) {
    // 向下相容：舊格式只有一個文字區塊
    const t = draft.textTransform
    textBlocks.value = [{
      id: `text-legacy-${Date.now()}`,
      content: draft.content,
      x: t?.x ?? 50,
      y: t?.y ?? 50,
      scale: t?.scale ?? 2,
      rotation: t?.rotation ?? 0,
      color: draft.textColor ?? '#ffffff',
      align: draft.textAlign ?? 'center'
    }]
  } else {
    textBlocks.value = []
  }

  await nextTick()
  syncContentToDom()
  if (draft.drawing) {
    await nextTick()
    fabricBrush.loadFromDataURL(draft.drawing)
  }
  // 還原物件前後順序：與編輯時一致；保證唯一 z 且強制更新視圖
  const textIds = textBlocks.value.map(b => b.id)
  const stickerIds = stickers.value.map(s => s.id)
  const allIds = new Set([...textIds, ...stickerIds])
  const orderFromDraft = draft.objectLayerOrder && Object.keys(draft.objectLayerOrder).length > 0
    ? { ...draft.objectLayerOrder }
    : null

  if (orderFromDraft) {
    const restored: Record<string, number> = {}
    for (const id of allIds) {
      const v = orderFromDraft[id]
      const n = typeof v === 'number' && !Number.isNaN(v) ? v : Number(v)
      if (!Number.isNaN(n)) restored[id] = n
    }
    if (Object.keys(restored).length > 0) {
      const textOrders = textIds.map(id => restored[id]).filter((n): n is number => n != null)
      const stickerOrders = stickerIds.map(id => restored[id]).filter((n): n is number => n != null)
      const legacyWrongOrder =
        textOrders.length > 0 &&
        stickerOrders.length > 0 &&
        Math.max(...textOrders) < Math.min(...stickerOrders)
      if (legacyWrongOrder) {
        const maxOrder = Math.max(...Object.values(restored))
        textIds.forEach(id => {
          if (restored[id] != null) restored[id] = (restored[id] as number) + maxOrder + 1
        })
      }
      for (const id of allIds) {
        if (restored[id] == null) {
          const maxVal = Math.max(0, ...Object.values(restored))
          restored[id] = maxVal + 1
        }
      }
      // 依數值升序重排為 1,2,3,…（同值時依 id 穩定排序），保證唯一且還原疊放
      const sorted = Object.entries(restored).sort(
        ([idA, a], [idB, b]) => (a !== b ? a - b : idA.localeCompare(idB))
      )
      const normalized: Record<string, number> = {}
      sorted.forEach(([id], i) => { normalized[id] = i + 1 })
      objectZOrder.value = { ...normalized }
      zOrderCounter = sorted.length
      await nextTick()
    } else {
      applyDefaultLayerOrder(textIds, stickerIds)
    }
  } else {
    applyDefaultLayerOrder(textIds, stickerIds)
  }
}

function applyDefaultLayerOrder(textIds: string[], stickerIds: string[]) {
  const ids = [...stickerIds, ...textIds]
  const next: Record<string, number> = {}
  ids.forEach((id, i) => { next[id] = i + 1 })
  objectZOrder.value = next
  zOrderCounter = ids.length
}

const resetEditorToInitial = () => {
  backgroundImage.value = BACKGROUND_IMAGES?.[0]?.url ?? ''
  shape.value = DEFAULT_SHAPE_ID
  stickers.value = []
  textBlocks.value = []
  selectedTextBlockId.value = null
  selectedStickerId.value = null
  activeTab.value = null
  drawingData.value = null
  objectZOrder.value = {}
  zOrderCounter = 0
  fabricBrush.clear()
  syncContentToDom()
}

const showClearAllModal = ref(false)

const handleClearAll = () => {
  if (!hasAnyContent.value) return
  showClearAllModal.value = true
}

const confirmClearAll = () => {
  resetEditorToInitial()
  clearDraft()
  showClearAllModal.value = false
}

const handleDraftDecision = async (useDraft: boolean) => {
  if (useDraft) {
    showDraftModal.value = false
    const draft = loadDraft()
    if (draft) {
      await nextTick()
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      await loadDraftData(draft)
    }
  } else {
    resetEditorToInitial()
    clearDraft()
    showDraftModal.value = false
  }
}

const isSubmitting = ref(false)

const openSubmitModal = () => {
  const hasContent = textBlocks.value.some(b => b.content.trim())
  if (!hasContent) {
    showAlert('請輸入文字內容')
    return
  }

  if (!tokenRequiredForSubmit.value) {
    const remainingCooldownMs = getTokenDisabledRemainingCooldownMs()
    if (remainingCooldownMs > 0) {
      showAlert(
        `每次上傳後需等待 3 分鐘。請於 ${formatCooldownRemaining(remainingCooldownMs)} 後再試。`,
        '上傳冷卻中',
        '⏱️'
      )
      return
    }
  }
  
  const token = loadToken()
  if (tokenRequiredForSubmit.value && !token) {
    showAlert(TOKEN_ALERT_MESSAGE, TOKEN_ALERT_TITLE, TOKEN_ALERT_ICON)
    return
  }

  showSubmitModal.value = true
}

const previewNoteData = computed(() => {
  const style: StickyNoteStyle = {
    backgroundImage: backgroundImage.value,
    shape: shape.value,
    textColor: textBlocks.value[0]?.color ?? '#ffffff',
    textAlign: textBlocks.value[0]?.align ?? 'center',
    stickers: stickers.value,
    textTransform: textBlocks.value[0] ? { x: textBlocks.value[0].x, y: textBlocks.value[0].y, scale: textBlocks.value[0].scale, rotation: textBlocks.value[0].rotation } : undefined,
    textBlocks: textBlocks.value,
    objectLayerOrder: { ...objectZOrder.value }
  }
  if (drawingData.value) style.drawing = drawingData.value

  return {
    id: 'preview',
    content: textBlocks.value.map(b => b.content).join('\n').trim(),
    style: style,
    timestamp: Date.now(),
    status: 'waiting'
  } as any
})

const toRadians = (deg: number) => deg * (Math.PI / 180)

const calculateDistanceMeters = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  const earthRadiusMeters = 6371000
  const dLat = toRadians(toLat - fromLat)
  const dLng = toRadians(toLng - fromLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusMeters * c
}

type GeoErrorKind =
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'geolocation-unavailable'
  | 'geo-fence-fetch-failed'
  | 'geo-fence-config-invalid'
  | 'unknown'

type GeoError = Error & { kind?: GeoErrorKind; code?: number; cause?: unknown }

const createGeoError = (kind: GeoErrorKind, message: string, cause?: unknown): GeoError => {
  const error = new Error(message) as GeoError
  error.kind = kind
  error.cause = cause
  return error
}

const mapGeoErrorFromAny = (error: any): GeoError => {
  if (!error) return createGeoError('unknown', 'Unknown geolocation error')
  if (error.kind) return error as GeoError

  const code = Number(error?.code)
  if (code === 1) return createGeoError('permission-denied', 'Geolocation permission denied', error)
  if (code === 2) return createGeoError('position-unavailable', 'Geolocation position unavailable', error)
  if (code === 3) return createGeoError('timeout', 'Geolocation timeout', error)
  return createGeoError('unknown', error?.message || 'Unknown geolocation error', error)
}

const getCurrentPositionWithOptions = (options: PositionOptions): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(createGeoError('geolocation-unavailable', 'Geolocation API not available'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve(position),
      error => reject(mapGeoErrorFromAny(error)),
      options
    )
  })

const getCurrentPosition = (): Promise<GeolocationPosition> =>
  getCurrentPositionWithOptions({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  }).catch(async (error: any) => {
    const normalized = mapGeoErrorFromAny(error)
    // 手機在室內或節電模式下容易 high accuracy timeout；改用低精度 + 允許快取位置再嘗試一次。
    if (normalized.kind === 'position-unavailable' || normalized.kind === 'timeout') {
      return await getCurrentPositionWithOptions({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000
      })
    }
    throw normalized
  })

const requestGpsPermissionAgain = async () => {
  try {
    await getCurrentPosition()
    showAlertModal.value = false
    openSubmitModal()
  } catch (error: any) {
    const geoError = mapGeoErrorFromAny(error)
    if (geoError.kind === 'permission-denied') {
      showAlert(
        GPS_DENIED_MESSAGE,
        '需要定位權限',
        '📍',
        {
          confirmText: '重新詢問定位',
          onConfirm: requestGpsPermissionAgain
        }
      )
      return
    }
    if (
      geoError.kind === 'position-unavailable' ||
      geoError.kind === 'timeout' ||
      geoError.kind === 'geolocation-unavailable'
    ) {
      showAlert('無法取得目前位置，請確認定位服務已開啟並稍後再試。', '定位失敗', '📍')
      return
    }
    showAlert('定位驗證失敗，請稍後再試。', '定位失敗', '📍')
  }
}

const validateGeoFenceBeforeSubmit = async (): Promise<boolean> => {
  if (!ENABLE_GPS_VALIDATION) return true

  let geoFenceSnap
  try {
    geoFenceSnap = await getDoc(doc(db, 'system', 'editor_geo_fence'))
  } catch (error: any) {
    throw createGeoError('geo-fence-fetch-failed', error?.message || 'Failed to load geo fence config', error)
  }
  if (!geoFenceSnap.exists()) return true

  const data = geoFenceSnap.data() as {
    enabled?: boolean
    latitude?: number
    longitude?: number
    radiusMeters?: number
  }

  if (!data.enabled) return true

  const centerLat = Number(data.latitude)
  const centerLng = Number(data.longitude)
  const radiusMeters = Number(data.radiusMeters)
  const configValid =
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng) &&
    Number.isFinite(radiusMeters) &&
    radiusMeters > 0

  // 後台配置不完整時不擋使用者，避免手機端誤判為「定位驗證失敗」。
  if (!configValid) return true

  const position = await getCurrentPosition()
  const userLat = position.coords.latitude
  const userLng = position.coords.longitude
  const distance = calculateDistanceMeters(userLat, userLng, centerLat, centerLng)

  return distance <= radiusMeters
}

const confirmSubmit = async () => {
  if (isSubmitting.value) return

  if (!tokenRequiredForSubmit.value) {
    const remainingCooldownMs = getTokenDisabledRemainingCooldownMs()
    if (remainingCooldownMs > 0) {
      showSubmitModal.value = false
      showAlert(
        `每次上傳後需等待 3 分鐘。請於 ${formatCooldownRemaining(remainingCooldownMs)} 後再試。`,
        '上傳冷卻中',
        '⏱️'
      )
      return
    }
  }

  const tokenForSubmit = tokenRequiredForSubmit.value ? (loadToken() || undefined) : undefined
  if (tokenRequiredForSubmit.value && !tokenForSubmit) {
    showAlert(TOKEN_ALERT_MESSAGE, TOKEN_ALERT_TITLE, TOKEN_ALERT_ICON)
    return
  }

  isSubmitting.value = true

  try {
    const { createNote, checkTokenStatus } = useFirestore()

    // GPS 合法區域檢查：若後台開啟限制，必須位於指定半徑內才能送出
    let isWithinAllowedArea = false
    try {
      isWithinAllowedArea = await validateGeoFenceBeforeSubmit()
    } catch (geoError: any) {
      const normalizedGeoError = mapGeoErrorFromAny(geoError)
      showSubmitModal.value = false
      if (normalizedGeoError.kind === 'permission-denied') {
        showAlert(
          GPS_DENIED_MESSAGE,
          '需要定位權限',
          '📍',
          {
            confirmText: '重新詢問定位',
            onConfirm: requestGpsPermissionAgain
          }
        )
      } else if (
        normalizedGeoError.kind === 'position-unavailable' ||
        normalizedGeoError.kind === 'timeout' ||
        normalizedGeoError.kind === 'geolocation-unavailable'
      ) {
        showAlert('無法取得目前位置，請確認定位服務已開啟並稍後再試。', '定位失敗', '📍')
      } else if (normalizedGeoError.kind === 'geo-fence-fetch-failed') {
        showAlert('目前無法驗證定位（網路或服務暫時異常），請稍後再試。', '定位失敗', '📍')
      } else {
        showAlert('定位驗證失敗，請稍後再試。', '定位失敗', '📍')
      }
      isSubmitting.value = false
      return
    }

    if (!isWithinAllowedArea) {
      showSubmitModal.value = false
      showAlert(GPS_OUTSIDE_MESSAGE, '不在合法區域', '📍')
      isSubmitting.value = false
      return
    }

    // 1. 若啟用 token 驗證，先透過 checkTokenStatus 取得詳細錯誤原因
    const status = tokenRequiredForSubmit.value
      ? await checkTokenStatus(tokenForSubmit as string).catch(() => 'unknown')
      : 'valid'
    
    // 中介檢查：OpenAI Moderation API 擋下不好的文字
    const allText = previewNoteData.value.content;
    if (allText.trim()) {
      try {
        const modRes: any = await $fetch('/api/moderation', {
          method: 'POST',
          body: { text: allText }
        });
        
        if (modRes.flagged) {
          showSubmitModal.value = false;
          showAlert('您的文字包含不妥適的內容，為維護良好環境，請修改後再試一次！', '內容安全檢查未通過', '🚫');
          isSubmitting.value = false;
          return;
        }
      } catch (err) {
        console.warn('Moderation check failed or bypassed, proceeding...', err);
      }
    }

    if (status === 'expired') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經超過 30 分鐘的有效期限囉！請向店員重新索取新的 QR Code。', 
        '時間到了！', 
        '⏳'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'used') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 已經被使用過囉！如果還想再傳一張，請向店員重新索取新的 QR Code。', 
        '已經用過囉！', 
        '❌'
      )
      isSubmitting.value = false
      return
    }

    if (status === 'invalid') {
      showSubmitModal.value = false
      showAlert(
        '這個 QR Code 無效或不存在，請確認您掃描的是由店員提供的正確條碼。', 
        '無效代碼', 
        '❓'
      )
      isSubmitting.value = false
      return
    }

    // 2. 狀態正確(valid)或無法判別時，嘗試正式送出
    await createNote(
      { content: previewNoteData.value.content, style: previewNoteData.value.style },
      tokenForSubmit
    )

    // 上傳成功：清除草稿與快取的 Token
    clearDraft()
    if (!tokenRequiredForSubmit.value) {
      saveTokenDisabledSubmitTimestamp()
    }
    if (tokenRequiredForSubmit.value && tokenForSubmit) {
      clearToken() // 將 SessionStorage 中的 Token 刪除
    }
    
    // 如果網址上有 Token，把網址也清乾淨，避免重新整理再次讀取
    const query = { ...route.query }
    if (tokenRequiredForSubmit.value && query.token) {
      delete query.token
      // 使用 replace 避免在歷史紀錄中留存帶有 token 的網址
      await router.replace({ query })
    }

    showSubmitModal.value = false
    router.push('/queue-status')
  } catch (e: any) {
    showSubmitModal.value = false // 關閉「確認上傳」的 Modal，讓錯誤提示能正常顯示在最上層
    console.error('提交失敗:', e)
    
    // 如果因為 Firebase Rules 阻擋讀取 token 而拋錯，退回到這裡用泛用的錯誤提示
    if (
      tokenRequiredForSubmit.value &&
      (e?.code === 'permission-denied' || e?.message?.includes('Missing or insufficient permissions'))
    ) {
      showAlert(
        '您的專屬 QR Code 可能已失效 (超過限時 30 分鐘) 或已經被使用過。請向店員重新索取新的 QR Code！', 
        '上傳授權失效', 
        '⏳'
      )
    } else {
      showAlert(`提交失敗：${e?.message || '請稍後再試'}`)
    }
  } finally {
    isSubmitting.value = false
  }
}

import { toPng } from 'html-to-image'

// ── 字型嵌入輔助 ──────────────────────────────────────────────────────────────
// html-to-image 若使用 skipFonts:true 不嵌入字型，輸出圖會掉回系統字體（手機最明顯）。
// 透過 fontEmbedCSS 選項自行把字型轉成 base64 傳入，可同時解決：
//   1. 自架字型（JasonHandwriting2）在 off-screen export node 可能載不到
//   2. Google Fonts 跨網域 cssRules 讀取拋出 SecurityError
const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const buildFontEmbedCSS = async (): Promise<string> => {
  const parts: string[] = []

  // 1. 自架字型：JasonHandwriting2（同 origin，直接 fetch 沒有 CORS 問題）
  try {
    const res = await fetch('/JasonHandwriting2-SemiBold.woff2')
    if (res.ok) {
      const base64 = await blobToDataURL(await res.blob())
      parts.push(`@font-face{font-family:'JasonHandwriting2';src:url('${base64}') format('woff2');font-weight:normal;font-style:normal;}`)
    }
  } catch (e) {
    console.warn('[FontEmbed] JasonHandwriting2 失敗:', e)
  }

  // 2. Google Fonts：Nanum Pen Script
  // fetch() 可以跨網域讀取回應內容（不同於 cssRules 的 CORS 限制），
  // 取得 CSS text 後，再把 CSS 內每個 url() 字型檔也一一下載並轉 base64。
  try {
    const cssRes = await fetch(
      'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap',
      { headers: { 'User-Agent': navigator.userAgent } }
    )
    if (cssRes.ok) {
      let cssText = await cssRes.text()
      const urlRegex = /url\(([^)]+)\)/g
      const matches = [...cssText.matchAll(urlRegex)]
      await Promise.all(
        matches.map(async (m) => {
          const rawUrl = (m[1] ?? '').replace(/['"]/g, '')
          try {
            const fontRes = await fetch(rawUrl)
            if (fontRes.ok) {
              const base64 = await blobToDataURL(await fontRes.blob())
              cssText = cssText.replace(m[0], `url(${base64})`)
            }
          } catch (e2) {
            console.warn('[FontEmbed] 字型檔下載失敗:', rawUrl, e2)
          }
        })
      )
      parts.push(cssText)
    }
  } catch (e) {
    console.warn('[FontEmbed] Nanum Pen Script 失敗:', e)
  }

  return parts.join('\n')
}
// ─────────────────────────────────────────────────────────────────────────────

const handleShare = async () => {
  if (isSharing.value) return
  isSharing.value = true

  try {
    // 1. 掛載 export node（只在此時才建立，避免長期佔用 GPU 記憶體）
    showExportNode.value = true
    await nextTick()
    // 讓瀏覽器完成 layout 與 paint（雙 RAF 確保 CSS mask 與背景圖都已渲染）
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    if (!exportNodeRef.value) throw new Error('Export node not ready')

    // 2. 強制預載背景圖片，確保瀏覽器快取中已經具備該圖，防止 html-to-image 抓不到
    const bgUrl = previewNoteData.value?.style?.backgroundImage
    if (bgUrl) {
      await new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = resolve
        img.onerror = resolve
        img.src = bgUrl
      })
    }

    // 3. 強制載入 export node 內所有圖片
    // StickyNote 的 <img> 帶有 loading="lazy" + decoding="async"，
    // 在畫面外（-9999px）不會自動載入；必須改成 eager/sync 才能讓 html-to-image 截到完整內容。
    const exportImgs = Array.from(exportNodeRef.value.querySelectorAll('img'))
    for (const img of exportImgs) {
      img.loading = 'eager'
      img.decoding = 'sync'
      // 若圖片尚未開始載入（src 存在但 naturalWidth=0），重設 src 觸發載入
      if (!img.complete || img.naturalWidth === 0) {
        const src = img.src
        img.src = ''
        img.src = src
      }
    }
    // 等待所有圖片完成載入（含 base64 drawing 與 SVG 貼紙）
    await Promise.all(
      exportImgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      })
    )

    // 4. 預先嵌入字型（自架 + Google Fonts 一起轉 base64）
    // 不依賴 html-to-image 自動讀取 cssRules（跨網域會 SecurityError），改由我們主動提供。
    const fontEmbedCSS = await buildFontEmbedCSS()

    // 4b. 注入紙張材質 base64 style 到 export node
    // ::after 偽元素的 background-image 若為相對 URL，html-to-image 在 off-screen 截圖時找不到；
    // 改為先 fetch 成 base64，再用 <style> 標籤直接覆寫 CSS，確保紙紋被完整輸出。
    let injectedTextureStyle: HTMLStyleElement | null = null
    try {
      const textureRes = await fetch('/paperTexture.webp')
      if (textureRes.ok) {
        const textureBase64 = await blobToDataURL(await textureRes.blob())
        injectedTextureStyle = document.createElement('style')
        injectedTextureStyle.textContent = `
          .c-sticky-note__inner::after {
            background-image: url('${textureBase64}') !important;
          }
        `
        exportNodeRef.value.appendChild(injectedTextureStyle)
      }
    } catch (e) {
      console.warn('[Export] 紙張材質嵌入失敗:', e)
    }

    // 5. 針對 iOS 的預熱 Hack (Warm-up)
    // 使用低解析度預熱，強迫 html-to-image 綁定資源，但節省記憶體（pixelRatio: 0.5）
    await toPng(exportNodeRef.value, { cacheBust: true, fontEmbedCSS, pixelRatio: 0.5 }).catch(() => {})

    // 給予渲染緩衝時間
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // 6. 正式輸出（pixelRatio 1.5：相較 2x 節省約 44% 記憶體，畫質在手機上仍充足）
    // fontEmbedCSS 已由 buildFontEmbedCSS() 建好，html-to-image 不需自行讀取跨網域 CSS。
    const dataUrl = await toPng(exportNodeRef.value, {
      pixelRatio: 1.5,
      cacheBust: true,
      fontEmbedCSS
    })

    // 移除注入的 texture style（export node 即將卸載，這步可省略，但保持乾淨）
    injectedTextureStyle?.remove()

    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'willmusic-note.png', { type: 'image/png' })

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'WillMusic 便利貼',
        text: '這是我剛畫好的便利貼！',
        files: [file]
      })
    } else {
      const link = document.createElement('a')
      link.download = 'willmusic-note.png'
      link.href = dataUrl
      link.click()
    }
  } catch (error: any) {
    // 使用者在系統分享面板按「取消」時，navigator.share 會丟 AbortError，不需要跳錯誤提示
    const name = error?.name || ''
    const message = error?.message || ''
    const isAbort =
      name === 'AbortError' ||
      message.includes('AbortError') ||
      message.includes('The user aborted') ||
      message.includes('canceled') ||
      message.includes('cancelled')

    if (isAbort) {
      console.warn('使用者取消分享/下載動作:', error)
    } else {
      console.error('分享失敗:', error)
      showAlert('圖片生成失敗，請稍後再試')
    }
  } finally {
    isSharing.value = false
    // 分享完成後立即卸載 export node，釋放 GPU 記憶體
    showExportNode.value = false
  }
}

const goBack = () => {
  const hasContent = textBlocks.value.some(b => b.content.trim())
  if (hasContent || stickers.value.length > 0) {
    showExitModal.value = true
  } else {
    router.push('/')
  }
}

const handleExitConfirm = () => {
  saveDraftData()
  showExitModal.value = false
  router.push('/')
}

// Lifecycle
// initFabricBrush 改為 async：Fabric.js 動態載入，await init 後再設定筆刷參數
const initFabricBrush = async () => {
  if (typeof window === 'undefined' || !canvasRef.value || !drawingCanvasRef.value || !drawingLayerRef.value) return
  await fabricBrush.init(drawingCanvasRef.value, 600, 600)
  fabricBrush.setOnUndoRedoChange(() => {
    drawCanUndo.value = fabricBrush.canUndo()
    drawCanRedo.value = fabricBrush.canRedo()
    syncDrawingDataFromFabric()
  })
  fabricBrush.setBrushColor(brushColor.value)
  fabricBrush.setBrushWidth(brushWidth.value)
  fabricBrush.setEraserWidth(brushWidth.value)
  fabricBrush.setEraserMode(eraserMode.value)
  fabricBrush.setDrawingMode(drawMode.value)
  if (drawingData.value) {
    await fabricBrush.loadFromDataURL(drawingData.value)
  }
  drawCanUndo.value = fabricBrush.canUndo()
  drawCanRedo.value = fabricBrush.canRedo()
}

const scalerStyle = ref({ transform: 'scale(1)' })
const VIRTUAL_SIZE = 600
let resizeObserver: ResizeObserver | null = null

const checkInitialModals = async () => {
  await nextTick()
  // 檢查草稿（僅顯示 modal，不預先載入內容；等使用者選擇「使用草稿」才載入）
  const existingDraft = loadDraft()
  if (existingDraft) {
    showDraftModal.value = true
  } else {
    // 沒有草稿時，檢查是否看過教學
    const hasSeen = localStorage.getItem('hasSeenWillMusicTutorial')
    if (!hasSeen) {
      showTutorialModal.value = true
    }
  }
  
  // 初始化 Fabric 手繪
  initFabricBrush()
}

onMounted(async () => {
  // 在背景預載 Fabric.js（不 await，讓它在使用者閱讀規範的期間下載完畢）
  if (import.meta.client) {
    import('fabric').catch(() => {})
  }

  // waitForImages：加入 3 秒超時保護，防止 iOS 上部分圖片永遠不觸發 load/error 導致卡死
  const waitForImages = async () => {
    await nextTick()
    const images = Array.from(document.images)
    const timeout = new Promise<void>(resolve => setTimeout(resolve, 3000))
    const allLoaded = Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      })
    )
    await Promise.race([allLoaded, timeout])
  }

  const windowLoaded = new Promise<void>(resolve => {
    if (document.readyState === 'complete') {
      resolve()
    } else {
      window.addEventListener('load', () => resolve(), { once: true })
    }
  })

  // 等待字體載入與最小延遲（加入 5 秒整體超時，防止字體 API 掛住）
  try {
    const fontsReady = Promise.race([
      document.fonts.ready,
      new Promise<void>(resolve => setTimeout(resolve, 5000))
    ])
    await Promise.all([
      fontsReady,
      windowLoaded,
      waitForImages(),
      new Promise(resolve => setTimeout(resolve, 800))
    ])
  } catch (e) {
    console.warn('Font loading error', e)
  }
  loading.value = false

  await nextTick()

  // 處理 Token
  const tokenFromQuery = route.query.token as string
  if (tokenFromQuery) {
    saveToken(tokenFromQuery)
  }

  // Token 驗證預設關閉；若後台有設定，則即時跟隨後台開關。
  unsubTokenRequirement = onSnapshot(doc(db, 'system', 'editor_token_requirement'), (snap) => {
    if (!snap.exists()) {
      tokenRequiredForSubmit.value = false
      return
    }
    const data = snap.data() as { enabled?: boolean }
    tokenRequiredForSubmit.value = data.enabled === true
  })

  // Scale observer（加防抖：即使 interactive-widget=overlays-content 未生效的舊 iOS，
  // 也能限制鍵盤動畫期間最多每 150ms 觸發一次 Vue re-render，避免記憶體暴衝）
  if (canvasRef.value) {
    let resizeRafId: number | null = null
    resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry || entry.contentRect.width <= 0) return
      const newWidth = entry.contentRect.width
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId)
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null
        const scale = newWidth / VIRTUAL_SIZE
        if (scalerStyle.value.transform !== `scale(${scale})`) {
          scalerStyle.value = { transform: `scale(${scale})` }
        }
      })
    })
    resizeObserver.observe(canvasRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  if (_clampRafId !== null) { cancelAnimationFrame(_clampRafId); _clampRafId = null }
  if (drawSaveTimer) { clearTimeout(drawSaveTimer); drawSaveTimer = null; saveDraftData() }
  unsubTokenRequirement?.()
  unsubTokenRequirement = null
  fabricBrush.dispose()
})

// Auto-save on changes
watch([backgroundImage, shape], () => {
  saveDraftData()
})
</script>
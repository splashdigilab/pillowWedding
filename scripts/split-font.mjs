/**
 * 把 ChenYuluoyan（4.6MB、10137 字的全字集手寫字型）切成一堆小分包。
 *
 * 為什麼要切：便利貼烘圖是靠 html-to-image 把 DOM 包成 SVG foreignObject 再畫進 canvas，
 * 而 SVG 裡的字型只能用 data URI 內嵌（SVG 當成 <img> 載入時無法向外抓任何資源）。
 * 整支字型內嵌後 base64 會變成 6.4MB，URL-encode 進 data URI 是 6.8MB——桌機扛得住，
 * 手機的 WebKit/Chromium 解不動這麼大的 SVG，<img> 會「載入成功但畫不出東西」，
 * 於是 drawImage 畫出一張全透明的圖，牆上就出現空白便利貼。
 *
 * 切包之後烘圖只需內嵌「這張便利貼真正用到的字」所在的分包（實測 45 字約 320KB），
 * 大小掉到二十分之一。詳見 app/composables/useNoteImage.ts 的 buildFontEmbedCSS。
 *
 * 用法：node scripts/split-font.mjs
 * 產物（需一起 commit）：public/fonts/chenyuluoyan/*.woff2 + manifest.json
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'public/ChenYuluoyan-2.0-Thin.woff2')
const OUT_DIR = join(root, 'public/fonts/chenyuluoyan')

/**
 * 分包大小（bytes）。這支字型平均每個字約 475 bytes，12KB 一包 ≈ 25 字。
 * 包越小，烘圖時被順便拖下來的無用字就越少；代價是檔案數與請求數變多。
 */
const CHUNK_SIZE = 12000

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

execFileSync(
  'npx',
  [
    'cn-font-split', 'run',
    '-i', SOURCE,
    '-o', OUT_DIR,
    '-c', String(CHUNK_SIZE),
    '-m', '1500',
    '--css.fontFamily', 'ChenYuluoyan',
    '--testHtml', 'false',
    '-r', 'false'
  ],
  { stdio: 'inherit', cwd: root }
)

// 只留 woff2；cn-font-split 的 CSS／proto／預覽檔改由下面的 manifest 取代
const css = readFileSync(join(OUT_DIR, 'result.css'), 'utf8')
for (const f of readdirSync(OUT_DIR)) {
  if (!f.endsWith('.woff2')) rmSync(join(OUT_DIR, f), { recursive: true, force: true })
}

/**
 * manifest：每個分包一筆 `["檔名", "4e00-4e05,4e2d"]`（unicode-range 的十六進位縮寫）。
 * 用字串而不是巢狀陣列，是因為這份 manifest 每次烘圖都要抓一次，格式越省越好。
 */
const chunks = []
for (const face of css.matchAll(/@font-face\{(.*?)\}/gs)) {
  const file = face[1].match(/url\("\.\/([^"]+)"\)/)?.[1]
  const range = face[1].match(/unicode-range:([^;]+)/)?.[1]
  if (!file || !range) continue

  chunks.push([file.replace('.woff2', ''), range.replace(/U\+/gi, '').replace(/\s/g, '').toLowerCase()])
}

writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(chunks))

const bytes = readdirSync(OUT_DIR).reduce((sum, f) => sum + statSync(join(OUT_DIR, f)).size, 0)
console.log(`✓ ${chunks.length} 個分包，共 ${(bytes / 1e6).toFixed(1)} MB → public/fonts/chenyuluoyan/`)

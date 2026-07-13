/**
 * 產生素材縮圖
 *
 * 原始素材（public/sticker、public/bg）是給「烘圖」用的高解析度來源，
 * 但編輯器的選單格子只有幾十 px，直接吃原圖等於把 1400px 的點陣圖解壓進記憶體。
 * 這支腳本產出兩套縮小版本，來源檔完全不動：
 *
 *   public/sticker-512/  貼紙貼到便利貼上時用（烘出的圖最大 1080px，貼紙頂多佔 260px）
 *   public/sticker-128/  貼紙選單格子用
 *   public/bg-128/       背景選單格子用
 *
 * 用法：node scripts/generate-assets.mjs
 */
import sharp from 'sharp'
import { readdir, mkdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'

const PUBLIC = 'public'

/** 去背素材必須保留 alpha，alphaQuality 拉滿避免邊緣出現半透明雜訊 */
const WEBP = { quality: 85, alphaQuality: 100, effort: 6 }

let srcBytes = 0
let outBytes = 0

async function convert(src, dest, size) {
  const buf = await sharp(src)
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .webp(WEBP)
    .toBuffer()
  await sharp(buf).toFile(dest)

  const meta = await sharp(buf).metadata()
  if (!meta.hasAlpha) throw new Error(`${basename(src)} 轉檔後遺失透明度`)

  srcBytes += (await stat(src)).size
  outBytes += buf.length
  return meta
}

async function processStickers() {
  const groups = await readdir(join(PUBLIC, 'sticker'))
  let count = 0

  for (const group of groups) {
    const groupDir = join(PUBLIC, 'sticker', group)
    if (!(await stat(groupDir)).isDirectory()) continue

    for (const size of [512, 128]) {
      await mkdir(join(PUBLIC, `sticker-${size}`, group), { recursive: true })
    }

    for (const file of await readdir(groupDir)) {
      if (!file.endsWith('.webp')) continue
      await convert(join(groupDir, file), join(PUBLIC, 'sticker-512', group, file), 512)
      await convert(join(groupDir, file), join(PUBLIC, 'sticker-128', group, file), 128)
      count++
    }
  }
  return count
}

async function processBackgrounds() {
  await mkdir(join(PUBLIC, 'bg-128'), { recursive: true })
  const files = (await readdir(join(PUBLIC, 'bg'))).filter(f => f.endsWith('.webp'))

  for (const file of files) {
    await convert(join(PUBLIC, 'bg', file), join(PUBLIC, 'bg-128', file), 128)
  }
  return files.length
}

const stickers = await processStickers()
const backgrounds = await processBackgrounds()

const mb = b => (b / 1048576).toFixed(1)
console.log(`貼紙 ${stickers} 張 → sticker-512 / sticker-128`)
console.log(`背景 ${backgrounds} 張 → bg-128`)
console.log(`來源 ${mb(srcBytes)}MB → 產出 ${mb(outBytes)}MB`)

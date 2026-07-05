// Generates the PWA icons: a soft sky square with an ink paw print.
// Run once from app/: node scripts/make-icons.mjs — outputs are committed.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [199, 227, 250] // --tint-sky #c7e3fa
const PAW = [74, 59, 99] // --ink #4a3b63

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Paw in unit coordinates: one main pad + four toes.
const PARTS = [
  { cx: 0.5, cy: 0.63, rx: 0.185, ry: 0.15 },
  { cx: 0.295, cy: 0.42, rx: 0.085, ry: 0.095 },
  { cx: 0.43, cy: 0.34, rx: 0.085, ry: 0.095 },
  { cx: 0.57, cy: 0.34, rx: 0.085, ry: 0.095 },
  { cx: 0.705, cy: 0.42, rx: 0.085, ry: 0.095 },
]

/** 0..1 paw coverage at a pixel, antialiased ~1px at ellipse edges. */
function coverage(x, y, size) {
  let best = 0
  for (const { cx, cy, rx, ry } of PARTS) {
    const dx = (x / size - cx) / rx
    const dy = (y / size - cy) / ry
    const d = Math.sqrt(dx * dx + dy * dy) // 1.0 at the ellipse edge
    const edge = 1 / (rx * size) // one pixel, in ellipse units
    best = Math.max(best, Math.min(1, Math.max(0, (1 - d) / edge + 0.5)))
  }
  return best
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x + 0.5, y + 0.5, size)
      const offset = (y * size + x) * 4
      for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(BG[c] + (PAW[c] - BG[c]) * a)
      pixels[offset + 3] = 255
    }
  }
  return encodePng(size, pixels)
}

mkdirSync('public/icons', { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, drawIcon(size))
  console.log(`public/icons/${name} (${size}x${size})`)
}

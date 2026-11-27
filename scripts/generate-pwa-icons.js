import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICONS_DIR = path.resolve(__dirname, '../public/assets/icons');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function renderAkwabaIconPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  const cornerR = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const px = rowStart + 1 + x * 4;
      // Rounded-square alpha mask for maskable/standard icon crispness
      const dxEdge = Math.max(0, Math.abs(x + 0.5 - cx) - (cx - cornerR));
      const dyEdge = Math.max(0, Math.abs(y + 0.5 - cy) - (cy - cornerR));
      const cornerDist = Math.hypot(dxEdge, dyEdge);
      const inSquare = cornerDist <= cornerR + 0.5;

      if (!inSquare) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Warm Terracotta gradient (#C84B24 -> #9E3415)
      const grad = (x + y) / (2 * size);
      let r = Math.round(208 - grad * 38);
      let g = Math.round(84 - grad * 28);
      let b = Math.round(42 - grad * 16);

      // Central AKWABA solar emblem: golden outer halo + cream inner sun
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const outerR = size * 0.30;
      const innerR = size * 0.165;
      const angle = Math.atan2(dy, dx);
      const rayPulse = Math.cos(angle * 8) * (size * 0.025);

      if (dist <= innerR) {
        r = 250;
        g = 246;
        b = 240;
      } else if (dist <= outerR + rayPulse && dist >= innerR + size * 0.03) {
        r = 236;
        g = 178;
        b = 64;
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(ICONS_DIR, { recursive: true });
for (const size of [192, 512]) {
  const out = path.join(ICONS_DIR, `icon-${size}.png`);
  fs.writeFileSync(out, renderAkwabaIconPng(size));
  console.log(`Generated ${out} (${size}x${size})`);
}

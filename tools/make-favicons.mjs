#!/usr/bin/env node
/* Regenerates the raster favicons in demo/assets/favicon/.
 *
 * Run with `npm run favicons` after changing the mark. The output is committed,
 * because a favicon is a static asset, not a build product.
 *
 * The geometry is drawn directly in pixel space rather than rasterised from
 * favicon.svg: rendering SVG would mean pulling in a browser engine, and the
 * mark is four rectangles. Keep the two in step by hand — `drawIcon` below is a
 * deliberate transcription of favicon.svg.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'assets', 'favicon');

const INK = [0x17, 0x18, 0x1b, 0xff];
const PAPER = [0xff, 0xff, 0xff, 0xff];
const SOFT = [0x55, 0x57, 0x5e, 0xff];
const PROCESS = [
  [0x00, 0x9f, 0xe3, 0xff], // cyan
  [0xe5, 0x00, 0x7d, 0xff], // magenta
  [0xff, 0xd5, 0x00, 0xff], // yellow
  [0x17, 0x18, 0x1b, 0xff] // key
];

/** an RGBA canvas as a flat Uint8Array, addressed in the 64-unit design grid */
function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const u = size / 64; // one design unit in device pixels

  const fill = (x, y, w, h, rgba) => {
    const x0 = Math.round(x * u);
    const y0 = Math.round(y * u);
    const x1 = Math.round((x + w) * u);
    const y1 = Math.round((y + h) * u);
    for (let py = y0; py < y1; py++) {
      for (let pxx = x0; pxx < x1; pxx++) {
        if (pxx < 0 || pxx >= size || py < 0 || py >= size) continue;
        const i = (py * size + pxx) * 4;
        px[i] = rgba[0];
        px[i + 1] = rgba[1];
        px[i + 2] = rgba[2];
        px[i + 3] = rgba[3];
      }
    }
  };

  fill(0, 0, 64, 64, INK); // ground
  fill(14, 12, 36, 40, PAPER); // the sheet
  PROCESS.forEach((ink, i) => fill(14 + i * 9, 12, 9, 6, ink)); // the four inks
  fill(20, 26, 24, 3, SOFT); // ruled content
  fill(20, 34, 24, 3, SOFT);
  fill(20, 42, 14, 3, SOFT);

  return px;
}

/* png ------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size) {
  const pixels = drawIcon(size);

  // each scanline is prefixed with its filter type; 0 is "none"
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1);
    raw[at] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, at + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ico ------------------------------------------------------------------- */

/** an ICO container holding PNG payloads, which every target since Vista reads */
function ico(sizes) {
  const images = sizes.map((size) => ({ size, data: png(size) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // width, 0 means 256
    e[1] = size >= 256 ? 0 : size; // height
    e[2] = 0; // palette size
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/* write ------------------------------------------------------------------ */

const artifacts = [
  ['favicon.ico', ico([16, 32, 48])],
  ['apple-touch-icon.png', png(180)],
  ['icon-192.png', png(192)],
  ['icon-512.png', png(512)]
];

for (const [name, data] of artifacts) {
  writeFileSync(join(outDir, name), data);
  console.log(`wrote demo/assets/favicon/${name} (${(data.length / 1024).toFixed(1)}KB)`);
}

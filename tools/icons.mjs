#!/usr/bin/env node
// Renders the home-screen icons: icons/icon-180.png (iOS), icon-192.png,
// icon-512.png. The ship firing at a big rock, with a small one drifting by,
// in glowing white lines on black. Everything sits inside the middle 80% so the
// maskable crop is safe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Raster } from './png.js';
import { Screen, ROCKS } from '../src/render/screen.js';
import { drawLines } from './vector.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WHITE = [235, 245, 255];

function icon(size) {
  const r = new Raster(size, size);
  const s = new Screen();
  // on a 100 x 100 grid
  s.poly([...ROCKS[0], ROCKS[0][0]], 62, 36, 5);
  s.poly([...ROCKS[2], ROCKS[2][0]], 76, 74, 2);
  const a = Math.atan2(36 - 72, 62 - 28);   // the ship at (28, 72) aims at the rock
  s.shipIcon(28, 72, 1.3, 1, a);
  for (const d of [26, 35]) s.dot(28 + Math.cos(a) * d, 72 + Math.sin(a) * d);
  const k = size / 100;
  drawLines(r, s.lines, k, Math.max(1.5, size / 70), WHITE, s.dots);
  return r.encode(1);
}

fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const size of [180, 192, 512]) fs.writeFileSync(path.join(ROOT, `icons/icon-${size}.png`), icon(size));
console.log('wrote icons/icon-{180,192,512}.png');

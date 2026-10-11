#!/usr/bin/env node
// Renders a frame of the game to a PNG: node tools/shot.mjs out.png [frames] [play|demo|2p]
// In a game the ship turns slowly and fires now and then.
import fs from 'node:fs';
import { Asteroids } from '../src/game/asteroids.js';
import { Screen, SCREEN_W, SCREEN_H } from '../src/render/screen.js';
import { Raster } from './png.js';
import { drawLines } from './vector.js';

const [out = 'shot.png', frames = '300', kind = 'play'] = process.argv.slice(2);
const g = new Asteroids({ players: kind === 'demo' ? 0 : kind === '2p' ? 2 : 1, seed: 42 });
for (let i = 0; i < Number(frames); i++) g.step({ left: i % 90 < 30, fire: i % 12 < 6, thrust: i % 200 < 20 });
const s = new Screen().build(g, { text: (sc) => { if (g.demo) { sc.centred(250, 'ASTEROIDS', 9); sc.centred(420, 'TAP TO START', 4); } } });
const k = 0.75;
const r = new Raster(Math.round(SCREEN_W * k), Math.round(SCREEN_H * k));
drawLines(r, s.lines, k, 1.4, [235, 245, 255], s.dots);
fs.writeFileSync(out, r.encode(1));
console.log(`${out}: mode ${g.mode}, ship ${g.shipState}, score ${g.player.score}, rocks ${g.rocks.length}, wave ${g.player.wave}`);

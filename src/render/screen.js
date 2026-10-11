// Draws the game as the cabinet does: bright lines on a black vector monitor,
// no pixels. Like the cabinet's vector generator it works from a display list:
// build() turns the game into lines and dots (picture units, 1024 x 768, with
// a brightness), and paint() strokes them onto a canvas with a soft glow.
// tools/shot.mjs rasterises the same list to a PNG.
import { W, H, ROCK_SCALE } from '../game/asteroids.js';
import { strokes } from './font.js';

// The cabinet's own outlines, from its vector ROM (the listing at
// computerarcheology.com/Arcade/Asteroids/VectorROM.html), turned from the
// beam's relative moves into points and flipped to y down. The rocks are on a
// grid of -4..4; the ship points along +x on a grid of -5..7.
export const ROCKS = [
  [[0, -2], [2, -4], [4, -2], [3, 0], [4, 2], [1, 4], [-2, 4], [-4, 2], [-4, -2], [-2, -4], [0, -2]],
  [[2, -1], [4, -2], [2, -4], [0, -3], [-2, -4], [-4, -2], [-3, 0], [-4, 2], [-2, 4], [-1, 3], [2, 4], [4, 1], [2, -1]],
  [[-2, 0], [-4, 1], [-2, 4], [0, 1], [0, 4], [2, 4], [4, 1], [4, -1], [2, -4], [-1, -4], [-4, -1], [-2, 0]],
  [[1, 0], [4, -1], [4, -2], [1, -4], [-2, -4], [-1, -2], [-4, -2], [-4, 1], [-2, 4], [1, 3], [2, 4], [4, 2], [1, 0]],
];
// the ship: the bar across the back, out to a fin, up to the nose and back by
// the other fin; the flame comes out of the bar
const SHIP_K = 2.4;
const SHIP = [[[-3, -2], [-3, 2], [-5, 4], [7, 0], [-5, -4], [-3, -2]].map(([x, y]) => [x * SHIP_K, y * SHIP_K])];
const FLAME = [[-3, -2], [-7, 0], [-3, 2]].map(([x, y]) => [x * SHIP_K, y * SHIP_K]);
// the saucer, on a grid of -5..5 (the big one at 4 px a unit, the small at 2):
// the hull, and the lines across where the dome and the rim meet it
const SAUCER = [
  [[-5, 1], [-2, 3], [2, 3], [5, 1], [2, -1], [1, -3], [-1, -3], [-2, -1], [-5, 1]],
  [[-5, 1], [5, 1]],
  [[-2, -1], [2, -1]],
];

export class Screen {
  constructor() { this.lines = []; this.dots = []; }

  line(x1, y1, x2, y2, b = 1) { this.lines.push(x1, y1, x2, y2, b); }
  dot(x, y, b = 1) { this.dots.push(x, y, b); }

  /** A polyline of [x, y] points, turned by angle a, scaled by k, at (x, y). */
  poly(pts, x, y, k = 1, a = 0, b = 1) {
    const c = Math.cos(a) * k, s = Math.sin(a) * k;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
      this.line(x + x1 * c - y1 * s, y + x1 * s + y1 * c, x + x2 * c - y2 * s, y + x2 * s + y2 * c, b);
    }
  }

  /** Draw at (x, y) and again across any edge the object (radius r) overlaps. */
  wrapped(x, y, r, draw) {
    const xs = [x], ys = [y];
    if (x < r) xs.push(x + W); else if (x > W - r) xs.push(x - W);
    if (y < r) ys.push(y + H); else if (y > H - r) ys.push(y - H);
    for (const px of xs) for (const py of ys) draw(px, py);
  }

  /** Text with its top left at (x, y); k is the size (a character is 4k x 6k, 6k apart). */
  text(x, y, str, k = 3, b = 1) {
    for (let i = 0; i < str.length; i++) for (const st of strokes(str[i])) this.poly(st, x + i * 6 * k, y, k, 0, b);
  }

  centred(y, str, k = 3, b = 1) { this.text((W - (str.length * 6 - 2) * k) / 2, y, str, k, b); }
  right(x, y, str, k = 3, b = 1) { this.text(x - (str.length * 6 - 2) * k, y, str, k, b); }

  shipIcon(x, y, k = 1, b = 1, a = -Math.PI / 2) { for (const seg of SHIP) this.poly(seg, x, y, k, a, b); }

  /** @param {import('../game/asteroids.js').Asteroids} g */
  build(g, extra) {
    this.lines.length = 0;
    this.dots.length = 0;
    for (const r of g.rocks) {
      const k = ROCK_SCALE[r.size];
      this.wrapped(r.x, r.y, k * 4.5, (x, y) => this.poly(ROCKS[r.shape], x, y, k));
    }
    const s = g.ship;
    if (s && g.shipState === 'alive') {
      const a = s.dir / 256 * Math.PI * 2;
      this.wrapped(s.x, s.y, 19, (x, y) => {
        for (const seg of SHIP) this.poly(seg, x, y, 1, a);
        if (s.thrust && g.frameNo & 2) this.poly(FLAME, x, y, 1, a, 0.9);
      });
    }
    const u = g.saucer;
    if (u) {
      const k = u.small ? 2 : 4;
      this.wrapped(u.x, u.y, 5 * k, (x, y) => { for (const seg of SAUCER) this.poly(seg, x, y, k); });
    }
    for (const b of g.shots) this.dot(b.x, b.y, 1);
    for (const b of g.saucerShots) this.dot(b.x, b.y, 1);
    for (const p of g.sparks) this.dot(p.x, p.y, Math.min(1, p.life / 30));
    for (const d of g.debris) {
      const c = Math.cos(d.a) * d.len / 2, sn = Math.sin(d.a) * d.len / 2;
      this.line(d.x - c, d.y - sn, d.x + c, d.y + sn, Math.min(1, d.life / 50));
    }
    // the scores and ships left
    if (!g.demo || extra?.showScores) {
      const two = g.players.length === 2;
      const show = (i) => !(g.mode === 'turn' && g.cur === i && g.frameNo & 16);
      const score = (p) => String(p.score).padStart(2, '0');
      if (show(0)) this.text(110, 24, score(g.players[0]), 5);
      for (let i = 0; i < Math.min(12, g.players[0].lives); i++) this.shipIcon(122 + i * 22, 80, 0.7, 0.9);
      if (two) {
        if (show(1)) this.right(W - 120, 24, score(g.players[1]), 5);
        for (let i = 0; i < Math.min(12, g.players[1].lives); i++) this.shipIcon(W - 132 - i * 22, 80, 0.7, 0.9);
      }
    }
    extra?.text?.(this);
    return this;
  }

  /** Stroke the display list onto a canvas whose picture is k canvas px per unit. */
  paint(ctx, k) {
    const { lines, dots } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // a wide faint pass for the phosphor glow, then the bright line, grouped by brightness
    for (const [width, alpha] of [[5, 0.12], [1.6, 1]]) {
      ctx.lineWidth = Math.max(width, 1.4 / k);
      for (const level of [1, 0.75, 0.5, 0.25]) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < lines.length; i += 5) {
          if (bucket(lines[i + 4]) !== level) continue;
          ctx.moveTo(lines[i], lines[i + 1]); ctx.lineTo(lines[i + 2], lines[i + 3]);
          any = true;
        }
        if (!any) continue;
        ctx.strokeStyle = `rgba(235, 245, 255, ${alpha * level})`;
        ctx.stroke();
      }
    }
    for (let i = 0; i < dots.length; i += 3) {
      const b = dots[i + 2];
      ctx.fillStyle = `rgba(235, 245, 255, ${0.15 * b})`;
      ctx.beginPath(); ctx.arc(dots[i], dots[i + 1], 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 255, ${b})`;
      ctx.fillRect(dots[i] - 1.5, dots[i + 1] - 1.5, 3, 3);
    }
  }
}

const bucket = (b) => (b > 0.875 ? 1 : b > 0.625 ? 0.75 : b > 0.375 ? 0.5 : 0.25);

export { W as SCREEN_W, H as SCREEN_H };

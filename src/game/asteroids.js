// The game. Atari's 1979 Asteroids runs on a 6502 drawing lines on a vector
// monitor; this follows the cabinet's documented rules rather than tracing its
// program:
//
//   - a wave starts with 4 large rocks, then 6, 8, 10, and 11 from then on,
//     coming in from the edges
//   - large rocks split into two medium, medium into two small; 20, 50 and
//     100 points. At most 26 rocks at once: past that a hit rock just goes
//   - the ship turns, thrusts (and drifts to a stop when it stops thrusting),
//     wraps around the screen, and has at most 4 shots in flight
//   - hyperspace drops the ship somewhere at random, and sometimes it blows up
//   - the big saucer (200 points) fires anywhere; the small one (1000) aims
//     at the ship, more accurately as the score rises, and from 40,000 only
//     small saucers come. Saucers come sooner the longer a wave lasts
//   - crashing into a rock still scores it
//   - 3 ships (4 by an operator switch), an extra one every 10,000 points,
//     and the score rolls over at 100,000 as the cabinet's five digits do
//   - two players take turns, each with their own rocks
//   - the heartbeat speeds up as a wave goes on
//
// Speeds and timings are close stand-ins, not measurements of the hardware.
// Pure and deterministic (a seeded random number generator), stepped at 60 Hz.
// The picture is 1024 x 768, y down.

export const W = 1024, H = 768;
export const SIZE = { large: 3, medium: 2, small: 1 };
export const ROCK_SCALE = { 3: 9, 2: 4.5, 1: 2.25 };   // shape grid units to picture px
export const ROCK_R = { 3: 34, 2: 17, 1: 8.5 };         // collision radius
export const ROCK_POINTS = { 3: 20, 2: 50, 1: 100 };
export const SAUCER_POINTS = { big: 200, small: 1000 };
export const SAUCER_R = { big: 18, small: 9 };
export const SHIP_R = 13;
export const MAX_ROCKS = 26, MAX_SHOTS = 4, MAX_SAUCER_SHOTS = 2;
export const EXTRA_EVERY = 10000;

const TURN = 3;                         // direction units (256 to a circle) per frame
const ACCEL = 0.14, MAX_V = 9, DRAG = 1 / 128;
const SHOT_V = 10, SHOT_LIFE = 62;
const SAUCER_SHOT_V = 8, SAUCER_FIRE = 42;
const DEAD_FRAMES = 150, HYPER_FRAMES = 40, WAVE_GAP = 120, TURN_FRAMES = 150, OVER_FRAMES = 300;
const SAFE_R = 140;                     // the middle must be this clear of rocks to respawn
const SAUCER_FIRST = 600, SAUCER_MIN = 150, SAUCER_STEP = 60;
const BEAT_SLOW = 62, BEAT_FAST = 18;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shortest way from a to b across a wrapping screen of size n. */
export const wrapDelta = (a, b, n) => ((((b - a) + n / 2) % n) + n) % n - n / 2;
const wrap = (v, n) => ((v % n) + n) % n;
const dirAngle = (d) => d / 256 * Math.PI * 2;

export const DEFAULT_ASSIST = {
  speed: 1,           // the whole game's speed (main.js runs fewer frames)
  unlimited: false,   // ships never run out
  shield: false,      // the ship can't be destroyed
  safeHyper: false,   // hyperspace never blows up
  noSaucers: false,
};

export class Asteroids {
  /**
   * @param {object} o
   * @param {number} [o.players] 0 for the attract mode, else 1 or 2
   * @param {number} [o.ships] ships per player
   * @param {number} [o.seed]
   */
  constructor({ players = 0, ships = 3, seed = Date.now() } = {}) {
    this.rand = rng(seed);
    this.demo = players === 0;
    this.assist = { ...DEFAULT_ASSIST };
    this.autoFire = 0;     // frames between shots while fire is held (0: one per press)
    this.players = [];
    for (let i = 0; i < Math.max(1, players); i++) {
      this.players.push({ score: 0, total: 0, lives: ships - 1, nextExtra: EXTRA_EVERY, wave: 0, rocks: [], out: false, saucerTimer: SAUCER_FIRST, saucerGap: SAUCER_FIRST, beatGap: BEAT_SLOW });
    }
    this.cur = 0;
    this.ship = null;      // { x, y, vx, vy, dir, thrust } while it is on screen
    this.shipState = this.demo ? 'none' : 'waiting'; // 'alive' | 'dead' | 'hyper' | 'waiting' | 'none'
    this.timer = 0;        // for the ship state, or the turn / game over screens
    this.mode = this.demo ? 'play' : (players === 2 ? 'turn' : 'play'); // 'play' | 'turn' | 'over'
    if (this.mode === 'turn') this.timer = TURN_FRAMES;
    this.shots = [];       // the player's: { x, y, vx, vy, life }
    this.saucerShots = [];
    this.saucer = null;    // { x, y, vx, vy, small, travelled, turn, fire }
    this.sparks = [];      // explosion dots: { x, y, vx, vy, life }
    this.debris = [];      // the ship in pieces: { x, y, vx, vy, a, va, len, life }
    this.waveTimer = 0;
    this.beatTimer = 0;
    this.beatHigh = false;
    this.fireWas = false;
    this.hyperWas = false;
    this.fireHeld = 0;
    this.events = [];      // sounds for the front end: 'fire' 'sfire' 'bang3' 'bang2' 'bang1' 'die' 'extra' 'beat1' 'beat2'
    this.frameNo = 0;
    for (const p of this.players) this.newWave(p);
  }

  get player() { return this.players[this.cur]; }
  get rocks() { return this.player.rocks; }
  get over() { return this.mode === 'over' && this.timer <= 0; }

  // ---- waves and rocks ----

  newWave(p = this.player) {
    p.wave++;
    const n = Math.min(11, 2 + 2 * p.wave);
    p.rocks = [];
    for (let i = 0; i < n; i++) {
      // in from an edge, anywhere along it
      const edge = this.rand() < 0.5;
      const x = edge ? 0 : this.rand() * W, y = edge ? this.rand() * H : 0;
      p.rocks.push(this.makeRock(x, y, 3, this.rand() * Math.PI * 2));
    }
    p.saucerGap = SAUCER_FIRST;
    p.saucerTimer = SAUCER_FIRST;
    p.beatGap = BEAT_SLOW;
  }

  makeRock(x, y, size, heading) {
    const [lo, hi] = { 3: [0.5, 1.5], 2: [0.8, 2.2], 1: [1, 3] }[size];
    const v = lo + this.rand() * (hi - lo);
    return { x, y, vx: Math.cos(heading) * v, vy: Math.sin(heading) * v, size, shape: Math.floor(this.rand() * 4) };
  }

  /** Break rock i: two smaller ones (room permitting), and sparks. Returns its points. */
  breakRock(i) {
    const rocks = this.rocks, r = rocks[i];
    rocks.splice(i, 1);
    this.explode(r.x, r.y, r.size * 4 + 4);
    this.events.push(`bang${r.size}`);
    if (r.size > 1) {
      const heading = Math.atan2(r.vy, r.vx);
      for (let k = 0; k < 2 && rocks.length < MAX_ROCKS; k++) {
        rocks.push(this.makeRock(r.x, r.y, r.size - 1, heading + (this.rand() - 0.5) * 2.2));
      }
    }
    return ROCK_POINTS[r.size];
  }

  explode(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, v = 0.5 + this.rand() * 2.5;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 25 + Math.floor(this.rand() * 25) });
    }
  }

  /** Clear the wave (the skip cheat): no points, and the next wave follows as usual. */
  skipWave() {
    if (this.demo || this.mode === 'over') return;
    this.rocks.length = 0;
  }

  addScore(points) {
    if (this.demo) return;
    const p = this.player;
    p.total += points;
    p.score = p.total % 100000;
    while (p.total >= p.nextExtra) { p.lives++; p.nextExtra += EXTRA_EVERY; this.events.push('extra'); }
  }

  // ---- the frame ----

  /**
   * One 60 Hz frame.
   * input: { left, right, thrust, fire, hyper } as buttons held, and optionally
   * aim (an angle in radians, screen axes) to turn towards instead of left/right.
   */
  step(input = {}) {
    this.frameNo++;
    this.events.length = 0;
    const fire = !!input.fire, hyper = !!input.hyper;
    const firePressed = fire && !this.fireWas, hyperPressed = hyper && !this.hyperWas;
    this.fireWas = fire; this.hyperWas = hyper;
    this.fireHeld = fire ? this.fireHeld + 1 : 0;

    if (this.mode === 'turn') {
      if (--this.timer <= 0) this.mode = 'play';
      this.moveAll();
      return;
    }
    if (this.mode === 'over') {
      if (this.timer > 0) this.timer--;
      this.moveAll();
      return;
    }
    this.updateShip(input, firePressed || (this.autoFire > 0 && this.fireHeld > 1 && this.fireHeld % this.autoFire === 1), hyperPressed);
    this.updateSaucer();
    this.moveAll();
    this.collide();
    this.updateWave();
    this.heartbeat();
  }

  updateShip(input, firePressed, hyperPressed) {
    const a = this.assist;
    switch (this.shipState) {
      case 'alive': {
        const s = this.ship;
        if (input.aim != null) {
          const d = wrapDelta(s.dir, input.aim / (Math.PI * 2) * 256, 256);
          s.dir = wrap(s.dir + Math.max(-TURN, Math.min(TURN, d)), 256);
        } else if (input.left !== input.right) s.dir = wrap(s.dir + (input.left ? -TURN : TURN), 256);
        const ang = dirAngle(s.dir);
        s.thrust = !!input.thrust;
        if (s.thrust) {
          s.vx += Math.cos(ang) * ACCEL; s.vy += Math.sin(ang) * ACCEL;
          const v = Math.hypot(s.vx, s.vy);
          if (v > MAX_V) { s.vx *= MAX_V / v; s.vy *= MAX_V / v; }
        } else { s.vx -= s.vx * DRAG; s.vy -= s.vy * DRAG; }
        s.x = wrap(s.x + s.vx, W); s.y = wrap(s.y + s.vy, H);
        if (firePressed && this.shots.length < MAX_SHOTS) {
          this.shots.push({ x: s.x + Math.cos(ang) * 17, y: s.y + Math.sin(ang) * 17, vx: s.vx + Math.cos(ang) * SHOT_V, vy: s.vy + Math.sin(ang) * SHOT_V, life: SHOT_LIFE });
          this.events.push('fire');
        }
        if (hyperPressed) { this.shipState = 'hyper'; this.timer = HYPER_FRAMES; s.thrust = false; }
        break;
      }
      case 'hyper':
        if (--this.timer <= 0) {
          const s = this.ship;
          s.x = W * (0.1 + this.rand() * 0.8); s.y = H * (0.1 + this.rand() * 0.8); s.vx = s.vy = 0;
          this.shipState = 'alive';
          // the risk grows with the rocks on screen
          if (!a.safeHyper && !a.shield && this.rand() < Math.min(0.4, 0.08 + this.rocks.length * 0.012)) this.killShip();
        }
        break;
      case 'dead':
        if (--this.timer <= 0) this.afterDeath();
        break;
      case 'waiting':
        if (this.centreClear()) {
          this.ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, dir: 192, thrust: false };
          this.shipState = 'alive';
          this.player.beatGap = BEAT_SLOW;
        }
        break;
    }
  }

  centreClear() {
    const near = (o, r) => Math.hypot(wrapDelta(W / 2, o.x, W), wrapDelta(H / 2, o.y, H)) < r;
    return !this.rocks.some((r) => near(r, SAFE_R + ROCK_R[r.size])) && !(this.saucer && near(this.saucer, SAFE_R));
  }

  killShip() {
    const s = this.ship;
    this.events.push('die');
    this.explode(s.x, s.y, 10);
    for (let i = 0; i < 5; i++) {
      const a = this.rand() * Math.PI * 2, v = 0.3 + this.rand() * 1.2;
      this.debris.push({ x: s.x, y: s.y, vx: s.vx * 0.3 + Math.cos(a) * v, vy: s.vy * 0.3 + Math.sin(a) * v, a: this.rand() * Math.PI, va: (this.rand() - 0.5) * 0.2, len: 8 + this.rand() * 10, life: 70 + Math.floor(this.rand() * 40) });
    }
    this.ship = null;
    this.shipState = 'dead';
    this.timer = DEAD_FRAMES;
  }

  /** After the ship's gone: the other player's turn if they're still in, else this player's, else game over. */
  afterDeath() {
    const p = this.player;
    if (p.lives === 0 && !this.assist.unlimited) p.out = true;
    else if (!this.assist.unlimited) p.lives--;
    const other = this.players[(this.cur + 1) % this.players.length];
    this.saucer = null;
    this.saucerShots.length = 0;
    if (other !== p && !other.out) {
      this.cur = this.players.indexOf(other);
      this.shots.length = 0;
      this.mode = 'turn';
      this.timer = TURN_FRAMES;
    } else if (p.out) {
      this.mode = 'over';
      this.timer = OVER_FRAMES;
      this.shipState = 'none';
      return;
    }
    this.shipState = 'waiting';
  }

  // ---- saucers ----

  updateSaucer() {
    const p = this.player;
    if (!this.saucer) {
      const shipAbout = this.demo || this.shipState === 'alive';
      if (shipAbout && !(this.assist.noSaucers && !this.demo) && this.rocks.length && --p.saucerTimer <= 0) {
        p.saucerGap = Math.max(SAUCER_MIN, p.saucerGap - SAUCER_STEP);
        p.saucerTimer = p.saucerGap;
        this.spawnSaucer();
      }
      return;
    }
    const u = this.saucer;
    if (--u.turn <= 0) {
      u.vy = [-1, 0, 1][Math.floor(this.rand() * 3)] * Math.abs(u.vx) * 0.75;
      u.turn = 50 + Math.floor(this.rand() * 80);
    }
    if (--u.fire <= 0) {
      u.fire = SAUCER_FIRE;
      if (this.saucerShots.length < MAX_SAUCER_SHOTS) this.saucerFire(u);
    }
  }

  spawnSaucer() {
    const score = this.player.total;
    const small = !this.demo && this.rand() < Math.max(0, Math.min(1, (score - 5000) / 35000));
    const fromLeft = this.rand() < 0.5;
    const v = small ? 3.2 : 2.4;
    this.saucer = { x: fromLeft ? 0 : W - 0.01, y: H * (0.15 + this.rand() * 0.7), vx: fromLeft ? v : -v, vy: 0, small, travelled: 0, turn: 60, fire: 30 };
  }

  saucerFire(u) {
    let a = this.rand() * Math.PI * 2;
    if (u.small && this.ship && this.shipState === 'alive') {
      // aimed, with an error that shrinks as the score rises
      const err = Math.max(0.05, 0.5 - this.player.total / 70000);
      a = Math.atan2(wrapDelta(u.y, this.ship.y, H), wrapDelta(u.x, this.ship.x, W)) + (this.rand() - 0.5) * 2 * err;
    }
    this.saucerShots.push({ x: u.x, y: u.y, vx: Math.cos(a) * SAUCER_SHOT_V, vy: Math.sin(a) * SAUCER_SHOT_V, life: SHOT_LIFE });
    this.events.push('sfire');
  }

  // ---- movement and collisions ----

  moveAll() {
    for (const r of this.rocks) { r.x = wrap(r.x + r.vx, W); r.y = wrap(r.y + r.vy, H); }
    const u = this.saucer;
    if (u) {
      u.x += u.vx; u.y = wrap(u.y + u.vy, H);
      u.travelled += Math.abs(u.vx);
      if (u.travelled >= W) this.saucer = null;   // across and gone
    }
    for (const list of [this.shots, this.saucerShots]) {
      for (const b of list) { b.x = wrap(b.x + b.vx, W); b.y = wrap(b.y + b.vy, H); b.life--; }
      for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
    }
    for (const s of this.sparks) { s.x += s.vx; s.y += s.vy; s.vx *= 0.97; s.vy *= 0.97; s.life--; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const d of this.debris) { d.x += d.vx; d.y += d.vy; d.a += d.va; d.life--; }
    this.debris = this.debris.filter((d) => d.life > 0);
  }

  hits(a, b, r) { return Math.hypot(wrapDelta(a.x, b.x, W), wrapDelta(a.y, b.y, H)) < r; }

  /** Index of the first rock within r (plus its own radius) of o, or -1. */
  rockAt(o, r) {
    const rocks = this.rocks;
    for (let i = 0; i < rocks.length; i++) if (this.hits(o, rocks[i], r + ROCK_R[rocks[i].size])) return i;
    return -1;
  }

  collide() {
    const shield = this.assist.shield && !this.demo;
    // shots against rocks and the saucer (half steps, so a fast shot can't skip a small rock)
    for (const [list, scores] of [[this.shots, true], [this.saucerShots, false]]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        const mid = { x: b.x - b.vx / 2, y: b.y - b.vy / 2 };
        let hit = false;
        for (const at of [mid, b]) {
          const k = this.rockAt(at, 1);
          if (k >= 0) { const pts = this.breakRock(k); if (scores) this.addScore(pts); hit = true; break; }
          if (scores && this.saucer && this.hits(at, this.saucer, SAUCER_R[this.saucer.small ? 'small' : 'big'] + 1)) {
            this.addScore(this.killSaucer());
            hit = true; break;
          }
          if (!scores && this.shipState === 'alive' && this.hits(at, this.ship, SHIP_R)) {
            if (!shield) this.killShip();
            hit = true; break;
          }
        }
        if (hit) list.splice(i, 1);
      }
    }
    // the ship against rocks and the saucer: the rock still scores
    if (this.shipState === 'alive') {
      const k = this.rockAt(this.ship, SHIP_R - 2);
      if (k >= 0) { this.addScore(this.breakRock(k)); if (!shield) this.killShip(); }
    }
    if (this.shipState === 'alive' && this.saucer && this.hits(this.ship, this.saucer, SHIP_R + SAUCER_R[this.saucer.small ? 'small' : 'big'])) {
      this.addScore(this.killSaucer());
      if (!shield) this.killShip();
    }
    // the saucer against rocks: both go, nobody scores
    if (this.saucer) {
      const k = this.rockAt(this.saucer, SAUCER_R[this.saucer.small ? 'small' : 'big']);
      if (k >= 0) { this.breakRock(k); this.killSaucer(); }
    }
  }

  killSaucer() {
    const u = this.saucer;
    this.saucer = null;
    this.explode(u.x, u.y, 14);
    this.events.push('bang3');
    return SAUCER_POINTS[u.small ? 'small' : 'big'];
  }

  updateWave() {
    if (this.rocks.length) return;
    if (this.waveTimer === 0) this.waveTimer = WAVE_GAP;
    else if (--this.waveTimer === 0) this.newWave();
  }

  /** The two-note heartbeat, faster as the wave goes on. */
  heartbeat() {
    if (this.demo || this.shipState === 'none' || !this.rocks.length) return;
    if (++this.beatTimer < this.player.beatGap) return;
    this.beatTimer = 0;
    this.beatHigh = !this.beatHigh;
    this.events.push(this.beatHigh ? 'beat1' : 'beat2');
    if (this.player.beatGap > BEAT_FAST) this.player.beatGap--;
  }
}

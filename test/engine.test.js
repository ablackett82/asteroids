// The cabinet's rules, checked against the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Asteroids, W, H, MAX_ROCKS, MAX_SHOTS, ROCK_POINTS, EXTRA_EVERY, wrapDelta } from '../src/game/asteroids.js';

const run = (g, n, input = {}) => { for (let i = 0; i < n; i++) g.step(input); };

/** A one-player game with the ship on screen and the rocks moved out of the way. */
function game(opts = {}) {
  const g = new Asteroids({ players: 1, seed: 1, ...opts });
  g.assist.noSaucers = true;
  for (const r of g.rocks) { r.x = 10; r.y = 10; r.vx = r.vy = 0; }
  run(g, 1);
  assert.equal(g.shipState, 'alive');
  return g;
}
/** Put one rock of the given size at (x, y), standing still, and nothing else. */
function onlyRock(g, size, x, y) {
  g.rocks.length = 0;
  g.rocks.push({ x, y, vx: 0, vy: 0, size, shape: 0 });
}

test('waves start with 4, 6, 8, 10, then 11 large rocks', () => {
  const g = new Asteroids({ players: 1, seed: 2 });
  const counts = [];
  for (let w = 0; w < 6; w++) {
    counts.push(g.rocks.length);
    assert.ok(g.rocks.every((r) => r.size === 3));
    g.skipWave();
    run(g, 200);
  }
  assert.deepEqual(counts, [4, 6, 8, 10, 11, 11]);
});

test('large splits to two medium, medium to two small; 20, 50 and 100 points', () => {
  const g = game();
  onlyRock(g, 3, W / 2, 200);   // straight above the ship, which points up
  let score = 0;
  for (const size of [3, 2, 1]) {
    const before = g.rocks.filter((r) => r.size === size).length;
    for (const r of g.rocks) { r.vx = r.vy = 0; r.x = W / 2; r.y = 200; }
    run(g, 1, { fire: true }); run(g, 30);
    score += ROCK_POINTS[size];
    assert.equal(g.player.score, score, `size ${size}`);
    if (size > 1) assert.equal(g.rocks.filter((r) => r.size === size - 1).length, 2);
    assert.equal(g.rocks.filter((r) => r.size === size).length, before - 1);
    g.rocks.splice(1); // keep one to break next
  }
  assert.equal(score, 170);
});

test('no more than 26 rocks: past that a hit rock just goes', () => {
  const g = game();
  g.rocks.length = 0;
  for (let i = 0; i < MAX_ROCKS; i++) g.rocks.push({ x: 50 + (i % 13) * 70, y: i < 13 ? 60 : 700, vx: 0, vy: 0, size: 2, shape: 0 });
  g.breakRock(0);
  assert.equal(g.rocks.length, MAX_ROCKS);
  assert.equal(g.rocks.filter((r) => r.size === 1).length, 1, 'room for one piece, not two');
  g.breakRock(g.rocks.findIndex((r) => r.size === 1));
  assert.equal(g.rocks.length, MAX_ROCKS - 1);
});

test('at most 4 shots in flight, one per press (or held, with auto-fire)', () => {
  const g = game();
  g.rocks.length = 0; g.rocks.push({ x: 5, y: 5, vx: 0, vy: 0, size: 1, shape: 0 });
  for (let i = 0; i < 6; i++) { run(g, 1, { fire: true }); run(g, 1); }
  assert.equal(g.shots.length, MAX_SHOTS);
  run(g, 80);
  assert.equal(g.shots.length, 0, 'they run out');
  run(g, 40, { fire: true });
  assert.equal(g.shots.length, 1, 'holding fires once');
  run(g, 80);
  g.autoFire = 9;
  run(g, 40, { fire: true });
  assert.ok(g.shots.length >= 4, 'auto-fire keeps going');
});

test('the ship turns, thrusts to a top speed, drifts to a stop and wraps', () => {
  const g = game();
  const d0 = g.ship.dir;
  run(g, 10, { left: true });
  assert.equal(wrapDelta(d0, g.ship.dir, 256), -30);
  run(g, 300, { thrust: true });
  const v = Math.hypot(g.ship.vx, g.ship.vy);
  assert.ok(v > 8.9 && v <= 9.0001, `top speed ${v}`);
  for (let i = 0; i < 600; i++) {
    g.step();
    assert.ok(g.ship.x >= 0 && g.ship.x < W && g.ship.y >= 0 && g.ship.y < H);
  }
  assert.ok(Math.hypot(g.ship.vx, g.ship.vy) < 0.1, 'drifted to a stop');
});

test('turning towards an aim point (the stick) goes the short way and stops on it', () => {
  const g = game();
  run(g, 100, { aim: 0 }); // pointing right, from up
  assert.ok(Math.abs(wrapDelta(g.ship.dir, 0, 256)) < 0.001);
});

test('crashing into a rock loses the ship but still scores the rock; then 3 ships and game over', () => {
  const g = game();
  for (let ship = 3; ship >= 1; ship--) {
    assert.equal(g.player.lives, ship - 1);
    onlyRock(g, 2, g.ship.x, g.ship.y);
    run(g, 1);
    assert.equal(g.shipState, 'dead');
    g.rocks.length = 0;
    g.rocks.push({ x: 5, y: 5, vx: 0, vy: 0, size: 1, shape: 0 });
    run(g, 200);
  }
  assert.equal(g.player.score, 150);
  assert.equal(g.mode, 'over');
  run(g, 400);
  assert.ok(g.over);
});

test('the ship waits for the middle to be clear before it comes back', () => {
  const g = game();
  g.killShip();
  onlyRock(g, 3, W / 2 + 60, H / 2);
  run(g, 400);
  assert.equal(g.shipState, 'waiting');
  g.rocks[0].x = 50;
  run(g, 1);
  assert.equal(g.shipState, 'alive');
});

test('an extra ship every 10,000, and the score rolls over at 100,000', () => {
  const g = game();
  g.addScore(EXTRA_EVERY - 10);
  assert.equal(g.player.lives, 2);
  g.addScore(20);
  assert.equal(g.player.lives, 3);
  g.addScore(100000 - 10010 + 30);
  assert.equal(g.player.score, 30);
  assert.equal(g.player.lives, 12);
});

test('hyperspace moves the ship; it sometimes blows up, never with safe hyperspace', () => {
  let deaths = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = game({ seed });
    g.rocks.splice(1);
    g.rocks[0].x = 5; g.rocks[0].y = 5;
    run(g, 1, { hyper: true });
    assert.equal(g.shipState, 'hyper');
    run(g, 45);
    if (g.shipState === 'dead') deaths++;
    else assert.equal(g.shipState, 'alive');
  }
  assert.ok(deaths > 5 && deaths < 50, `deaths ${deaths}`);
  for (let seed = 1; seed <= 100; seed++) {
    const g = game({ seed });
    g.assist.safeHyper = true;
    run(g, 1, { hyper: true }); run(g, 45);
    assert.notEqual(g.shipState, 'dead');
  }
});

test('saucers: big 200 and small 1000; only small ones from 40,000; the small one aims', () => {
  const g = game();
  g.assist.noSaucers = false;
  let small = 0;
  for (let i = 0; i < 100; i++) { g.spawnSaucer(); if (g.saucer.small) small++; }
  assert.equal(small, 0, 'none small at the start');
  g.player.total = 40000;
  for (let i = 0; i < 50; i++) { g.spawnSaucer(); assert.ok(g.saucer.small); }
  // the small one fires at the ship
  g.player.total = 60000;
  g.saucer = { x: 100, y: H / 2, vx: 0, vy: 0, small: true, travelled: 0, turn: 999, fire: 999 };
  g.saucerFire(g.saucer);
  const b = g.saucerShots[0];
  const want = Math.atan2(g.ship.y - H / 2, g.ship.x - 100);
  assert.ok(Math.abs(Math.atan2(b.vy, b.vx) - want) < 0.06);
  // and shooting saucers scores
  g.saucerShots.length = 0;
  g.player.total = g.player.score = 0;
  for (const smallOne of [false, true]) {
    g.rocks.length = 0; g.rocks.push({ x: 5, y: 5, vx: 0, vy: 0, size: 1, shape: 0 });
    g.saucer = { x: g.ship.x, y: g.ship.y - 150, vx: 0, vy: 0, small: smallOne, travelled: 0, turn: 999, fire: 999 };
    run(g, 1, { fire: true }); run(g, 30);
    assert.equal(g.saucer, null);
  }
  assert.equal(g.player.score, 1200);
});

test('saucers come along on their own, and sooner as the wave goes on', () => {
  const g = new Asteroids({ players: 1, seed: 4 });
  g.assist.shield = true;
  const seen = [];
  for (let i = 0; i < 6000; i++) {
    const had = !!g.saucer;
    g.step();
    if (!had && g.saucer) seen.push(i);
    if (!g.rocks.length) break;
  }
  assert.ok(seen.length >= 3, `saucers at ${seen}`);
  assert.ok(seen[2] - seen[1] < seen[1] - seen[0] + 200);
});

test('two players take turns, each with their own rocks and score', () => {
  const g = new Asteroids({ players: 2, seed: 3 });
  g.assist.noSaucers = true;
  assert.equal(g.mode, 'turn');
  for (const r of g.rocks) { r.x = 5; r.y = 5; r.vx = r.vy = 0; }
  run(g, 200);
  assert.equal(g.shipState, 'alive');
  g.rocks.length = 3;
  g.player.score = 50;
  g.killShip();
  run(g, 160);
  assert.equal(g.cur, 1);
  assert.equal(g.mode, 'turn');
  assert.equal(g.player.score, 0);
  assert.equal(g.rocks.length, 4);
  assert.equal(g.players[0].rocks.length, 3);
});

test('the ship can be made indestructible', () => {
  const g = game();
  g.assist.shield = true;
  onlyRock(g, 3, g.ship.x, g.ship.y);
  run(g, 1);
  assert.equal(g.shipState, 'alive');
  assert.equal(g.player.score, 20);
});

test('the heartbeat speeds up', () => {
  const g = game();
  onlyRock(g, 3, 5, 5);
  const beats = [];
  for (let i = 0; i < 3000; i++) { g.step(); if (g.events.some((e) => e.startsWith('beat'))) beats.push(i); }
  const first = beats[1] - beats[0], late = beats.at(-1) - beats.at(-2);
  assert.ok(late < first / 2, `${first} -> ${late}`);
});

test('a long random game stays sane', () => {
  const g = new Asteroids({ players: 1, seed: 99 });
  g.assist.unlimited = true;
  g.autoFire = 9;
  for (let i = 0; i < 30000; i++) {
    g.step({ left: (i >> 6) % 3 === 0, right: (i >> 6) % 3 === 1, thrust: i % 120 < 10, fire: true, hyper: i % 997 === 0 });
    assert.ok(g.rocks.length <= MAX_ROCKS);
    assert.ok(g.shots.length <= MAX_SHOTS);
    for (const r of g.rocks) assert.ok(r.x >= 0 && r.x < W && r.y >= 0 && r.y < H);
  }
  assert.ok(g.player.wave >= 2, `wave ${g.player.wave}`);
  assert.ok(g.player.total > 5000, `score ${g.player.total}`);
});

test('the attract mode plays itself forever without scoring', () => {
  const g = new Asteroids({ players: 0, seed: 5 });
  run(g, 30000);
  assert.equal(g.mode, 'play');
  assert.equal(g.player.score, 0);
  assert.ok(g.rocks.length > 0);
});

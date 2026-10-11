// Entry point: runs the game at 60 Hz and draws it. The title screen is an
// attract mode (the rocks drifting, saucers passing); a tap or Space starts a
// game. The options, cheats, saved high score and pausing live here, outside
// the game.
import { Asteroids, DEFAULT_ASSIST } from './game/asteroids.js';
import { Screen, SCREEN_W, SCREEN_H } from './render/screen.js';
import { Sound } from './render/audio.js';
import { Keyboard } from './input/keyboard.js';
import { Gamepad } from './input/gamepad.js';
import { Touch } from './input/touch.js';

const STEP = 1 / 60;
const MAX_CATCHUP = 0.1;
const STORE = 'asteroids.';
const CHEATS = Object.keys(DEFAULT_ASSIST);
const SPEEDS = [1, 0.75, 0.5];
const AUTO_FIRE = 9; // frames between shots while fire is held

const store = {
  get(k, d) { try { return localStorage.getItem(STORE + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(STORE + k, String(v)); } catch { /* storage blocked */ } },
};

function main() {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  const screen = new Screen();
  const sound = new Sound();
  const keyboard = new Keyboard();
  const gamepad = new Gamepad();
  const touch = new Touch(document.getElementById('touch'));

  // the options: players and ships are the arcade's own; the rest are cheats
  const opts = { players: Number(store.get('players', 1)) === 2 ? 2 : 1, ships: Number(store.get('ships', 3)) === 4 ? 4 : 3 };
  for (const c of CHEATS) {
    const d = DEFAULT_ASSIST[c], v = store.get(c, null);
    opts[c] = typeof d === 'boolean' ? v === '1' : (v !== null && Number(v)) || d;
  }
  let highScore = Number(store.get('highscore', 0)) || 0;
  let paused = false, settingsOpen = false, assisted = false;
  let acc = 0, last = performance.now(), frameNo = 0;
  let g = attract();

  touch.setOptions(opts);
  touch.onPanelToggle = (open) => { settingsOpen = open; };
  touch.onOption = (name, v) => setOption(name, v);
  touch.onPause = (on) => { paused = on && inGame(); };
  touch.onRestart = () => { const n = g.demo ? opts.players : g.players.length; quit(); start(n); };
  touch.onQuit = () => quit();
  touch.onSkip = () => skipWave();

  function attract() { return new Asteroids({ players: 0 }); }

  const inGame = () => !g.demo;
  const isAssisted = () => CHEATS.some((c) => opts[c] !== DEFAULT_ASSIST[c]);

  function applyOptions() {
    for (const c of CHEATS) g.assist[c] = opts[c];
  }
  applyOptions();

  function setOption(name, v) {
    opts[name] = v;
    store.set(name, typeof v === 'boolean' ? (v ? 1 : 0) : v);
    touch.setOptions(opts);
    if (inGame()) assisted ||= isAssisted();
    applyOptions();
  }

  function cycle(name, list) {
    setOption(name, list[(list.indexOf(opts[name]) + 1) % list.length]);
  }

  function skipWave() {
    if (!inGame() || g.mode === 'over') return;
    assisted = true;
    g.skipWave();
  }

  function start(players) {
    if (inGame()) return;
    g = new Asteroids({ players, ships: opts.ships });
    assisted = isAssisted();
    applyOptions();
    touch.release();
    sound.unlock();
  }

  function gameOver() {
    const best = Math.max(...g.players.map((p) => p.score));
    if (!assisted && best > highScore) { highScore = best; store.set('highscore', highScore); }
  }

  function quit() {
    if (inGame()) gameOver();
    g = attract();
    applyOptions();
    paused = false;
  }

  window.__ast = { get g() { return g; }, sound, touch }; // debug handle

  // ---- input ----
  const input = {};
  function readInput() {
    for (const k of ['left', 'right', 'thrust', 'fire', 'hyper']) input[k] = false;
    input.aim = null;
    keyboard.read(input);
    gamepad.read(input);
    touch.read(input);
    return input;
  }

  // ---- messages over the picture ----
  function messages(s) {
    if (highScore || inGame()) s.centred(30, String(Math.max(highScore, 0)).padStart(2, '0'), 3, 0.75);
    if (g.demo) {
      s.centred(250, 'ASTEROIDS', 9);
      if (frameNo & 32) s.centred(420, touch.active ? (opts.players === 2 ? 'TAP FOR 2 PLAYERS' : 'TAP TO START') : 'PRESS SPACE TO START', 4);
      return;
    }
    // the cheats in force, along the bottom
    const tags = [];
    const sp = SPEEDS.indexOf(opts.speed);
    if (sp > 0) tags.push(['', 'SLOW', 'V.SLOW'][sp]);
    if (opts.unlimited) tags.push('UNLIMITED');
    if (opts.shield) tags.push('SHIELD');
    if (opts.safeHyper) tags.push('SAFE HYPER');
    if (opts.noSaucers) tags.push('NO SAUCERS');
    if (tags.length) s.centred(735, tags.join('  '), 2, 0.5);
    if (g.mode === 'turn') s.centred(300, `PLAYER ${g.cur + 1}`, 5);
    if (g.mode === 'over') s.centred(300, 'GAME OVER', 6);
  }

  // ---- layout ----
  // Sized to the part of the screen that can be seen: on iPhone, Safari's
  // toolbars can sit over the bottom of the window, and the home bar and the
  // camera cut-out take the safe-area insets (the stage's padding). Any of the
  // picture under them would hide the ship as it wraps between top and bottom.
  function fit() {
    const stage = document.getElementById('stage');
    const vv = window.visualViewport;
    if (vv) Object.assign(stage.style, { inset: 'auto', left: `${vv.offsetLeft}px`, top: `${vv.offsetTop}px`, width: `${vv.width}px`, height: `${vv.height}px` });
    touch.layout();
    const cs = getComputedStyle(stage), pad = (k) => parseFloat(cs[k]) || 0;
    const vw = stage.clientWidth - pad('paddingLeft') - pad('paddingRight');
    const vh = stage.clientHeight - pad('paddingTop') - pad('paddingBottom');
    const portrait = vh > vw;
    const reserved = touch.reserved && Math.max(0, touch.reserved - pad('paddingBottom'));
    const availH = portrait && reserved ? Math.max(vh * 0.4, vh - reserved) : vh;
    const scale = Math.min(vw / SCREEN_W, availH / SCREEN_H);
    const cw = Math.floor(SCREEN_W * scale), chh = Math.floor(SCREEN_H * scale);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${chh}px`;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(chh * dpr);
    stage.classList.toggle('top', portrait && reserved > 0);
  }
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  touch.onLayout = fit;
  fit();

  function frame(now) {
    const dt = Math.min(MAX_CATCHUP, (now - last) / 1000);
    last = now;
    readInput();

    if (keyboard.consume('KeyF')) toggleFullscreen();
    if (keyboard.consume('KeyM')) sound.setMuted(!sound.muted);
    if (keyboard.consume('KeyC')) cycle('speed', SPEEDS);
    if (keyboard.consume('KeyL')) setOption('unlimited', !opts.unlimited);
    if (keyboard.consume('KeyV')) setOption('shield', !opts.shield);
    if (keyboard.consume('KeyY')) setOption('safeHyper', !opts.safeHyper);
    if (keyboard.consume('KeyU')) setOption('noSaucers', !opts.noSaucers);
    if (keyboard.consume('KeyK')) skipWave();
    if (keyboard.consume('Escape')) quit();
    if (keyboard.consume('KeyP') && inGame()) paused = !paused;
    const start1 = keyboard.consume('Space', 'Enter', 'Digit1');
    const start2 = keyboard.consume('Digit2');
    const tap = touch.consumeStart() || gamepad.startPressed;
    if (!inGame() && !settingsOpen) {
      if (start2) start(2);
      else if (tap) start(opts.players);
      else if (start1) start(1);
    }

    if (inGame() && g.over) quit();
    g.autoFire = touch.settings.autoFire ? AUTO_FIRE : 0;
    touch.setPlayState(inGame(), paused);
    const running = !paused && !settingsOpen;
    if (running) {
      acc += dt * (inGame() ? opts.speed : 1);
      const events = [];
      while (acc >= STEP) { g.step(input); events.push(...g.events); acc -= STEP; frameNo++; }
      sound.play(g.demo ? [] : events);
    }
    const live = running && inGame();
    sound.hold(live && g.shipState === 'alive' && g.ship.thrust, live && g.saucer ? (g.saucer.small ? 'small' : 'big') : null);
    screen.build(g, { text: messages }).paint(ctx, canvas.width / SCREEN_W);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // audio can only start from a user gesture on iOS (touchend and click are the
  // ones a home-screen app reliably counts)
  for (const ev of ['keydown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) window.addEventListener(ev, () => sound.unlock(), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && inGame()) paused = true;
    if (!document.hidden) sound.unlock();
  });
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
}

try { main(); } catch (err) {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f55;padding:1em">${err.stack || err}</pre>`);
}

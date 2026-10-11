// Touch controls for iPad, and the settings and pause menus. Every finger is
// tracked on its own (Pointer Events), so one thumb can turn while the other
// thrusts and fires. Nothing latches: a control is live exactly while a finger
// is on it. Two layouts:
//
//   buttons - the cabinet's five buttons. Bottom left, rotate left and rotate
//             right; bottom right, thrust (the inner one) and fire (the outer
//             one), with hyperspace above them, smaller, so it isn't hit by
//             accident. The whole left half belongs to turning and the right
//             half to thrust/fire, and the nearer button wins, so a thumb can
//             slide between neighbours without lifting.
//   stick   - the left thumb drags a stick that appears where it lands: the
//             ship turns to face where it points, at the cabinet's turning
//             speed, and pushing to the edge thrusts. The right half fires.
//
// Swap sides mirrors either layout for left-handers. In landscape the
// controls sit see-through over the bottom corners; in portrait they go in the
// space under the picture (main.js asks for that space with `reserved`).
// A quick tap anywhere starts a game (consumeStart). main.js calls layout()
// when the screen changes size.

const STORE_KEY = 'asteroids.touch';
const DEFAULTS = { mode: 'buttons', swap: false, autoFire: true, size: 1, opacity: 0.4 };

export class Touch {
  constructor(el) {
    this.el = el;
    this.settings = { ...DEFAULTS, ...load() };
    this.pointers = new Map(); // id -> { zone: 'turn'|'act'|'hyper', x, y, cx, cy, t }
    this.startTapped = false;
    this.seenTouch = false;
    this.state = { left: false, right: false, thrust: false, fire: false, hyper: false, aim: null };
    this.buildOverlay();
    this.bindEvents();
    this.applySettings();
  }

  get active() { return this.seenTouch; }

  read(into) {
    const s = this.state;
    for (const k of ['left', 'right', 'thrust', 'fire', 'hyper']) if (s[k]) into[k] = true;
    if (s.aim !== null) into.aim = s.aim;
  }

  /** Let go of everything (a new game, a menu opening). */
  release() { this.pointers.clear(); this.recompute(); }

  /** True once per tap (used for "tap to start"). */
  consumeStart() {
    const t = this.startTapped; this.startTapped = false; return t;
  }

  bindEvents() {
    const el = this.el;
    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (e.pointerType !== 'mouse' && !this.seenTouch) { this.seenTouch = true; this.applySettings(); }
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.pointers.set(e.pointerId, { zone: this.zoneAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, t: performance.now() });
      this.recompute();
    }, opts);
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      p.x = e.clientX; p.y = e.clientY;
      this.recompute();
    }, opts);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(ev, (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        this.pointers.delete(e.pointerId);
        if (ev === 'pointerup' && performance.now() - p.t < 400) this.startTapped = true;
        this.recompute();
      }, opts);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.release());
  }

  /** Which control a finger landing at (x, y) belongs to. */
  zoneAt(x, y) {
    const h = this.geom.hyper, pad = this.geom.u * 0.25;
    if (x > h.x - pad && x < h.x + h.w + pad && y > h.y - pad && y < h.y + h.h + pad) return 'hyper';
    const left = x < this.el.clientWidth / 2;
    return left !== this.settings.swap ? 'turn' : 'act';
  }

  recompute() {
    const s = this.state, g = this.geom, stick = this.settings.mode === 'stick';
    s.left = s.right = s.thrust = s.fire = s.hyper = false;
    s.aim = null;
    this.stickAt = null;
    for (const p of this.pointers.values()) {
      if (p.zone === 'hyper') s.hyper = true;
      else if (p.zone === 'act') {
        // stick layout: the whole half fires; buttons: the nearer of thrust and fire
        if (stick || Math.abs(p.x - g.fireX) < Math.abs(p.x - g.thrustX)) s.fire = true; else s.thrust = true;
      } else if (stick) {
        const R = g.stickR;
        let dx = p.x - p.cx, dy = p.y - p.cy, d = Math.hypot(dx, dy);
        if (d > R) { p.cx = p.x - dx / d * R; p.cy = p.y - dy / d * R; dx = p.x - p.cx; dy = p.y - p.cy; d = R; } // the stick follows the thumb
        if (d > R * 0.25) s.aim = Math.atan2(dy, dx);
        if (d > R * 0.8) s.thrust = true;
        this.stickAt = { cx: p.cx, cy: p.cy, x: p.x, y: p.y };
      } else {
        const off = p.x - g.turnMid;
        if (Math.abs(off) > g.u * 0.1) { if (off < 0) s.left = true; else s.right = true; }
      }
    }
    if (s.left && s.right) s.left = s.right = false;
    this.paint();
  }

  // ---- visual side ----------------------------------------------------------

  buildOverlay() {
    const el = this.el;
    el.innerHTML = `
      <div class="tc-btn tc-left">&#9664;</div><div class="tc-btn tc-right">&#9654;</div>
      <div class="tc-btn tc-thrust">THRUST</div><div class="tc-btn tc-fire">FIRE</div>
      <div class="tc-btn tc-hyper">HYPER</div>
      <div class="tc-hint">drag to steer &middot; push to the edge to thrust</div>
      <div class="tc-ring"><div class="tc-knob"></div></div>
      <button class="tc-gear" type="button" aria-label="Settings"><svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 0h2v1h-2zM1 1h1v1h-1zM3 1h4v1h-4zM8 1h1v1h-1zM0 2h10v1h-10zM1 3h3v1h-3zM6 3h3v1h-3zM0 4h3v2h-3zM7 4h3v2h-3zM1 6h3v1h-3zM6 6h3v1h-3zM0 7h10v1h-10zM1 8h1v1h-1zM3 8h4v1h-4zM8 8h1v1h-1zM4 9h2v1h-2z"/></svg></button>
      <button class="tc-pause" type="button" aria-label="Pause"><svg viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="1" width="2" height="8"/><rect x="6" y="1" width="2" height="8"/></svg></button>
      <div class="tc-panel tc-menu" hidden>
        <h2>Paused</h2>
        <button class="tc-resume" type="button">Resume</button>
        <button class="tc-restart" type="button">Restart game</button>
        <button class="tc-quit" type="button">Quit to title</button>
      </div>
      <div class="tc-panel tc-settings" hidden>
        <h2>Settings</h2>
        <label>Players <select class="tc-opt" data-opt="players"><option value="1">1 player</option><option value="2">2 players (take turns)</option></select></label>
        <label>Ships per game <select class="tc-opt" data-opt="ships"><option value="3">3 (arcade)</option><option value="4">4 (arcade option)</option></select></label>
        <h3>Cheats</h3>
        <label>Game speed <select class="tc-opt" data-opt="speed"><option value="1">Normal (arcade)</option><option value="0.75">Slow</option><option value="0.5">Very slow</option></select></label>
        <label><input class="tc-opt" data-opt="unlimited" type="checkbox"> Unlimited ships</label>
        <label><input class="tc-opt" data-opt="shield" type="checkbox"> Ship can't be destroyed</label>
        <label><input class="tc-opt" data-opt="safeHyper" type="checkbox"> Hyperspace is always safe</label>
        <label><input class="tc-opt" data-opt="noSaucers" type="checkbox"> No saucers</label>
        <button class="tc-skip" type="button">Skip this wave</button>
        <p class="tc-note">Only games with no cheats set the high score.</p>
        <h3>Controls</h3>
        <label>Layout <select name="mode"><option value="buttons">Cabinet buttons</option><option value="stick">Steer with a stick</option></select></label>
        <label><input name="swap" type="checkbox"> Swap sides (left-handed)</label>
        <label><input name="autoFire" type="checkbox"> Keep firing while held</label>
        <label>Button size <input name="size" type="range" min="0.6" max="1.6" step="0.1"></label>
        <label>Opacity <input name="opacity" type="range" min="0.1" max="0.9" step="0.05"></label>
        <p class="tc-note">Keyboard: arrows turn and thrust, Space fires, down arrow or Shift is hyperspace.</p>
        <button class="tc-close" type="button">Done</button>
      </div>`;
    const q = (c) => el.querySelector(c);
    this.btns = { left: q('.tc-left'), right: q('.tc-right'), thrust: q('.tc-thrust'), fire: q('.tc-fire'), hyper: q('.tc-hyper') };
    this.hint = q('.tc-hint');
    this.ring = q('.tc-ring');
    this.knob = q('.tc-knob');
    this.panel = q('.tc-settings');
    this.menu = q('.tc-menu');
    this.gear = q('.tc-gear');
    this.pauseBtn = q('.tc-pause');
    // main.js hooks these
    this.onPanelToggle = null;
    this.onOption = null;
    this.onSkip = null;
    this.onPause = null;
    this.onRestart = null;
    this.onQuit = null;
    this.onLayout = null;
    this.optBoxes = [...el.querySelectorAll('.tc-opt')];
    for (const b of this.optBoxes) b.addEventListener('change', () => this.onOption?.(b.dataset.opt, b.type === 'checkbox' ? b.checked : Number(b.value)));
    q('.tc-skip').addEventListener('click', () => { this.onSkip?.(); this.openPanel(false); });
    const stop = (e) => e.stopPropagation();
    for (const n of [this.gear, this.panel, this.pauseBtn, this.menu]) for (const ev of ['pointerdown', 'pointerup', 'pointermove']) n.addEventListener(ev, stop);
    this.gear.addEventListener('click', () => this.openPanel(true));
    this.pauseBtn.addEventListener('click', () => this.onPause?.(true));
    q('.tc-resume').addEventListener('click', () => this.onPause?.(false));
    q('.tc-restart').addEventListener('click', () => this.onRestart?.());
    q('.tc-quit').addEventListener('click', () => this.onQuit?.());
    q('.tc-close').addEventListener('click', () => this.openPanel(false));
    this.panel.addEventListener('input', (e) => {
      const f = e.target;
      if (!f.name) return; // the game options and cheats go to main.js
      this.settings[f.name] = f.type === 'checkbox' ? f.checked : f.type === 'range' ? Number(f.value) : f.value;
      save(this.settings);
      this.release();
      this.applySettings();
    });
  }

  /** Show the game options and cheats as main.js has them. */
  setOptions(o) {
    for (const b of this.optBoxes) {
      const v = o[b.dataset.opt];
      if (b.type === 'checkbox') b.checked = !!v; else b.value = String(v);
    }
  }

  /** Main loop: whether a game is on (shows the pause button) and whether it's paused (shows the menu). */
  setPlayState(playing, paused) {
    this.el.classList.toggle('tc-playing', playing);
    const show = playing && paused && this.panel.hidden;
    if (this.menu.hidden === show) { this.menu.hidden = !show; this.release(); }
  }

  openPanel(open) {
    this.panel.hidden = !open;
    this.release();
    this.onPanelToggle?.(open);
  }

  applySettings() {
    const s = this.settings, el = this.el;
    for (const f of this.panel.querySelectorAll('[name]')) {
      if (f.type === 'checkbox') f.checked = !!s[f.name]; else f.value = String(s[f.name]);
    }
    el.style.setProperty('--tc-opacity', s.opacity);
    el.classList.toggle('tc-visible', this.active);
    el.dataset.mode = s.mode;
    this.layout();
    this.onLayout?.();
  }

  get portrait() { return this.el.clientHeight > this.el.clientWidth; }

  /** Geometry in window pixels, over the visible area main.js sized the stage to. */
  layout() {
    const Wd = this.el.clientWidth, Hd = this.el.clientHeight;
    const cs = getComputedStyle(document.documentElement);
    const inset = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    const sb = inset('--sat-b'), sl = inset('--sat-l'), sr = inset('--sat-r');
    const u = this.settings.size * Math.min(Wd, Hd) * 0.1;
    const b = 1.6 * u, gap = 0.3 * u, m = 0.5 * u;
    const by = Hd - sb - m - b;
    // laid out right-handed, then mirrored if the sides are swapped
    const flip = (x, w) => (this.settings.swap ? Wd - x - w : x);
    // (the turn pair keeps rotate left on the left, whichever side it's on)
    const [leftX, rightX] = [flip(sl + m, b), flip(sl + m + b + gap, b)].sort((x, y) => x - y);
    const fireX = flip(Wd - sr - m - b, b), thrustX = flip(Wd - sr - m - 2 * b - gap, b);
    const hyper = { w: 1.6 * u, h: 0.8 * u };
    hyper.x = (fireX + thrustX + b) / 2 - hyper.w / 2;
    hyper.y = by - 0.6 * u - hyper.h;
    this.geom = { u, b, by, hyper, turnMid: (leftX + rightX + b) / 2, fireX: fireX + b / 2, thrustX: thrustX + b / 2, stickR: 1.1 * u };
    const place = (n, x, y, w, h, font) => { const s = n.style; s.left = `${x}px`; s.top = `${y}px`; s.width = `${w}px`; s.height = `${h}px`; s.fontSize = `${font}px`; };
    place(this.btns.left, leftX, by, b, b, u * 0.6);
    place(this.btns.right, rightX, by, b, b, u * 0.6);
    place(this.btns.thrust, thrustX, by, b, b, u * 0.3);
    place(this.btns.fire, fireX, by, b, b, u * 0.36);
    place(this.btns.hyper, hyper.x, hyper.y, hyper.w, hyper.h, u * 0.3);
    place(this.hint, flip(sl + m, 3.5 * b), by, 3.5 * b, b, Math.max(12, u * 0.22));
    const r = this.geom.stickR * 2;
    this.ring.style.width = this.ring.style.height = `${r}px`;
    this.el.classList.toggle('tc-portrait', this.portrait);
    this.paint();
  }

  paint() {
    const s = this.state;
    for (const k in this.btns) this.btns[k].classList.toggle('on', s[k]);
    const a = this.stickAt;
    this.el.classList.toggle('tc-sticking', !!a);
    if (a) {
      const R = this.geom.stickR;
      this.ring.style.transform = `translate(${a.cx - R}px, ${a.cy - R}px)`;
      this.knob.style.transform = `translate(${a.x - a.cx}px, ${a.y - a.cy}px)`;
    }
  }

  /** The height at the bottom of the screen the controls take up (for portrait layout). */
  get reserved() {
    if (!this.active || !this.portrait) return 0;
    return this.el.clientHeight - (this.geom.hyper.y - this.geom.u * 0.4);
  }
}

function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode / quota */ } }

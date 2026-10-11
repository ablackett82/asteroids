// Gamepad API: d-pad or left stick left/right to turn, up (or B) to thrust, A
// or X to fire, down, Y or a shoulder button for hyperspace; Start starts a game.
export class Gamepad {
  constructor() { this.startPressed = false; this.lastButtons = 0; this.any = false; }
  read(into) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let buttons = 0;
    this.any = false;
    for (const p of pads) {
      if (!p) continue;
      const b = p.buttons, on = (...i) => i.some((n) => b[n]?.pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const st = {
        left: on(14) || ax < -0.4, right: on(15) || ax > 0.4,
        thrust: on(12, 1) || ay < -0.5, fire: on(0, 2), hyper: on(13, 3, 4, 5) || ay > 0.7,
      };
      for (const k in st) if (st[k]) { into[k] = true; this.any = true; }
      for (let i = 0; i < b.length; i++) if (b[i]?.pressed) buttons |= 1 << i;
    }
    const fresh = buttons & ~this.lastButtons;
    this.startPressed = !!(fresh & (1 << 9));
    if (fresh) this.any = true;
    this.lastButtons = buttons;
  }
}

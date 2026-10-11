// Sound. The cabinet's sounds come from analogue circuits (the explosions and
// thrust are filtered noise, the saucer a warbling tone, the heartbeat two low
// thumps); these are synthesized stand-ins for them.

// [seconds, noise cutoff Hz, the low thud under it: start Hz, or 0 for none]
const BANGS = { bang3: [1.1, 320, 110], bang2: [0.8, 520, 150], bang1: [0.5, 900, 0], die: [1.6, 380, 90] };

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  /** Must be called from a user gesture on iOS. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.out = c.createGain();
      this.out.gain.value = this.muted ? 0 : 0.3;
      this.out.connect(c.destination);
      // one second of white noise, for the bangs and the thrust
      this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startLoops();
    }
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.ctx.resume().catch(() => {});
  }

  setMuted(on) {
    this.muted = on;
    if (this.out) this.out.gain.value = on ? 0 : 0.3;
  }

  get ready() { return this.ctx && this.ctx.state === 'running'; }

  /** The game's events from the frames just run. */
  play(events) {
    if (!this.ready) return;
    for (const e of new Set(events)) {
      if (BANGS[e]) this.bang(...BANGS[e]);
      else if (e === 'fire') this.pew(1400, 0.15);
      else if (e === 'sfire') this.pew(1900, 0.12);
      else if (e === 'beat1') this.thump(52);
      else if (e === 'beat2') this.thump(46);
      else if (e === 'extra') this.extra();
    }
  }

  /** The continuous sounds: thrust on or off, the saucer ('big', 'small' or null). */
  hold(thrust, saucer) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.thrustGain.gain.setTargetAtTime(thrust ? 0.9 : 0, t, 0.03);
    this.saucerGain.gain.setTargetAtTime(saucer ? 0.12 : 0, t, 0.02);
    if (saucer) {
      const small = saucer === 'small';
      this.saucerOsc.frequency.setTargetAtTime(small ? 1000 : 520, t, 0.02);
      this.lfo.frequency.setTargetAtTime(small ? 9 : 5, t, 0.02);
      this.lfoGain.gain.setTargetAtTime(small ? 250 : 140, t, 0.02);
    }
  }

  startLoops() {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    this.thrustGain = c.createGain(); this.thrustGain.gain.value = 0;
    n.connect(lp).connect(this.thrustGain).connect(this.out);
    n.start();
    this.saucerOsc = c.createOscillator();
    this.saucerOsc.type = 'square';
    this.lfo = c.createOscillator();
    this.lfo.type = 'triangle';
    this.lfoGain = c.createGain();
    this.lfo.connect(this.lfoGain).connect(this.saucerOsc.frequency);
    this.saucerGain = c.createGain(); this.saucerGain.gain.value = 0;
    this.saucerOsc.connect(this.saucerGain).connect(this.out);
    this.saucerOsc.start(); this.lfo.start();
  }

  /** An explosion: filtered noise falling darker, over a low thud that drops in pitch. */
  bang(dur, cutoff, boom) {
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const lp = c.createBiquadFilter(), lp2 = c.createBiquadFilter();
    lp.type = lp2.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(cutoff / 6, t + dur);
    lp2.frequency.value = cutoff * 1.5;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.001, t);
    gn.gain.exponentialRampToValueAtTime(2.6, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(lp).connect(lp2).connect(gn).connect(this.out);
    n.start(t, Math.random() * 0.4); n.stop(t + dur + 0.05);
    if (!boom) return;
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(boom, t);
    o.frequency.exponentialRampToValueAtTime(30, t + dur * 0.6);
    og.gain.setValueAtTime(0.001, t);
    og.gain.exponentialRampToValueAtTime(1.1, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    o.connect(og).connect(this.out);
    o.start(t); o.stop(t + dur);
  }

  pew(hz, dur) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz / 5, t + dur);
    gn.gain.setValueAtTime(0.25, t);
    gn.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(gn).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** A heartbeat note: a soft, low thud, sagging a little in pitch, with the edges taken off. */
  thump(hz) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), lp = c.createBiquadFilter(), gn = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.8, t + 0.16);
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    gn.gain.setValueAtTime(0.001, t);
    gn.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(lp).connect(gn).connect(this.out);
    o.start(t); o.stop(t + 0.2);
  }

  extra() {
    const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 10; i++) {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'square';
      o.frequency.value = 2900;
      const s = t + i * 0.1;
      gn.gain.setValueAtTime(0.12, s);
      gn.gain.setValueAtTime(0, s + 0.05);
      o.connect(gn).connect(this.out);
      o.start(s); o.stop(s + 0.06);
    }
  }
}

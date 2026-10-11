# Asteroids

A browser reimplementation of Atari's 1979 arcade game, built to run
fullscreen on an iPad as a home-screen app. Plain HTML/JS, no build step.
It is played in the [Arcade](https://ablackett82.github.io/arcade/).

The cabinet draws with a beam on a vector monitor rather than in pixels, so
this does too: the game is turned into a list of lines each frame and stroked
onto the canvas at the screen's full resolution, with a soft glow. It follows
the cabinet's documented rules rather than tracing its 6502 program:

- waves of 4, 6, 8, 10 and then 11 large rocks, coming in from the edges
- large rocks split into two medium, medium into two small, for 20, 50 and
  100 points; at most 26 rocks on screen, after which a hit rock just goes
- the ship turns, thrusts, drifts slowly to a stop, wraps round the screen,
  and has at most 4 shots in flight
- hyperspace drops the ship somewhere at random, and now and then it blows up
  (more often with more rocks about)
- the big saucer (200) fires anywhere; the small one (1000) aims at you, better
  as your score climbs, and from 40,000 only small saucers come. The longer a
  wave lasts, the sooner the next saucer arrives
- crashing into a rock still scores it
- 3 ships (4 as an operator option), an extra ship every 10,000, and the score
  rolls over at 100,000 like the cabinet's five digits
- two players take turns, each with their own rocks
- the heartbeat gets faster as a wave goes on

Speeds, timings, shapes and sounds are close stand-ins, not measurements of
the hardware. The title screen is an attract mode with the rocks drifting and
saucers passing through.

## Play

Open the site, then on iPad: Share → **Add to Home Screen**. Tap to start.

Touch, two layouts (settings, the cog):

- **Cabinet buttons** (default): the cabinet's five buttons. Bottom left,
  rotate left ◀ and rotate right ▶. Bottom right, THRUST (inner) and FIRE
  (outer), with HYPER above them, smaller, so it isn't hit by accident. The
  left half of the screen is for turning and the right half for thrust/fire;
  the nearer button wins, so a thumb can slide between them without lifting.
- **Steer with a stick**: the left thumb drags a stick that appears where it
  lands. The ship turns to face where you point (at the cabinet's turning
  speed) and thrusts when you push to the edge. The right half fires; HYPER
  is where it always is.

**Swap sides** mirrors either layout for left-handers. In landscape the
buttons sit see-through over the bottom corners; in portrait they go in the
space under the picture. **Keep firing while held** (on by default) fires
every few frames while FIRE is down; off, it's one shot per press as on the
cabinet. The pause button beside the cog has Resume / Restart game / Quit to
title.

Keyboard: left/right (or A D) turn, up (W) thrusts, Space (Z) fires, down
(S, Shift) is hyperspace; Space / Enter / 1 starts a one-player game, 2 a
two-player game; P pause, M mute, F fullscreen, Esc back to the title.
Gamepad: d-pad or stick to turn, up or B thrusts, A or X fires, down, Y or a
shoulder button is hyperspace, Start starts.

Cheats, in the settings or from the keyboard. Only games with no cheats set
the high score:

- Game speed (C): Normal, Slow (75%), Very slow (50%)
- Unlimited ships (L)
- Ship can't be destroyed (V)
- Hyperspace is always safe (Y)
- No saucers (U)
- Skip this wave (K)

## Develop

```
npm run dev     # http://localhost:8080/  (PORT=8091 npm run dev for another port)
npm test
```

`node tools/icons.mjs` redraws the home-screen icons;
`node tools/shot.mjs out.png [frames] [play|demo|2p]` renders a frame to PNG.
Bump `VERSION` in `sw.js` when anything changes so installed copies update.

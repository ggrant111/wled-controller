/**
 * Skipping Rock Effect — Cinematic Water (No-bounce ripples + soft-add)
 * - Ripples stop at ends (no reflection)
 * - Soft-add blending to prevent white washout on overlap
 * - Safe number parsing + time normalization
 * - Subpixel rock with AA head & exponential tail
 */

import { EffectGenerator } from './helpers/effectUtils';
import { hsvToRgb, RGBColor } from './helpers/colorUtils';
import { getColorsFromParams, getPalette } from './helpers/paletteUtils';

type Ripple = {
  left:  { x: number; v: number; active: boolean };
  right: { x: number; v: number; active: boolean };
  amp: number;        // amplitude
  sigma0: number;     // base thickness
  bornAt: number;     // seconds
  color: RGBColor;
  dead?: boolean;
};

type State = {
  prev: Uint8Array;
  lastT: number;            // seconds

  paletteColors: RGBColor[];
  paletteT: number;

  // Rock
  rockX: number;            // px
  rockV: number;            // px/s

  // Skip distance model
  distSinceSkip: number;    // px
  meanSkipDist: number;     // px
  nextSkipAtDist: number;   // px

  // Impact flash
  lastImpactX: number;
  flashUntil: number;       // seconds

  ripples: Ripple[];

  // temporal blend
  prevOut?: Uint8Array;
};

/* ----------------------- helpers ----------------------- */

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function expSample(mean: number) { const u = Math.max(1e-6, 1 - Math.random()); return -Math.log(u) * mean; }
function num(params: Map<string, any>, key: string, def: number): number {
  const raw = params.get(key);
  const v = Number(raw);
  return Number.isFinite(v) ? v : def;
}
function num01(params: Map<string, any>, key: string, def: number): number { return clamp01(num(params, key, def)); }

/** Soft-add channel to avoid washout; saturates as value approaches limit */
function softAdd(base: number, add: number, limit: number, k: number): number {
  const head = limit - base;
  if (head <= 0) return base;
  const inc = Math.min(head, add * (head / limit) * k);
  return base + inc;
}

function samplePaletteContinuous(colors: RGBColor[], t: number): RGBColor {
  if (colors.length === 0) return { r: 255, g: 255, b: 255 };
  if (colors.length === 1) return colors[0];
  const x = clamp01(t) * (colors.length - 1);
  const i = Math.floor(x);
  const j = Math.min(colors.length - 1, i + 1);
  const f = x - i;
  return {
    r: Math.round(lerp(colors[i].r, colors[j].r, f)),
    g: Math.round(lerp(colors[i].g, colors[j].g, f)),
    b: Math.round(lerp(colors[i].b, colors[j].b, f))
  };
}

/* ----------------------- effect ----------------------- */

export class SkippingRockEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();

  private key(N: number, instanceKey?: string) { return `${N}:${instanceKey || 'default'}`; }
  private rand(min: number, max: number) { return Math.random() * (max - min) + min; }

  clearState(instanceKey?: string): void {
    if (instanceKey) {
      const del: string[] = [];
      this.stateByKey.forEach((_, k) => { if (k.endsWith(`:${instanceKey}`)) del.push(k); });
      del.forEach(k => this.stateByKey.delete(k));
    } else {
      this.stateByKey.clear();
    }
  }

  private initState(N: number, tSec: number, params: Map<string, any>): State {
    const pal = getPalette(params);
    const paletteColors = pal
      ? pal.colors.map(hex => ({ r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) } as RGBColor))
      : getColorsFromParams(params, '#ffffff');

    const rockSpeed = Math.max(20, num(params, 'rockSpeed', 180));
    const dir = Math.random() < 0.5 ? 1 : -1;
    const meanSkipDist = Math.max(10, num(params, 'meanSkipDist', 70));

    return {
      prev: new Uint8Array(N * 3),
      lastT: tSec,
      paletteColors,
      paletteT: Math.random(),

      rockX: Math.random() * (N - 1),
      rockV: dir * rockSpeed,

      distSinceSkip: 0,
      meanSkipDist,
      nextSkipAtDist: expSample(meanSkipDist),

      lastImpactX: Math.round((N - 1) / 2),
      flashUntil: -1,

      ripples: [],
      prevOut: undefined
    };
  }

  private spawnRipple(st: State, N: number, origin: number, params: Map<string, any>, nowSec: number): void {
    const rippleSpeed = Math.max(20, num(params, 'rippleSpeed', 260));   // px/s
    const sigma0      = Math.max(0.6, num(params, 'rippleSigma', 1.4));
    const maxRipples  = Math.max(1, num(params, 'maxRipples', 16));

    const useCycle = (params.get('usePaletteCycle') ?? true) as boolean;
    if (useCycle) {
      const step = num(params, 'paletteShiftPerSkip', 0.18);
      st.paletteT = (st.paletteT + step) % 1;
    } else {
      st.paletteT = Math.random();
    }
    const color = samplePaletteContinuous(st.paletteColors, st.paletteT);

    if (st.ripples.length >= maxRipples) st.ripples.shift();

    const x0 = Math.max(0, Math.min(N - 1, Math.round(origin)));
    st.ripples.push({
      left:  { x: x0, v: -rippleSpeed, active: true },
      right: { x: x0, v:  rippleSpeed, active: true },
      amp: 1.0,
      sigma0,
      bornAt: nowSec,
      color
    });
  }

  /** Ripples move; they STOP (no reflection) when reaching ends; die when both ends reached or amplitude fades. */
  private updateRipples(st: State, N: number, dt: number, _now: number, params: Map<string, any>): void {
    const dampPerSec  = num01(params, 'rippleDampPerSec', 0.85);
    const deathThresh = Math.max(0.001, num(params, 'rippleDeathThreshold', 0.03));

    for (const r of st.ripples) {
      if (r.left.active)  { r.left.x  += r.left.v  * dt; if (r.left.x  <= 0)     { r.left.x  = 0;     r.left.active  = false; } }
      if (r.right.active) { r.right.x += r.right.v * dt; if (r.right.x >= N - 1) { r.right.x = N - 1; r.right.active = false; } }

      r.amp *= Math.pow(dampPerSec, dt);
      r.dead = (!r.left.active && !r.right.active) || r.amp < deathThresh;
    }
    st.ripples = st.ripples.filter(r => !r.dead);
  }

  /** Soft-add ripple rendering; guards against washout when many overlap */
  private renderRipples(buf: Uint8Array, st: State, N: number, _timeSec: number, params: Map<string, any>): void {
    if (st.ripples.length === 0) return;

    const additive         = (params.get('additive') ?? true) as boolean; // still honored if you want MAX instead
    const dispersionK      = Math.max(0, num(params, 'dispersion', 0.012));
    const rangeFalloffK    = Math.max(0, num(params, 'rangeFalloff', 0.18));
    const rippleBrightness = Math.max(0.1, num(params, 'rippleBrightness', 1.0));

    // Soft-add controls
    const softLimit        = Math.max(32, num(params, 'softLimit', 220)); // channel cap
    const softK            = Math.max(0.2, num(params, 'softK', 1.0));    // softness factor

    for (const r of st.ripples) {
      const leftActive = r.left.active;
      const rightActive = r.right.active;

      // distance between fronts (linear strip)
      const dist = Math.abs(r.right.x - r.left.x);
      const mid  = dist * 0.5;

      const sigma0 = Number.isFinite(r.sigma0) && r.sigma0 > 0 ? r.sigma0 : 1.4;
      const sigma  = Math.max(0.6, sigma0 + dispersionK * mid);
      const sigma2 = 2 * sigma * sigma;

      for (let i = 0; i < N; i++) {
        let aL = 0, aR = 0;
        if (leftActive) {
          const dl = i - r.left.x;
          aL = Math.exp(-(dl * dl) / sigma2);
        }
        if (rightActive) {
          const dr = i - r.right.x;
          aR = Math.exp(-(dr * dr))/ sigma2;
        }

        if (aL === 0 && aR === 0) continue;

        // 1/sqrt(r) attenuation relative to each front (bounded)
        // (Only apply to active sides)
        let atten = 1;
        if (leftActive) {
          const rl = Math.max(1, Math.abs(i - r.left.x));
          atten *= 1 / Math.sqrt(1 + rangeFalloffK * rl);
        }
        if (rightActive) {
          const rr = Math.max(1, Math.abs(i - r.right.x));
          atten *= 1 / Math.sqrt(1 + rangeFalloffK * rr);
        }

        let a = (aL + aR) * r.amp * atten * rippleBrightness * 8.0;
        if (!(a > 1e-5)) continue;

        const idx = i * 3, c = r.color;
        const addR = Math.round(c.r * a);
        const addG = Math.round(c.g * a);
        const addB = Math.round(c.b * a);

        if (additive) {
          // Soft-add per channel to avoid white-out
          buf[idx]     = Math.min(255, softAdd(buf[idx],     addR, softLimit, softK));
          buf[idx + 1] = Math.min(255, softAdd(buf[idx + 1], addG, softLimit, softK));
          buf[idx + 2] = Math.min(255, softAdd(buf[idx + 2], addB, softLimit, softK));
        } else {
          // MAX blend
          buf[idx]     = Math.max(buf[idx],     addR);
          buf[idx + 1] = Math.max(buf[idx + 1], addG);
          buf[idx + 2] = Math.max(buf[idx + 2], addB);
        }
      }
    }
  }

  private addAA(buf: Uint8Array, pos: number, rgb: RGBColor, mag: number) {
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const w0 = 1 - frac, w1 = frac;
    if (i0 >= 0 && i0 * 3 + 2 < buf.length) {
      const k = i0 * 3;
      buf[k]     = Math.min(255, buf[k]     + Math.round(rgb.r * mag * w0));
      buf[k + 1] = Math.min(255, buf[k + 1] + Math.round(rgb.g * mag * w0));
      buf[k + 2] = Math.min(255, buf[k + 2] + Math.round(rgb.b * mag * w0));
    }
    const i1 = i0 + 1;
    if (i1 >= 0 && i1 * 3 + 2 < buf.length) {
      const k = i1 * 3;
      buf[k]     = Math.min(255, buf[k]     + Math.round(rgb.r * mag * w1));
      buf[k + 1] = Math.min(255, buf[k + 1] + Math.round(rgb.g * mag * w1));
      buf[k + 2] = Math.min(255, buf[k + 2] + Math.round(rgb.b * mag * w1));
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const N = ledCount | 0;
    if (N <= 0) return Buffer.alloc(0);

    // Normalize time to seconds (handles ms or s input)
    const tSecRaw = time > 200 ? time / 1000 : time;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in seconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_SEC = 3600; // 1 hour in seconds
    const tSec = tSecRaw % TIME_WRAP_SEC;

    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.key(N, instanceKey as string);

    let st = this.stateByKey.get(key);
    if (!st) { st = this.initState(N, tSec, params); this.stateByKey.set(key, st); }
    if (st.prev.length !== N * 3) { st = this.initState(N, tSec, params); this.stateByKey.set(key, st); }

    // Normalize stored times when time wraps to keep comparisons valid
    const currentWrapBase = Math.floor(tSecRaw / TIME_WRAP_SEC) * TIME_WRAP_SEC;
    const lastWrapBase = Math.floor((st.lastT + TIME_WRAP_SEC) / TIME_WRAP_SEC - 1) * TIME_WRAP_SEC;
    if (currentWrapBase > lastWrapBase) {
      // Time wrapped, normalize stored times
      if (st.flashUntil > 0) st.flashUntil = st.flashUntil % TIME_WRAP_SEC;
      // Normalize ripple bornAt times
      for (const r of st.ripples) {
        if (r.bornAt > 0) r.bornAt = r.bornAt % TIME_WRAP_SEC;
      }
    }

    // ---- params ----
    const bgFade        = num01(params, 'backgroundFade', 0.94);
    const gamma         = Math.max(0.8, num(params, 'gamma', 2.2));
    const temporalBlend = num01(params, 'temporalBlend', 0.0);
    const neighborGlow  = num01(params, 'neighborGlow', 0.0);
    const powerLimit    = num01(params, 'powerLimit', 1.0);
    const additive      = (params.get('additive') ?? true) as boolean;

    // rock shape/dynamics
    const rockWidth     = Math.max(1, num(params, 'rockWidth', 6));
    const rockTrail     = num01(params, 'rockTrail', 0.85);
    const rockBright    = num01(params, 'rockBrightness', 1.0);
    const rockHueParam  = params.get('rockHue');
    const desiredSpeed  = Math.max(20, num(params, 'rockSpeed', 180));
    const elasticity    = num01(params, 'elasticity', 0.78) || 0.78;
    const meanSkipDist  = Math.max(10, num(params, 'meanSkipDist', st.meanSkipDist)); st.meanSkipDist = meanSkipDist;

    // base buffer
    const work = new Uint8Array(N * 3);
    for (let i = 0; i < N * 3; i++) work[i] = (st.prev[i] * bgFade) | 0;

    // time step - handle wrap-around correctly
    let dt: number;
    if (st.lastT > 0) {
      const unwrappedDt = Math.max(0, tSecRaw - st.lastT);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 0.1); // Max 100ms delta
    } else {
      dt = 0.016; // Default frame time (16ms)
    }
    st.lastT = tSecRaw; // Store unwrapped for next frame's dt calculation

    if (!Number.isFinite(st.rockV)) st.rockV = (st.rockV >= 0 ? 1 : -1) * desiredSpeed;

    // move rock
    st.rockX += st.rockV * dt;

    // rock bounces (only the rock)
    let bounced = false;
    const hitLeft  = st.rockX < 0;
    const hitRight = st.rockX >= N;

    if (hitLeft || hitRight) {
      bounced = true;

      if (!Number.isFinite(st.rockV)) st.rockV = (hitLeft ? 1 : -1) * desiredSpeed;

      if (hitLeft) {
        const overshoot = -st.rockX;
        st.rockX = overshoot;
        st.rockV = Math.abs(st.rockV) * elasticity; // rightward
      } else {
        const overshoot = st.rockX - (N - 1);
        st.rockX = (N - 1) - overshoot;
        st.rockV = -Math.abs(st.rockV) * elasticity; // leftward
      }

      st.rockX = Math.max(0, Math.min(N - 1, st.rockX));

      // minimum velocity to avoid stall
      const minVel = Math.max(30, desiredSpeed * 0.2);
      if (Math.abs(st.rockV) < minVel || !Number.isFinite(st.rockV)) {
        st.rockV = (st.rockV >= 0 ? 1 : -1) * minVel;
      }

      st.distSinceSkip = 0;
      st.nextSkipAtDist = expSample(meanSkipDist);
      st.lastImpactX = Math.round(Math.max(0, Math.min(N - 1, st.rockX)));
      st.flashUntil = (tSec + num(params, 'skipHoldMs', 45) / 1000) % TIME_WRAP_SEC;

      // spawn ripple at wall (it will propagate out and die at ends)
      this.spawnRipple(st, N, st.lastImpactX, params, tSec);
    }

    if (!bounced) st.rockX = Math.max(0, Math.min(N - 1, st.rockX));

    // gentle speed restore
    if (!bounced) {
      const dir = st.rockV >= 0 ? 1 : -1;
      const spd = Math.abs(st.rockV);
      if (spd < desiredSpeed * 0.95) {
        const restoreRate = 0.12;
        st.rockV = dir * Math.min(desiredSpeed, spd + (desiredSpeed - spd) * restoreRate);
      } else if (spd > desiredSpeed * 1.05) {
        st.rockV = dir * desiredSpeed;
      }
    }

    if (!Number.isFinite(st.rockV) || Math.abs(st.rockV) < Math.max(1, desiredSpeed * 0.1)) {
      const dir = st.rockV >= 0 || !Number.isFinite(st.rockV) ? 1 : -1;
      st.rockV = dir * Math.max(desiredSpeed * 0.3, 30);
    }

    // internal skip
    st.distSinceSkip += Math.abs(st.rockV) * dt;
    if (st.distSinceSkip >= st.nextSkipAtDist) {
      st.distSinceSkip = 0;
      st.nextSkipAtDist = expSample(meanSkipDist);
      const origin = Math.round(st.rockX);
      this.spawnRipple(st, N, origin, params, tSec);
      st.lastImpactX = origin;
      st.flashUntil = (tSec + num(params, 'skipHoldMs', 45) / 1000) % TIME_WRAP_SEC;

      // slight energy loss on skip
      st.rockV *= 0.92;
      const minVelAfterSkip = Math.max(30, desiredSpeed * 0.25);
      if (Math.abs(st.rockV) < minVelAfterSkip) st.rockV = (st.rockV >= 0 ? 1 : -1) * minVelAfterSkip;
    }

    // ripples: move (no bounce), render with soft-add
    this.updateRipples(st, N, dt, tSec, params);
    this.renderRipples(work, st, N, tSec, params);

    // rock render (AA head + exponential tail)
    const rockRGB: RGBColor =
      rockHueParam === null || rockHueParam === undefined
        ? samplePaletteContinuous(st.paletteColors, st.paletteT)
        : hsvToRgb(Number(rockHueParam), 1.0, rockBright);

    const halfW = Math.max(1, rockWidth / 2);
    const tailPersist = rockTrail;

    this.addAA(work, st.rockX, rockRGB, rockBright);

    const maxSpan = Math.ceil(halfW * 3);
    for (let i = Math.max(0, Math.floor(st.rockX) - maxSpan); i <= Math.min(N - 1, Math.ceil(st.rockX) + maxSpan); i++) {
      const d = Math.abs(i - st.rockX);
      const core = Math.max(0, 1 - d / halfW);
      const tail = Math.pow(tailPersist, d);
      const a = Math.max(core, 0.6 * tail) * rockBright * 0.85;
      if (a > 1e-3) {
        const idx = i * 3;
        if (additive) {
          work[idx]     = Math.min(255, work[idx]     + Math.round(rockRGB.r * a));
          work[idx + 1] = Math.min(255, work[idx + 1] + Math.round(rockRGB.g * a));
          work[idx + 2] = Math.min(255, work[idx + 2] + Math.round(rockRGB.b * a));
        } else {
          work[idx]     = Math.max(work[idx],     Math.round(rockRGB.r * a));
          work[idx + 1] = Math.max(work[idx + 1], Math.round(rockRGB.g * a));
          work[idx + 2] = Math.max(work[idx + 2], Math.round(rockRGB.b * a));
        }
      }
    }

    // impact flash (subtle white) - handle time comparison with wrap-around
    if (st.flashUntil > 0) {
      const timeSinceFlash = (tSec >= st.flashUntil)
        ? (tSec - st.flashUntil)
        : (tSec + TIME_WRAP_SEC - st.flashUntil);
      
      if (timeSinceFlash >= 0 && timeSinceFlash <= (num(params, 'skipHoldMs', 45) / 1000)) {
      const k = st.lastImpactX * 3;
      if (k >= 0 && k + 2 < work.length) {
        const flash = 180;
        work[k]     = Math.min(255, work[k]     + flash);
        work[k + 1] = Math.min(255, work[k + 1] + flash);
        work[k + 2] = Math.min(255, work[k + 2] + flash);
      }
      }
    }

    // neighbor glow (small blur)
    if (neighborGlow > 0) {
      const a = neighborGlow * 0.5, b = 1 - 2 * a;
      const r2 = new Uint8Array(N), g2 = new Uint8Array(N), b2 = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < N - 1 ? i + 1 : i;
        const i3 = i * 3, L3 = L * 3, R3 = R * 3;
        r2[i] = Math.min(255, Math.round(a * work[L3] + b * work[i3] + a * work[R3]));
        g2[i] = Math.min(255, Math.round(a * work[L3 + 1] + b * work[i3 + 1] + a * work[R3 + 1]));
        b2[i] = Math.min(255, Math.round(a * work[L3 + 2] + b * work[i3 + 2] + a * work[R3 + 2]));
      }
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        work[k] = r2[i]; work[k + 1] = g2[i]; work[k + 2] = b2[i];
      }
    }

    // power limit
    if (powerLimit < 1.0) for (let i = 0; i < work.length; i++) work[i] = Math.floor(work[i] * powerLimit);

    // gamma out
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      const v = Math.pow(work[i] / 255, 1 / gamma) * 255;
      out[i] = (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
    }

    st.prev = work;
    st.prevOut = new Uint8Array(out);
    this.stateByKey.set(key, st);
    return out;
  }
}

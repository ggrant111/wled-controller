/**
 * Shockwave Dual — Cinematic
 * - Random meet point & intervals (configurable)
 * - Anti-aliased traveling heads with velocity-shaped trails
 * - Multi-ring explosion with dispersion + chroma shift
 * - Optional temporal blend and power limit
 */

import { EffectGenerator } from './helpers/effectUtils';
import { hsvToRgb, RGBColor } from './helpers/colorUtils';

type Phase = 'REST' | 'TRAVEL' | 'HOLD' | 'EXPLODE';

type State = {
  phase: Phase;
  phaseStart: number;  // seconds
  phaseEnd: number;    // seconds
  meetIdx: number;
  travelTimeL: number;
  travelTimeR: number;
  travelTime: number;
  holdTime: number;
  explodeLen: number;  // seconds
  explodeT0: number;   // seconds
  prev: Uint8Array;    // previous linear-ish frame
  lastTime: number;    // seconds
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(x: number) { return 1 - Math.pow(1 - x, 3); }
function easeInCubic(x: number)  { return Math.pow(x, 3); }

export class ShockwaveDualEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();
  private prevFrameByKey: Map<string, Uint8Array> = new Map();

  private keyFor(N: number, instanceKey?: string): string {
    return `${N}:${instanceKey || 'default'}`;
  }

  private rand(min: number, max: number) { return Math.random() * (max - min) + min; }

  private pickMeetIdx(N: number, minMeet: number, maxMeet: number): number {
    const lo = Math.max(0, Math.min(1, Math.min(minMeet, maxMeet)));
    const hi = Math.max(0, Math.min(1, Math.max(minMeet, maxMeet)));
    const pos = this.rand(lo, hi);
    return Math.max(0, Math.min(N - 1, Math.round(pos * (N - 1))));
  }

  private newCycleState(
    N: number,
    now: number,
    speedPx: number,
    minMeet: number,
    maxMeet: number,
    restMin: number,
    restMax: number,
    holdMin: number,
    holdMax: number,
    asymmetry: number,
    explodeSecondsPerHalf: number
  ): State {
    const meetIdx = this.pickMeetIdx(N, minMeet, maxMeet);
    const leftDist  = meetIdx - 0;
    const rightDist = (N - 1) - meetIdx;

    // slight velocity asymmetry for natural arrival
    const vL = speedPx * (1 + asymmetry *  0.5);
    const vR = speedPx * (1 + asymmetry * -0.5);

    const travelTimeL = leftDist  / Math.max(1e-6, vL);
    const travelTimeR = rightDist / Math.max(1e-6, vR);
    const travelTime  = Math.max(travelTimeL, travelTimeR);

    const hold = this.rand(holdMin, holdMax);
    const rest = this.rand(restMin, restMax);

    return {
      phase: 'REST',
      phaseStart: now,
      phaseEnd: now + rest,
      meetIdx,
      travelTimeL,
      travelTimeR,
      travelTime,
      holdTime: hold,
      explodeLen: explodeSecondsPerHalf, // time for wave radius to reach half strip
      explodeT0: 0,
      prev: new Uint8Array(N * 3),
      lastTime: now
    };
  }

  private advancePhase(
    st: State,
    N: number,
    now: number,
    speedPx: number,
    params: {
      minMeet: number; maxMeet: number;
      restMin: number; restMax: number;
      holdMin: number; holdMax: number;
      asymmetry: number;
      explodeSecondsPerHalf: number;
    }
  ): void {
    if (st.phase === 'REST') {
      st.phase = 'TRAVEL';
      st.phaseStart = st.phaseEnd;
      st.phaseEnd = st.phaseStart + st.travelTime;
      return;
    }
    if (st.phase === 'TRAVEL') {
      st.phase = 'HOLD';
      st.phaseStart = st.phaseEnd;
      st.phaseEnd = st.phaseStart + st.holdTime;
      return;
    }
    if (st.phase === 'HOLD') {
      st.phase = 'EXPLODE';
      st.explodeT0 = st.phaseEnd;
      st.phaseStart = st.phaseEnd;
      st.phaseEnd = st.phaseStart + st.explodeLen;
      return;
    }
    if (st.phase === 'EXPLODE') {
      const next = this.newCycleState(
        N, st.phaseEnd, speedPx,
        params.minMeet, params.maxMeet,
        params.restMin, params.restMax,
        params.holdMin, params.holdMax,
        params.asymmetry,
        params.explodeSecondsPerHalf
      );
      next.prev = st.prev;
      next.lastTime = st.phaseEnd;
      Object.assign(st, next);
      return;
    }
  }

  // Anti-aliased add with weights (values in 0..255)
  private addAA(buf: Uint8Array, iFloat: number, rgb: RGBColor, magnitude: number) {
    const i0 = Math.floor(iFloat);
    const frac = iFloat - i0;
    const w0 = 1 - frac;
    const w1 = frac;
    if (i0 >= 0 && i0 * 3 + 2 < buf.length) {
      const idx = i0 * 3;
      buf[idx]     = Math.min(255, buf[idx]     + Math.round(rgb.r * magnitude * w0));
      buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(rgb.g * magnitude * w0));
      buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(rgb.b * magnitude * w0));
    }
    const i1 = i0 + 1;
    if (i1 >= 0 && i1 * 3 + 2 < buf.length) {
      const idx = i1 * 3;
      buf[idx]     = Math.min(255, buf[idx]     + Math.round(rgb.r * magnitude * w1));
      buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(rgb.g * magnitude * w1));
      buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(rgb.b * magnitude * w1));
    }
  }

  private drawGlow(buf: Uint8Array, center: number, N: number, rgb: RGBColor, radiusPx: number, gamma = 1.0): void {
    const r2 = Math.max(1, radiusPx * radiusPx);
    for (let i = Math.max(0, Math.floor(center - radiusPx - 1)); i <= Math.min(N - 1, Math.ceil(center + radiusPx + 1)); i++) {
      const d = i - center;
      let w = Math.max(0, 1 - (d * d) / r2); // 0..1 parabolic
      if (gamma !== 1) w = Math.pow(w, gamma);
      const idx = i * 3;
      buf[idx]     = Math.min(255, buf[idx]     + Math.round(rgb.r * w));
      buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(rgb.g * w));
      buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(rgb.b * w));
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    const N = ledCount | 0;
    if (N <= 0) return Buffer.alloc(0);

    // -------- Controls (defaults keep your original behavior) --------
    const instanceKey = params.get('instanceKey') || 'default';

    const speedPx   = Number(params.get('speed'))  || 180;     // px/s
    const hue       = Number(params.get('hue'))    || 32;      // deg
    const bright    = clamp01(Number(params.get('bright')) ?? 1.0);
    const globalFade= clamp01(Number(params.get('fade'))   ?? 0.965);

    // New knobs (optional)
    const minMeet   = clamp01(params.get('minMeet') ?? 0.2);
    const maxMeet   = clamp01(params.get('maxMeet') ?? 0.8);
    const restMin   = Math.max(0.05, Number(params.get('restMin') ?? 0.30));
    const restMax   = Math.max(restMin, Number(params.get('restMax') ?? 1.20));
    const holdMin   = Math.max(0.02, Number(params.get('holdMin') ?? 0.06));
    const holdMax   = Math.max(holdMin, Number(params.get('holdMax') ?? 0.14));
    const asymmetry = clamp01(Number(params.get('asymmetry') ?? 0.1)); // 0..1

    const rings     = Math.max(1, Number(params.get('rings') ?? 3));
    const sigmaPx   = Math.max(0.8, Number(params.get('sigma') ?? 1.8)); // ring thickness
    const dispersion= Number(params.get('dispersion') ?? 0.12); // ring speed spacing
    const chroma    = Number(params.get('chromaShift') ?? 140); // edge hue offset

    const headTrailFrac = clamp01(Number(params.get('trailFrac') ?? 0.18)); // trail length % of N
    const trailPersist  = clamp01(Number(params.get('trailPersist') ?? 0.86));
    const temporalBlend = clamp01(Number(params.get('temporalBlend') ?? 0.0)); // 0..0.4 typical
    const powerLimit    = clamp01(Number(params.get('powerLimit') ?? 1.0)); // 0..1 scaler if needed

    const key = this.keyFor(N, instanceKey);
    let st = this.stateByKey.get(key);
    if (!st) {
      st = this.newCycleState(
        N, time, speedPx,
        minMeet, maxMeet,
        restMin, restMax,
        holdMin, holdMax,
        asymmetry,
        (N * 0.5) / Math.max(1e-6, speedPx) + 0.9 // same idea as your original
      );
      this.stateByKey.set(key, st);
    }

    const work = new Uint8Array(N * 3);
    // decay previous frame for persistent glow
    for (let i = 0; i < N * 3; i++) {
      work[i] = (st.prev[i] * globalFade) | 0;
    }

    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in seconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_SEC = 3600; // 1 hour in seconds
    const nowRaw = time; // seconds
    const now = nowRaw % TIME_WRAP_SEC;
    
    // Normalize stored times when time wraps to keep comparisons valid
    const currentWrapBase = Math.floor(nowRaw / TIME_WRAP_SEC) * TIME_WRAP_SEC;
    const lastWrapBase = Math.floor((st.lastTime + TIME_WRAP_SEC) / TIME_WRAP_SEC - 1) * TIME_WRAP_SEC;
    if (currentWrapBase > lastWrapBase) {
      // Time wrapped, normalize stored times
      st.phaseStart = st.phaseStart % TIME_WRAP_SEC;
      st.phaseEnd = st.phaseEnd % TIME_WRAP_SEC;
      if (st.explodeT0 > 0) st.explodeT0 = st.explodeT0 % TIME_WRAP_SEC;
    }
    
    // Progress phases if needed - handle time comparison with wrap-around
    while (true) {
      const timeSincePhaseEnd = (now >= st.phaseEnd)
        ? (now - st.phaseEnd)
        : (now + TIME_WRAP_SEC - st.phaseEnd);
      
      if (timeSincePhaseEnd < 0) break;
      
      this.advancePhase(st, N, now, speedPx, {
        minMeet, maxMeet, restMin, restMax, holdMin, holdMax, asymmetry,
        explodeSecondsPerHalf: (N * 0.5) / Math.max(1e-6, speedPx) + 0.9
      });
      
      // Normalize phase times after advance
      st.phaseStart = st.phaseStart % TIME_WRAP_SEC;
      st.phaseEnd = st.phaseEnd % TIME_WRAP_SEC;
      if (st.explodeT0 > 0) st.explodeT0 = st.explodeT0 % TIME_WRAP_SEC;
    }

    // Derived hues
    const sat = 1.0;
    const hueCore   = hue;
    const hueEdge   = (hue + chroma) % 360;
    const hueTravelL= (hue + 300) % 360;
    const hueTravelR= (hue + 180) % 360;

    // dt (sec) in case you want to extend velocity-linked brightness later - handle wrap-around correctly
    let dt: number;
    if (st.lastTime > 0) {
      const unwrappedDt = Math.max(0, nowRaw - st.lastTime);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 0.1); // Max 100ms delta
    } else {
      dt = 0.016; // Default frame time (16ms)
    }
    st.lastTime = nowRaw; // Store unwrapped for next frame's dt calculation

    switch (st.phase) {
      case 'REST':
        // afterglow only
        break;

      case 'TRAVEL': {
        // Handle wrap in phase time calculation
        const phaseT = (now >= st.phaseStart)
          ? (now - st.phaseStart)
          : (now + TIME_WRAP_SEC - st.phaseStart);
        const leftDist  = st.meetIdx - 0;
        const rightDist = (N - 1) - st.meetIdx;
        const lProg = clamp01(phaseT / Math.max(1e-6, st.travelTimeL));
        const rProg = clamp01(phaseT / Math.max(1e-6, st.travelTimeR));
        const lPos  = 0 + easeOutCubic(lProg) * leftDist;
        const rPos  = (N - 1) - easeOutCubic(rProg) * rightDist;

        const trailLen = Math.max(2, Math.round(headTrailFrac * N));

        const rgbL = hsvToRgb(hueTravelL, sat, bright);
        const rgbR = hsvToRgb(hueTravelR, sat, bright);

        // anti-aliased heads
        this.addAA(work, lPos, rgbL, 1.0);
        this.addAA(work, rPos, rgbR, 1.0);

        // subpixel trails (exponential falloff)
        for (let i = 0; i < N; i++) {
          const dL = Math.abs(i - lPos);
          const dR = Math.abs(i - rPos);
          let m = 0;
          if (dL <= trailLen) m += Math.pow(trailPersist, dL);
          if (dR <= trailLen) m += Math.pow(trailPersist, dR);

          if (m > 0) {
            const idx = i * 3;
            // mix L and R hues proportionally
            const wL = dL <= trailLen ? Math.pow(trailPersist, dL) : 0;
            const wR = dR <= trailLen ? Math.pow(trailPersist, dR) : 0;
            const wSum = wL + wR || 1;
            const r = Math.round((rgbL.r * wL + rgbR.r * wR) / wSum * clamp01(m));
            const g = Math.round((rgbL.g * wL + rgbR.g * wR) / wSum * clamp01(m));
            const b = Math.round((rgbL.b * wL + rgbR.b * wR) / wSum * clamp01(m));
            work[idx]     = Math.min(255, work[idx]     + r);
            work[idx + 1] = Math.min(255, work[idx + 1] + g);
            work[idx + 2] = Math.min(255, work[idx + 2] + b);
          }
        }
        break;
      }

      case 'HOLD': {
        // soft core glow with slight growth over hold - handle wrap in phase time calculation
        const phaseT = (now >= st.phaseStart)
          ? (now - st.phaseStart)
          : (now + TIME_WRAP_SEC - st.phaseStart);
        const u = clamp01(phaseT / Math.max(1e-6, st.holdTime));
        const rgb = hsvToRgb(hueCore, sat, bright);
        this.drawGlow(work, st.meetIdx, N, rgb, 6 + 2 * easeInCubic(u), 1.0);
        break;
      }

      case 'EXPLODE': {
        // Handle wrap in explode time calculation
        const t = (now >= st.explodeT0)
          ? Math.max(0, now - st.explodeT0)
          : Math.max(0, now + TIME_WRAP_SEC - st.explodeT0);
        const half = (N * 0.5);
        const baseV = Math.max(1e-3, half / Math.max(1e-3, st.explodeLen)); // px/sec reaching half in explodeLen
        const coreRGB = hsvToRgb(hueCore, sat, bright);
        const edgeRGB = hsvToRgb(hueEdge, sat, bright);

        // tiny white pop at the core
        this.drawGlow(work, st.meetIdx, N, { r: 255, g: 255, b: 255 }, 2, 0.85);

        for (let w = 0; w < rings; w++) {
          const delay = w * 0.055;
          const tw = t - delay;
          if (tw < 0) continue;

          const factor = 1 + (w - (rings - 1) / 2) * dispersion;
          const v = Math.max(1e-3, baseV * factor);
          const radius = v * tw;
          const amp = Math.pow(0.58, w) * (1 / (1 + 0.45 * tw)); // ring amplitude decay

          // gaussian ring with sigmaPx thickness
          const sigma2 = sigmaPx * sigmaPx * 2;
          for (let i = 0; i < N; i++) {
            const d = Math.abs(i - st.meetIdx);
            const peak = Math.exp(-Math.pow(d - radius, 2) / Math.max(1e-6, sigma2));
            const a = amp * peak;
            if (a > 1e-4) {
              const mixT = clamp01(d / half);
              const r = Math.round(lerp(coreRGB.r, edgeRGB.r, mixT) * a);
              const g = Math.round(lerp(coreRGB.g, edgeRGB.g, mixT) * a);
              const b = Math.round(lerp(coreRGB.b, edgeRGB.b, mixT) * a);
              const idx = i * 3;
              work[idx]     = Math.min(255, work[idx]     + r);
              work[idx + 1] = Math.min(255, work[idx + 1] + g);
              work[idx + 2] = Math.min(255, work[idx + 2] + b);
            }
          }
        }
        break;
      }
    }

    // Optional power limit (simple overall scale)
    if (powerLimit < 1.0) {
      for (let i = 0; i < work.length; i++) work[i] = Math.floor(work[i] * powerLimit);
    }

    // Optional temporal blend (camera anti-shimmer)
    const prev = this.prevFrameByKey.get(key);
    if (prev && temporalBlend > 0) {
      const t = Math.min(0.4, temporalBlend);
      for (let i = 0; i < work.length; i++) {
        work[i] = Math.floor(work[i] * (1 - t) + prev[i] * t);
      }
    }
    this.prevFrameByKey.set(key, work.slice());

    // Output gamma (sRGB-ish)
    const gamma = 2.2;
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      const v = Math.pow(work[i] / 255, 1 / gamma) * 255;
      out[i] = (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
    }

    st.prev = work;
    this.stateByKey.set(key, st);
    return out;
  }
}

/**
 * Shockwave Dual (random meeting point + random intervals)
 * Minimal controls: speed, hue, bright, fade
 */

import { EffectGenerator } from './helpers/effectUtils';
import { hsvToRgb, RGBColor } from './helpers/colorUtils';

type Phase = 'REST' | 'TRAVEL' | 'HOLD' | 'EXPLODE';

type State = {
  phase: Phase;
  phaseStart: number;
  phaseEnd: number;
  meetIdx: number;
  travelTimeL: number;
  travelTimeR: number;
  travelTime: number;
  holdTime: number;
  explodeLen: number;
  explodeT0: number;
  prev: Uint8Array;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export class ShockwaveDualEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();

  private keyFor(N: number, instanceKey?: string): string {
    return `${N}:${instanceKey || 'default'}`;
  }

  private rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private pickMeetIdx(N: number, minMeet: number, maxMeet: number): number {
    const a = clamp01(minMeet);
    const b = clamp01(maxMeet);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const pos = this.rand(lo, hi);
    return Math.max(0, Math.min(N - 1, Math.round(pos * (N - 1))));
  }

  private newCycleState(N: number, now: number, speed: number, minMeet: number, maxMeet: number): State {
    const meetIdx = this.pickMeetIdx(N, minMeet, maxMeet);
    const leftDist = meetIdx - 0;
    const rightDist = (N - 1) - meetIdx;
    const speedL = speed;
    const speedR = speed * 0.95; // slight asymmetry by default
    const travelTimeL = leftDist / Math.max(1e-6, speedL);
    const travelTimeR = rightDist / Math.max(1e-6, speedR);
    const travelTime = Math.max(travelTimeL, travelTimeR);
    const hold = this.rand(0.04, 0.12); // seconds
    const rest = this.rand(0.3, 1.2); // seconds

    return {
      phase: 'REST',
      phaseStart: now,
      phaseEnd: now + rest,
      meetIdx,
      travelTimeL,
      travelTimeR,
      travelTime,
      holdTime: hold,
      explodeLen: (N * 0.5) / Math.max(1e-6, speed) + 0.9,
      explodeT0: 0,
      prev: new Uint8Array(N * 3)
    };
  }

  private advancePhase(st: State, N: number, now: number, speed: number, minMeet: number, maxMeet: number): void {
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
      const next = this.newCycleState(N, st.phaseEnd, speed, minMeet, maxMeet);
      next.prev = st.prev;
      Object.assign(st, next);
      return;
    }
  }

  private drawGlow(buf: Uint8Array, center: number, N: number, rgb: RGBColor, radiusPx: number): void {
    const r2 = radiusPx * radiusPx;
    for (let i = 0; i < N; i++) {
      const d = i - center;
      const w = Math.max(0, 1 - (d * d) / r2);
      if (w > 0) {
        const idx = i * 3;
        buf[idx] = Math.min(255, buf[idx] + Math.round(rgb.r * w));
        buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(rgb.g * w));
        buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(rgb.b * w));
      }
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const N = ledCount | 0;
    if (N <= 0) return Buffer.alloc(0);

    // Minimal controls
    const instanceKey = params.get('instanceKey') || 'default';
    const speed = Number(params.get('speed')) || 180; // px/s base
    const hue = Number(params.get('hue')) || 32; // base hue
    const bright = clamp01(Number(params.get('bright')) ?? 1.0);
    const globalFade = clamp01(Number(params.get('fade')) ?? 0.965);

    // Derived color scheme
    const sat = 1.0;
    const hueCore = hue;
    const hueEdge = (hue + 165) % 360;
    const hueTravelL = (hue + 300) % 360;
    const hueTravelR = (hue + 180) % 360;

    const key = this.keyFor(N, instanceKey);
    let st = this.stateByKey.get(key);
    if (!st) {
      st = this.newCycleState(N, time, speed, 0.2, 0.8);
      this.stateByKey.set(key, st);
    }

    // Work in linear buffer, apply gamma on output
    const work = new Uint8Array(N * 3);
    for (let i = 0; i < N; i++) {
      const idx = i * 3;
      work[idx] = (st.prev[idx] * globalFade) | 0;
      work[idx + 1] = (st.prev[idx + 1] * globalFade) | 0;
      work[idx + 2] = (st.prev[idx + 2] * globalFade) | 0;
    }

    const now = time;
    while (now >= st.phaseEnd) {
      this.advancePhase(st, N, now, speed, 0.2, 0.8);
    }

    switch (st.phase) {
      case 'REST':
        // just afterglow
        break;
      case 'TRAVEL': {
        const phaseT = now - st.phaseStart;
        const leftDist = st.meetIdx - 0;
        const rightDist = (N - 1) - st.meetIdx;
        const lProg = clamp01(phaseT / Math.max(1e-6, st.travelTimeL));
        const rProg = clamp01(phaseT / Math.max(1e-6, st.travelTimeR));
        const lPos = Math.round(0 + easeOutCubic(lProg) * leftDist);
        const rPos = Math.round((N - 1) - easeOutCubic(rProg) * rightDist);

        const trailLen = Math.max(2, Math.round(0.18 * N));
        const trailPersist = 0.86;
        const rgbL = hsvToRgb(hueTravelL, sat, bright);
        const rgbR = hsvToRgb(hueTravelR, sat, bright);

        for (let i = 0; i < N; i++) {
          const idx = i * 3;
          const dL = Math.abs(i - lPos);
          if (dL <= trailLen) {
            const tr = Math.pow(trailPersist, dL);
            work[idx] = Math.min(255, work[idx] + Math.round(rgbL.r * tr));
            work[idx + 1] = Math.min(255, work[idx + 1] + Math.round(rgbL.g * tr));
            work[idx + 2] = Math.min(255, work[idx + 2] + Math.round(rgbL.b * tr));
          }
          const dR = Math.abs(i - rPos);
          if (dR <= trailLen) {
            const tr = Math.pow(trailPersist, dR);
            work[idx] = Math.min(255, work[idx] + Math.round(rgbR.r * tr));
            work[idx + 1] = Math.min(255, work[idx + 1] + Math.round(rgbR.g * tr));
            work[idx + 2] = Math.min(255, work[idx + 2] + Math.round(rgbR.b * tr));
          }
        }
        break;
      }
      case 'HOLD': {
        this.drawGlow(work, st.meetIdx, N, hsvToRgb(hueCore, sat, bright), 6);
        break;
      }
      case 'EXPLODE': {
        const te = now - st.explodeT0;
        const coreRGB = hsvToRgb(hueCore, sat, bright);
        const edgeRGB = hsvToRgb(hueEdge, sat, bright);

        // small white core pop
        this.drawGlow(work, st.meetIdx, N, { r: 255, g: 255, b: 255 }, 2);

        const waves = 3;
        const baseV = Math.max(1e-3, speed * 1.33);
        const sigma = 1.8;
        const sigma2 = sigma * sigma;
        const dispersion = 0.1;

        for (let w = 0; w < waves; w++) {
          const delay = w * 0.055;
          const tw = te - delay;
          if (tw < 0) continue;
          const factor = 1 + (w - (waves - 1) / 2) * dispersion;
          const v = Math.max(1e-3, baseV * factor);
          const radius = v * tw;
          const amp = Math.pow(0.55, w) * (1 / (1 + 0.4 * tw));

          for (let i = 0; i < N; i++) {
            const d = Math.abs(i - st.meetIdx);
            const peak = Math.exp(-((d - radius) * (d - radius)) / (2 * sigma2));
            const a = amp * peak;
            if (a > 1e-4) {
              const mix = clamp01(d / (N * 0.5));
              const r = Math.round(lerp(coreRGB.r, edgeRGB.r, mix) * a);
              const g = Math.round(lerp(coreRGB.g, edgeRGB.g, mix) * a);
              const b = Math.round(lerp(coreRGB.b, edgeRGB.b, mix) * a);
              const idx = i * 3;
              work[idx] = Math.min(255, work[idx] + r);
              work[idx + 1] = Math.min(255, work[idx + 1] + g);
              work[idx + 2] = Math.min(255, work[idx + 2] + b);
            }
          }
        }
        break;
      }
    }

    // Gamma + clamp output
    const gamma = 2.2;
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      let v = work[i] / 255;
      v = Math.pow(v, 1 / gamma) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      out[i] = v | 0;
    }

    st.prev = work;
    this.stateByKey.set(key, st);
    return out;
  }
}



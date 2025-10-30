/**
 * Shockwave Dual Effect (random meeting point + random intervals)
 * - Launches two charges from both ends toward a random meeting point
 * - Inserts random rest between cycles
 * - Explodes into outward shockwaves with Gaussian rings
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
  prev: Uint8Array; // linear working buffer from last frame
};

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function easeOutCubic(x: number): number { return 1 - Math.pow(1 - x, 3); }

export class ShockwaveDualEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();

  private keyFor(N: number, k?: string): string { return `${N}:${k || 'default'}`; }
  private rand(min: number, max: number): number { return Math.random() * (max - min) + min; }

  private pickMeetIdx(N: number, params: Map<string, any>): number {
    const a = clamp01(Number(params.get('minMeet')) ?? 0.2);
    const b = clamp01(Number(params.get('maxMeet')) ?? 0.8);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const pos = this.rand(lo, hi);
    return Math.max(0, Math.min(N - 1, Math.round(pos * (N - 1))));
  }

  private newCycleState(N: number, params: Map<string, any>, now: number): State {
    const meetIdx = this.pickMeetIdx(N, params);
    const speedL = Math.max(1e-6, Number(params.get('speedL')) || 140);
    const speedR = Math.max(1e-6, Number(params.get('speedR')) || 140);

    const leftDist = meetIdx - 0;
    const rightDist = (N - 1) - meetIdx;

    const travelTimeL = leftDist / speedL;
    const travelTimeR = rightDist / speedR;
    const travelTime = Math.max(travelTimeL, travelTimeR);

    const hold = (this.rand(Number(params.get('minHoldMs')) || 40, Number(params.get('maxHoldMs')) || 120)) / 1000;
    const rest = (this.rand(Number(params.get('minRestMs')) || 400, Number(params.get('maxRestMs')) || 1400)) / 1000;

    return {
      phase: 'REST',
      phaseStart: now,
      phaseEnd: now + rest,
      meetIdx,
      travelTimeL,
      travelTimeR,
      travelTime,
      holdTime: hold,
      explodeLen: (N * 0.5) / Math.max(1e-6, Number(params.get('waveSpeed')) || 240) + 0.9,
      explodeT0: 0,
      prev: new Uint8Array(N * 3)
    };
  }

  private advancePhase(st: State, N: number, params: Map<string, any>, now: number): void {
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
      const next = this.newCycleState(N, params, st.phaseEnd);
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

    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.keyFor(N, instanceKey);
    let st = this.stateByKey.get(key);
    if (!st) {
      st = this.newCycleState(N, params, time);
      this.stateByKey.set(key, st);
    }

    // Work in linear space, then gamma for output
    const work = new Uint8Array(N * 3);
    const fade = clamp01(Number(params.get('globalFade')) ?? 0.965);
    for (let i = 0; i < N; i++) {
      const idx = i * 3;
      work[idx] = (st.prev[idx] * fade) | 0;
      work[idx + 1] = (st.prev[idx + 1] * fade) | 0;
      work[idx + 2] = (st.prev[idx + 2] * fade) | 0;
    }

    // Phase timing (catch-up if frame delayed)
    const now = time;
    while (now >= st.phaseEnd) {
      this.advancePhase(st, N, params, now);
    }

    switch (st.phase) {
      case 'REST':
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
        const trailPersist = clamp01(Number(params.get('cometTrail')) ?? 0.86);
        const rgbL = hsvToRgb(Number(params.get('hueTravelL')) || 330, Number(params.get('sat')) || 1.0, Number(params.get('bright')) || 1.0);
        const rgbR = hsvToRgb(Number(params.get('hueTravelR')) || 200, Number(params.get('sat')) || 1.0, Number(params.get('bright')) || 1.0);

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
        const core = hsvToRgb(Number(params.get('hueCore')) || 30, Number(params.get('sat')) || 1.0, Number(params.get('bright')) || 1.0);
        this.drawGlow(work, st.meetIdx, N, core, 6);
        break;
      }
      case 'EXPLODE': {
        const te = now - st.explodeT0;
        const coreRGB = hsvToRgb(Number(params.get('hueCore')) || 30, Number(params.get('sat')) || 1.0, Number(params.get('bright')) || 1.0);
        const edgeRGB = hsvToRgb(Number(params.get('hueEdge')) || 205, Number(params.get('sat')) || 1.0, Number(params.get('bright')) || 1.0);

        // small white pop at core
        this.drawGlow(work, st.meetIdx, N, { r: 255, g: 255, b: 255 }, 2);

        const waves = Math.max(1, (Number(params.get('waves')) || 3) | 0);
        const baseV = Math.max(1e-3, Number(params.get('waveSpeed')) || 240);
        const dispersion = Number(params.get('dispersion')) ?? 0.10;
        const sigma = Math.max(0.6, Number(params.get('thickness')) || 2.1);
        const sigma2 = sigma * sigma;
        const decayPerWave = clamp01(Number(params.get('decayPerWave')) ?? 0.55);
        const useAdditive = params.get('useAdditive');

        for (let w = 0; w < waves; w++) {
          const delay = w * 0.055;
          const tw = te - delay;
          if (tw < 0) continue;
          const factor = 1 + (w - (waves - 1) / 2) * dispersion;
          const v = Math.max(1e-3, baseV * factor);
          const radius = v * tw;
          const amp = Math.pow(decayPerWave, w) * (1 / (1 + 0.4 * tw));

          for (let i = 0; i < N; i++) {
            const d = Math.abs(i - st.meetIdx);
            const peak = Math.exp(-((d - radius) * (d - radius)) / (2 * sigma2));
            const a = amp * peak;
            if (a < 1e-4) continue;
            const mix = clamp01(d / (N * 0.5));
            const r = Math.round(lerp(coreRGB.r, edgeRGB.r, mix) * a);
            const g = Math.round(lerp(coreRGB.g, edgeRGB.g, mix) * a);
            const b = Math.round(lerp(coreRGB.b, edgeRGB.b, mix) * a);
            const idx = i * 3;
            if (useAdditive === false) {
              work[idx] = Math.max(work[idx], r);
              work[idx + 1] = Math.max(work[idx + 1], g);
              work[idx + 2] = Math.max(work[idx + 2], b);
            } else {
              work[idx] = Math.min(255, work[idx] + r);
              work[idx + 1] = Math.min(255, work[idx + 1] + g);
              work[idx + 2] = Math.min(255, work[idx + 2] + b);
            }
          }
        }
        break;
      }
    }

    // Gamma + clamp for output
    const gamma = Math.max(0.1, Number(params.get('gamma')) || 2.2);
    const doClamp = params.get('clamp');
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      let v = work[i] / 255;
      v = Math.pow(v, 1 / gamma) * 255;
      if (doClamp === undefined || doClamp) v = v < 0 ? 0 : v > 255 ? 255 : v;
      out[i] = v | 0;
    }

    st.prev = work;
    this.stateByKey.set(key, st);
    return out;
  }
}



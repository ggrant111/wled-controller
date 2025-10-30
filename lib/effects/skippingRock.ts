/**
 * Skipping Rock Effect (1D)
 * - Rock (short bright cluster) travels across the strip
 * - On skips, spawn ripples (two wavefronts) that propagate outward,
 *   reflect at ends with damping and fade out over time
 * - Each ripple picks a color from a palette (or fixed hue)
 */

import { EffectGenerator } from './helpers/effectUtils';
import { hsvToRgb, RGBColor } from './helpers/colorUtils';
import { getColorsFromParams, getPalette } from './helpers/paletteUtils';

type Ripple = {
  left: { x: number; v: number };
  right: { x: number; v: number };
  amp: number;
  sigma: number;
  color: RGBColor;
  dead?: boolean;
};

type State = {
  prev: Uint8Array;
  lastT: number;

  paletteColors: RGBColor[];
  paletteT: number;

  rockX: number;
  rockV: number;
  lastImpactX: number;

  skipTarget: number;
  distSinceSkip: number;
  skipFlashUntil: number;

  ripples: Ripple[];
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

export class SkippingRockEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();

  private getKey(ledCount: number, instanceKey?: string): string {
    return `${ledCount}:${instanceKey || 'default'}`;
  }

  private rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private initState(N: number, t: number, params: Map<string, any>): State {
    const palette = getPalette(params);
    const paletteColors = palette
      ? palette.colors.map((hex) => {
          // hex like #rrggbb
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return { r, g, b } as RGBColor;
        })
      : getColorsFromParams(params, '#ffffff');

    const rockSpeed = Math.max(10, Number(params.get('rockSpeed')) || 180);
    const dir = Math.random() < 0.5 ? 1 : -1;

    return {
      prev: new Uint8Array(N * 3),
      lastT: t,
      paletteColors,
      paletteT: Math.random(),
      rockX: Math.random() * (N - 1),
      rockV: dir * rockSpeed,
      lastImpactX: Math.round((N - 1) / 2),
      skipTarget: this.rand(
        Number(params.get('minSkipDist')) || 40,
        Number(params.get('maxSkipDist')) || 120
      ),
      distSinceSkip: 0,
      skipFlashUntil: -1,
      ripples: []
    };
  }

  private spawnRipple(st: State, N: number, origin: number, params: Map<string, any>): void {
    const paletteT = st.paletteT;
    const rippleColor = samplePaletteContinuous(st.paletteColors, paletteT);
    const rippleSpeed = Math.max(1e-3, Number(params.get('rippleSpeed')) || 260);
    const rippleSigma = Math.max(0.6, Number(params.get('rippleSigma')) || 1.6);
    const maxRipples = Math.max(1, Number(params.get('maxRipples')) || 12);

    if (st.ripples.length >= maxRipples) st.ripples.shift();
    st.ripples.push({
      left: { x: origin, v: -rippleSpeed },
      right: { x: origin, v: rippleSpeed },
      amp: 1.0,
      sigma: rippleSigma,
      color: rippleColor
    });
  }

  private updateRipples(st: State, N: number, dt: number, params: Map<string, any>): void {
    const reflectLoss = clamp01(Number(params.get('reflectLoss')) ?? 0.65);
    const perSec = clamp01(Number(params.get('rippleDampPerSec')) ?? 0.6);
    const deathThresh = Math.max(0.001, Number(params.get('rippleDeathThreshold')) || 0.03);

    for (const r of st.ripples) {
      r.left.x += r.left.v * dt;
      r.right.x += r.right.v * dt;

      if (r.left.x < 0) {
        r.left.x = -r.left.x;
        r.left.v = -r.left.v;
        r.amp *= reflectLoss;
      }
      if (r.right.x > N - 1) {
        r.right.x = 2 * (N - 1) - r.right.x;
        r.right.v = -r.right.v;
        r.amp *= reflectLoss;
      }
      if (r.right.x < 0) {
        r.right.x = 0;
        r.right.v = Math.abs(r.right.v);
      }
      if (r.left.x > N - 1) {
        r.left.x = N - 1;
        r.left.v = -Math.abs(r.left.v);
      }

      r.amp *= Math.pow(perSec, dt);
      r.dead = r.amp < deathThresh;
    }
    st.ripples = st.ripples.filter((r) => !r.dead);
  }

  private renderRipples(buf: Uint8Array, st: State, N: number, params: Map<string, any>): void {
    const additive = !!params.get('additive') || params.get('additive') === undefined;
    for (const r of st.ripples) {
      const sigma2 = r.sigma * r.sigma;
      for (let i = 0; i < N; i++) {
        const dl = i - r.left.x;
        const dr = i - r.right.x;
        const aL = Math.exp(-(dl * dl) / (2 * sigma2)) * r.amp;
        const aR = Math.exp(-(dr * dr) / (2 * sigma2)) * r.amp;
        let a = aL + aR;
        if (a < 1e-4) continue;
        const idx = i * 3;
        if (additive) {
          buf[idx] = Math.min(255, buf[idx] + Math.round(r.color.r * a));
          buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(r.color.g * a));
          buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(r.color.b * a));
        } else {
          buf[idx] = Math.max(buf[idx], Math.round(r.color.r * a));
          buf[idx + 1] = Math.max(buf[idx + 1], Math.round(r.color.g * a));
          buf[idx + 2] = Math.max(buf[idx + 2], Math.round(r.color.b * a));
        }
      }
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const N = ledCount | 0;
    // Work in a linear buffer; apply gamma only to the returned frame
    const workBuf = new Uint8Array(N * 3);
    if (N <= 0) return Buffer.alloc(0);

    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.getKey(N, instanceKey);
    let st = this.stateByKey.get(key);
    if (!st) {
      st = this.initState(N, time, params);
      this.stateByKey.set(key, st);
    }

    // Background afterglow in linear space
    const backgroundFade = clamp01(Number(params.get('backgroundFade')) ?? 0.94);
    for (let i = 0; i < N; i++) {
      const idx = i * 3;
      workBuf[idx] = (st.prev[idx] * backgroundFade) | 0;
      workBuf[idx + 1] = (st.prev[idx + 1] * backgroundFade) | 0;
      workBuf[idx + 2] = (st.prev[idx + 2] * backgroundFade) | 0;
    }

    // Time step
    const dt = Math.max(0, time - st.lastT);
    st.lastT = time;

    // Move rock and handle bounds
    st.rockX += st.rockV * dt;
    if (st.rockX < 0) {
      st.rockX = -st.rockX;
      st.rockV = Math.abs(st.rockV);
      // queue skip timing state
      st.distSinceSkip = 0;
      st.skipTarget = this.rand(
        Number(params.get('minSkipDist')) || 40,
        Number(params.get('maxSkipDist')) || 120
      );
      st.lastImpactX = Math.round(st.rockX);
      st.skipFlashUntil = time + (Number(params.get('skipHoldMs')) || 35) / 1000;
    }
    if (st.rockX > N - 1) {
      st.rockX = 2 * (N - 1) - st.rockX;
      st.rockV = -Math.abs(st.rockV);
      st.distSinceSkip = 0;
      st.skipTarget = this.rand(
        Number(params.get('minSkipDist')) || 40,
        Number(params.get('maxSkipDist')) || 120
      );
      st.lastImpactX = Math.round(st.rockX);
      st.skipFlashUntil = time + (Number(params.get('skipHoldMs')) || 35) / 1000;
    }

    st.distSinceSkip += Math.abs(st.rockV) * dt;
    const needSkip = st.distSinceSkip >= st.skipTarget;
    if (needSkip) {
      st.distSinceSkip = 0;
      st.skipTarget = this.rand(
        Number(params.get('minSkipDist')) || 40,
        Number(params.get('maxSkipDist')) || 120
      );
      const spawnAtRock = params.get('spawnAtRock');
      const origin = Math.round(spawnAtRock === false ? st.lastImpactX : st.rockX);
      this.spawnRipple(st, N, origin, params);
      st.lastImpactX = Math.round(st.rockX);
      st.skipFlashUntil = time + (Number(params.get('skipHoldMs')) || 35) / 1000;

      const usePaletteCycle = params.get('usePaletteCycle');
      const shift = Number(params.get('paletteShiftPerSkip'));
      st.paletteT = (st.paletteT + (usePaletteCycle === false ? Math.random() * 0.5 : (isNaN(shift) ? 0.18 : shift))) % 1;
    }

    // Draw rock with trail
    const rockWidth = Math.max(1, Number(params.get('rockWidth')) || 6);
    const rockTrail = clamp01(Number(params.get('rockTrail')) ?? 0.85);
    const rockBrightness = clamp01(Number(params.get('rockBrightness')) ?? 1.0);
    const rockHueParam = params.get('rockHue'); // null or number
    const halfW = Math.max(1, Math.round(rockWidth / 2));
    const rockCenter = Math.round(st.rockX);

    const rockRGB: RGBColor =
      rockHueParam === null || rockHueParam === undefined
        ? samplePaletteContinuous(st.paletteColors, st.paletteT)
        : hsvToRgb(Number(rockHueParam), 1.0, rockBrightness);

    for (let i = Math.max(0, rockCenter - halfW * 2); i <= Math.min(N - 1, rockCenter + halfW * 2); i++) {
      const d = Math.abs(i - st.rockX);
      const core = Math.max(0, 1 - d / halfW);
      const tail = Math.pow(rockTrail, d);
      const a = Math.max(core, 0.6 * tail) * rockBrightness;
      if (a > 1e-3) {
        const idx = i * 3;
        workBuf[idx] = Math.min(255, workBuf[idx] + Math.round(rockRGB.r * a));
        workBuf[idx + 1] = Math.min(255, workBuf[idx + 1] + Math.round(rockRGB.g * a));
        workBuf[idx + 2] = Math.min(255, workBuf[idx + 2] + Math.round(rockRGB.b * a));
      }
    }

    // Impact flash
    if (time <= st.skipFlashUntil) {
      const idx = st.lastImpactX * 3;
      if (idx >= 0 && idx + 2 < workBuf.length) {
        const flash = 200; // toned down from 255 to avoid blowout
        workBuf[idx] = Math.min(255, workBuf[idx] + flash);
        workBuf[idx + 1] = Math.min(255, workBuf[idx + 1] + flash);
        workBuf[idx + 2] = Math.min(255, workBuf[idx + 2] + flash);
      }
    }

    // Ripples
    this.updateRipples(st, N, dt, params);
    this.renderRipples(workBuf, st, N, params);

    // Gamma + clamp
    const gamma = Math.max(0.1, Number(params.get('gamma')) || 2.2);
    const doClamp = params.get('clamp');
    const out = Buffer.alloc(workBuf.length);
    for (let i = 0; i < workBuf.length; i++) {
      let v = workBuf[i] / 255;
      v = Math.pow(v, 1 / gamma) * 255;
      if (doClamp === undefined || doClamp) {
        v = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      out[i] = v | 0;
    }

    // Save frame & state
    st.prev = workBuf;
    this.stateByKey.set(key, st);
    return out;
  }
}



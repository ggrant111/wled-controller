/**
 * Plasma Effect — Enhanced
 * - Domain-warped multi-sine plasma (2 blended layers)
 * - Soft-light blend, filmic tone-map, optional blur & temporal blend
 */

import { EffectGenerator } from './helpers';
import { hsvToRgb } from './helpers/colorUtils';
import { applyTransformations } from './helpers/effectUtils';

export class PlasmaEffect implements EffectGenerator {
  private lastTime = 0;
  private prevFrame: Uint8Array | null = null;

  private clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
  private softLight(a: number, b: number) { return (1 - 2 * b) * a * a + 2 * b * a; } // a,b in [0..1]
  private toneMapReinhard(x: number, exposure = 1.0) {
    const v = x * Math.max(0.001, exposure);
    return v / (1 + v);
  }

  // small deterministic hash -> noise without per-frame sparkle
  private hash1D(n: number) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    // -------- Parameters --------
    const speed        = params.get('speed') ?? 0.18;    // global motion speed
    const intensity    = params.get('intensity') ?? 0.85;// overall brightness scaler
    const reverse      = params.get('reverse') ?? false;
    const mirror       = params.get('mirror') ?? false;

    const warp         = params.get('warp') ?? 0.55;     // domain warp strength (0..1)
    const contrast     = params.get('contrast') ?? 0.85; // >1 punchier, <1 flatter (affects V)
    const saturation   = params.get('saturation') ?? 1.0;// 0..1
    const exposure     = params.get('exposure') ?? 1.0;  // tone-map exposure
    const gammaBoost   = params.get('gamma') ?? 1.0;     // post gamma lift

    const hueBase      = params.get('hueBase') ?? 0;     // degrees
    const hueRange     = params.get('hueRange') ?? 270;  // degrees span swept by plasma
    const layerOffset  = params.get('layerOffset') ?? 97;// degrees hue offset for layer B

    const blur         = params.get('blur') ?? 0.0;      // 0..0.4 neighbor blur
    const temporalBlend= params.get('temporalBlend') ?? 0.0; // 0..0.4 frame blend
    const noiseAmount  = params.get('noise') ?? 0.08;    // subtle texture (0..0.2)

    // -------- Time base --------
    const tMsRaw = time > 5000 ? time : time * 1000;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in milliseconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const tMs = tMsRaw % TIME_WRAP_MS;
    
    // For dt calculation, handle wrap-around correctly
    let dt: number;
    if (this.lastTime > 0) {
      const unwrappedDt = Math.max(1, tMsRaw - this.lastTime);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 100); // Max 100ms delta
    } else {
      dt = 16; // Default frame time
    }
    this.lastTime = tMsRaw; // Store unwrapped for next frame's dt calculation

    const buffer = Buffer.alloc(ledCount * 3);
    if (ledCount <= 0) return buffer;

    // Prepass arrays for optional blur/tone-map
    const rLin = new Float32Array(ledCount);
    const gLin = new Float32Array(ledCount);
    const bLin = new Float32Array(ledCount);

    // Frequencies per strip (animated)
    const w1 = 2.0 * Math.PI * (0.65 + 0.15 * Math.sin(tMs * 0.00023));
    const w2 = 2.0 * Math.PI * (1.10 + 0.20 * Math.sin(tMs * 0.00017));
    const w3 = 2.0 * Math.PI * (0.38 + 0.10 * Math.cos(tMs * 0.00019));

    // Phase drift (increased multipliers for visible motion)
    const ph1 = tMs * speed * 0.021;
    const ph2 = tMs * speed * 0.017;
    const ph3 = tMs * speed * 0.027;

    const lastIdx = Math.max(1, ledCount - 1);

    // -------- Main render (two layers blended) --------
    for (let i = 0; i < ledCount; i++) {
      const effI = applyTransformations(i, ledCount, mirror, reverse);
      const u = effI / lastIdx; // 0..1

      // domain warp (use both pixel and time)
      const warpSig =
        Math.sin(u * w1 + ph1) * 0.6 +
        Math.sin(u * (w2 * 0.5) + ph2) * 0.4;

      const uw = u + warp * 0.25 * warpSig;

      // core plasma signal (two independent layers)
      const sA =
        Math.sin(uw * w1 + ph1) * 0.6 +
        Math.sin(uw * w2 + ph2) * 0.4 +
        Math.sin(uw * w3 + ph3) * 0.35;

      const sB =
        Math.sin((uw + 0.07) * (w1 * 0.9) - ph2) * 0.55 +
        Math.sin((uw - 0.11) * (w2 * 1.1) + ph3) * 0.45 +
        Math.cos((uw + 0.19) * (w3 * 1.3) - ph1) * 0.30;

      // gentle texture to avoid banding
      const tex = (this.hash1D(i * 0.318 + Math.floor(tMs * 0.002)) - 0.5) * 2 * noiseAmount;

      // Normalize to 0..1 (removed 0.8 scaling to use full dynamic range)
      const nA = 0.5 + 0.5 * this.clamp01(sA + tex);
      const nB = 0.5 + 0.5 * this.clamp01(sB - tex);

      // Hue sweep
      const hA = (hueBase + nA * hueRange) % 360;
      const hB = (hueBase + layerOffset + nB * hueRange) % 360;

      // Value shaping (contrast)
      const vA = Math.pow(nA, contrast);
      const vB = Math.pow(nB, contrast);

      const cA = hsvToRgb(hA, this.clamp01(saturation), this.clamp01(vA * intensity));
      const cB = hsvToRgb(hB, this.clamp01(saturation), this.clamp01(vB * intensity));

      // soft-light blend in linear-ish space (hsvToRgb returns 0..1)
      const r = this.softLight(cA.r, cB.r);
      const g = this.softLight(cA.g, cB.g);
      const b = this.softLight(cA.b, cB.b);

      rLin[i] = r;
      gLin[i] = g;
      bLin[i] = b;
    }

    // -------- Optional 1D neighbor blur --------
    if (blur > 0) {
      const a = Math.min(0.4, Math.max(0, blur));
      const b = 1 - 2 * a;
      const r2 = new Float32Array(ledCount);
      const g2 = new Float32Array(ledCount);
      const b2 = new Float32Array(ledCount);
      for (let i = 0; i < ledCount; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < ledCount - 1 ? i + 1 : i;
        r2[i] = a * rLin[L] + b * rLin[i] + a * rLin[R];
        g2[i] = a * gLin[L] + b * gLin[i] + a * gLin[R];
        b2[i] = a * bLin[L] + b * bLin[i] + a * bLin[R];
      }
      rLin.set(r2); gLin.set(g2); bLin.set(b2);
    }

    // -------- Tone-map + gamma, write buffer --------
    for (let i = 0; i < ledCount; i++) {
      // Apply exposure before tone mapping
      let r = this.toneMapReinhard(rLin[i] * exposure, 1.0) * gammaBoost;
      let g = this.toneMapReinhard(gLin[i] * exposure, 1.0) * gammaBoost;
      let b = this.toneMapReinhard(bLin[i] * exposure, 1.0) * gammaBoost;
      
      // Clamp and scale to 0-255
      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      const px = i * 3;
      buffer[px]     = Math.max(0, Math.min(255, Math.floor(r * 255)));
      buffer[px + 1] = Math.max(0, Math.min(255, Math.floor(g * 255)));
      buffer[px + 2] = Math.max(0, Math.min(255, Math.floor(b * 255)));
    }

    // -------- Optional temporal blend --------
    if (this.prevFrame && temporalBlend > 0) {
      const t = Math.min(0.4, Math.max(0, temporalBlend));
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(buffer[i] * (1 - t) + this.prevFrame[i] * t);
      }
    }
    this.prevFrame = new Uint8Array(buffer);

    return buffer;
  }
}

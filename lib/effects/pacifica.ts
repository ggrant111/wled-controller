/**
 * Pacifica Effect — Enhanced
 * - Domain-warped multilayer waves
 * - Interference-based whitecaps + foam speckle
 * - Depth fog, soft-light blend, filmic tone map, gamma-correct
 */

import { EffectGenerator } from './helpers';
import { RGBColor } from './helpers/colorUtils';

type RGB = { r: number; g: number; b: number };

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
function srgbToLin(u8: number) {
  const x = u8 / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function linToSrgb(x: number) {
  const y = clamp01(x);
  const v = y <= 0.0031308 ? y * 12.92 : 1.055 * Math.pow(y, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}
function softLight(a: number, b: number) {
  // a,b in linear [0..1]; soft-light blend (subtle contrast without clipping)
  return (1 - 2 * b) * a * a + 2 * b * a;
}
function toneMapReinhard(x: number, exposure = 1.0) {
  const v = x * Math.max(0.001, exposure);
  return v / (1 + v);
}
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function samplePaletteInterp(pal: RGBColor[], idx: number): RGB {
  const n = pal.length;
  const f = ((idx % n) + n) % n;
  const i0 = Math.floor(f);
  const i1 = (i0 + 1) % n;
  const t = f - i0;
  const c0 = pal[i0], c1 = pal[i1];
  return {
    r: c0.r + (c1.r - c0.r) * t,
    g: c0.g + (c1.g - c0.g) * t,
    b: c0.b + (c1.b - c0.b) * t,
  };
}

export class PacificaEffect implements EffectGenerator {
  // Palettes (unchanged from your version)
  private readonly pacificaPalette1: RGBColor[] = [
    { r: 0, g: 5, b: 7 }, { r: 0, g: 4, b: 9 }, { r: 0, g: 3, b: 11 }, { r: 0, g: 3, b: 13 },
    { r: 0, g: 2, b: 16 }, { r: 0, g: 2, b: 18 }, { r: 0, g: 1, b: 20 }, { r: 0, g: 1, b: 23 },
    { r: 0, g: 0, b: 25 }, { r: 0, g: 0, b: 28 }, { r: 0, g: 0, b: 38 }, { r: 0, g: 0, b: 49 },
    { r: 0, g: 0, b: 59 }, { r: 0, g: 0, b: 70 }, { r: 20, g: 85, b: 75 }, { r: 40, g: 170, b: 80 }
  ];
  private readonly pacificaPalette2: RGBColor[] = [
    { r: 0, g: 5, b: 7 }, { r: 0, g: 4, b: 9 }, { r: 0, g: 3, b: 11 }, { r: 0, g: 3, b: 13 },
    { r: 0, g: 2, b: 16 }, { r: 0, g: 2, b: 18 }, { r: 0, g: 1, b: 20 }, { r: 0, g: 1, b: 23 },
    { r: 0, g: 0, b: 25 }, { r: 0, g: 0, b: 28 }, { r: 0, g: 0, b: 38 }, { r: 0, g: 0, b: 49 },
    { r: 0, g: 0, b: 59 }, { r: 0, g: 0, b: 70 }, { r: 12, g: 95, b: 82 }, { r: 25, g: 190, b: 95 }
  ];
  private readonly pacificaPalette3: RGBColor[] = [
    { r: 0, g: 2, b: 8 }, { r: 0, g: 3, b: 14 }, { r: 0, g: 5, b: 20 }, { r: 0, g: 6, b: 26 },
    { r: 0, g: 8, b: 32 }, { r: 0, g: 9, b: 39 }, { r: 0, g: 11, b: 45 }, { r: 0, g: 12, b: 51 },
    { r: 0, g: 14, b: 57 }, { r: 0, g: 16, b: 64 }, { r: 0, g: 20, b: 80 }, { r: 0, g: 24, b: 96 },
    { r: 0, g: 28, b: 112 }, { r: 0, g: 32, b: 128 }, { r: 16, g: 64, b: 191 }, { r: 32, g: 96, b: 255 }
  ];

  private lastTime = 0;
  private gradPrev: number[] = []; // for gradient magnitude

  private ensureState(ledCount: number) {
    if (this.gradPrev.length !== ledCount) {
      this.gradPrev = new Array(ledCount).fill(0);
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    // ----- Parameters -----
    const speed         = params.get('speed') ?? 1.0;       // global speed
    const intensity     = params.get('intensity') ?? 1.0;   // global brightness multiplier
    const warpAmount    = params.get('warp') ?? 0.55;       // domain warp strength (0..1)
    const foamStrength  = params.get('foam') ?? 0.6;        // whitecap/foam strength
    const fogDepth      = params.get('fog') ?? 0.25;        // depth haze (0..1)
    const gammaBoost    = params.get('gamma') ?? 1.0;       // post gamma multiplier (perceived lift)
    const exposure      = params.get('exposure') ?? 1.0;    // filmic curve exposure
    const direction     = params.get('dir') ?? 1;           // 1 or -1 (flow direction)
    const mirror        = params.get('mirror') ?? false;    // mirror across center
    const whitecapBias  = params.get('whitecapBias') ?? 0.66; // energy threshold bias
    const swellSpeed    = params.get('swellSpeed') ?? 0.05;   // slow tide breathing
    const detail        = params.get('detail') ?? 1.0;        // spatial detail scalar for layers

    // Robust time normalization (assume ms if large)
    const tMsRaw = time > 5_000 ? time : time * 1000;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large enough period (1 hour in milliseconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const tMs = tMsRaw % TIME_WRAP_MS;
    
    // For dt calculation, handle wrap-around correctly
    // Calculate dt from unwrapped time to get accurate frame delta
    let dt: number;
    if (this.lastTime > 0) {
      const unwrappedDt = Math.max(1, tMsRaw - this.lastTime);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 100); // Max 100ms delta
    } else {
      dt = 16; // Default frame time
    }
    this.lastTime = tMsRaw; // Store unwrapped for next frame's dt calculation

    // Slow global “tide” (0..1), modulates intensity and palette wander slightly
    const tide = 0.5 + 0.5 * Math.sin(tMs * swellSpeed * 0.001 * Math.PI * 2);
    const tideGain = mix(0.9, 1.1, tide); // tiny scene breathing

    // Prepare linear buffer (gamma-correct pipeline)
    // Start with zero - soft-light will work correctly when we blend additive first
    const linR = new Float32Array(ledCount);
    const linG = new Float32Array(ledCount);
    const linB = new Float32Array(ledCount);

    this.ensureState(ledCount);

    // ----- Layer setup -----
    // Four layers with different wavelengths and drift; modulated over time.
    const layers = [
      { pal: this.pacificaPalette1, baseFreq: 0.0040, drift:  0.11, amp: 1.00, phaseRate: 0.23 },
      { pal: this.pacificaPalette2, baseFreq: 0.0065, drift: -0.08, amp: 0.90, phaseRate: -0.19 },
      { pal: this.pacificaPalette3, baseFreq: 0.0100, drift:  0.05, amp: 0.75, phaseRate: 0.31 },
      { pal: this.pacificaPalette3, baseFreq: 0.0150, drift: -0.03, amp: 0.60, phaseRate: -0.27 },
    ];

    // Reversible position with optional mirror
    const idxAt = (i: number) => {
      let x = i;
      if (mirror) {
        const mid = (ledCount - 1) / 2;
        x = Math.abs(i - mid) * 2; // fold around center
      }
      return x;
    };

    // Precompute a shallow depth curve (near = 0, far = 1)
    // Slight convex to deepen the far end and let fog modulate color later
    const depth = new Float32Array(ledCount);
    for (let i = 0; i < ledCount; i++) {
      const u = idxAt(i) / Math.max(1, (mirror ? (ledCount - 1) / 2 : (ledCount - 1)));
      depth[i] = Math.pow(u, 0.8);
    }

    // ----- Render pass -----
    // Domain warp accumulator for interference & foam detection
    const energy = new Float32Array(ledCount);

    for (let L = 0; L < layers.length; L++) {
      const { pal, baseFreq, drift, amp, phaseRate } = layers[L];

      // Layer-local time modulation
      const s = speed * (1 + 0.15 * Math.sin(0.0007 * tMs + L));
      const freq = baseFreq * mix(0.85, 1.15, 0.5 + 0.5 * Math.sin(0.0009 * tMs + L * 1.7)) * detail;
      const phase = (tMs * 0.001) * phaseRate * s * direction;

      // Domain warp input from previous layers (coupled)
      // compute a mild warp signal across the strip first
      const warpSignal = new Float32Array(ledCount);
      for (let i = 0; i < ledCount; i++) {
        const x = idxAt(i);
        const u = x * freq + phase + warpAmount * 0.35 * Math.sin((x * baseFreq * 0.9) + phase * 1.3 + L);
        warpSignal[i] = Math.sin(u * Math.PI * 2);
      }

      // Use warpSignal to perturb sampling; then sample palette smoothly
      for (let i = 0; i < ledCount; i++) {
        const x = idxAt(i);
        const warp = warpAmount * 0.5 * (
          warpSignal[i] +
          (i > 0 ? 0.5 * warpSignal[i - 1] : 0) +
          (i < ledCount - 1 ? 0.5 * warpSignal[i + 1] : 0)
        );

        const u = x * freq + phase + warp;
        const sWave = Math.sin(u * Math.PI * 2);               // -1..1
        const cWave = 0.5 + 0.5 * sWave;                       // 0..1
        const idx = (cWave * (pal.length - 1)) + tide * 0.2;   // tiny tide wander

        // Sample palette in sRGB then convert to linear for blending
        const c = samplePaletteInterp(pal, idx);
        const lr = srgbToLin(c.r);
        const lg = srgbToLin(c.g);
        const lb = srgbToLin(c.b);

        // Layer brightness shaping (favor trough glow less than crest)
        const crest = smoothstep(0.45, 1.0, cWave);
        const layerGain = amp * mix(0.55, 1.0, crest) * (0.85 + 0.3 * tide);

        // Additive blend all layers to preserve color saturation
        // This ensures blue/green ocean colors remain visible
        linR[i] += lr * layerGain;
        linG[i] += lg * layerGain;
        linB[i] += lb * layerGain;

        // Accumulate energy for whitecap detection (sum of positive curvature)
        energy[i] += Math.max(0, sWave) * amp;
      }
    }

    // ----- Whitecaps & foam (interference + gradient) -----
    // Use local gradient to find sharp crests; bias with energy.
    const foam = new Float32Array(ledCount);
    for (let i = 0; i < ledCount; i++) {
      const e = energy[i] / layers.length; // normalize 0..~1
      const prev = i > 0 ? energy[i - 1] : energy[i];
      const next = i < ledCount - 1 ? energy[i + 1] : energy[i];
      const grad = Math.abs(next - prev);

      // Temporal smoothing of gradient to avoid sparkle strobe
      const gPrev = this.gradPrev[i] || 0;
      // Ensure dt is valid and prevent division issues
      const validDt = Math.max(1, dt);
      const gSm = gPrev + (grad - gPrev) * (1 - Math.exp(-validDt / 120));
      this.gradPrev[i] = gSm;

      // Threshold via smoothstep using both energy and gradient
      const cap = smoothstep(whitecapBias * 0.8, whitecapBias + 0.2, e) * smoothstep(0.05, 0.18, gSm);
      foam[i] = cap;
    }

    // Add foam as cool-white with slight aqua tint, include tiny speckle twinkle
    for (let i = 0; i < ledCount; i++) {
      if (foam[i] > 0.001) {
        const twinkle = 0.85 + 0.15 * Math.sin((i * 0.7 + tMs * 0.007) + Math.sin(i * 0.13 + tMs * 0.003));
        const f = foam[i] * foamStrength * twinkle * 0.3; // Reduced foam strength to preserve colors

        // Foam color in linear (slightly bluish white, but less dominant)
        const fr = 0.95, fg = 1.0, fb = 1.05;
        // Use additive blend for foam instead of soft-light to prevent color washout
        linR[i] += fr * f * 0.2;
        linG[i] += fg * f * 0.2;
        linB[i] += fb * f * 0.2;
      }
    }

    // ----- Depth fog / vignetting toward distance -----
    if (fogDepth > 0) {
      for (let i = 0; i < ledCount; i++) {
        const d = depth[i];
        const fog = mix(1.0, 0.82, d * fogDepth); // dim far end a touch
        linR[i] *= fog;
        linG[i] *= fog;
        linB[i] *= fog;
      }
    }

    // ----- Tone mapping + gamma -----
    const buffer = Buffer.alloc(ledCount * 3);
    // Lower gain to preserve colors and prevent white washout
    const gain = clamp01(intensity) * tideGain * gammaBoost * 0.8;

    for (let i = 0; i < ledCount; i++) {
      // Filmic tone-map to avoid clipping when layers pile up
      const r = toneMapReinhard(linR[i] * gain, exposure);
      const g = toneMapReinhard(linG[i] * gain, exposure);
      const b = toneMapReinhard(linB[i] * gain, exposure);

      const px = i * 3;
      buffer[px]     = linToSrgb(r);
      buffer[px + 1] = linToSrgb(g);
      buffer[px + 2] = linToSrgb(b);
      
      // Defensive check: ensure no NaN or invalid values
      if (!isFinite(buffer[px]) || !isFinite(buffer[px + 1]) || !isFinite(buffer[px + 2])) {
        buffer[px] = 0;
        buffer[px + 1] = 0;
        buffer[px + 2] = 0;
      }
    }

    return buffer;
  }
}

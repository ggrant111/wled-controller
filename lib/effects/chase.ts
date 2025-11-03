/**
 * Chase Effect (enhanced)
 *
 * Params (Map):
 * - speed: 0..10 (mapped to pixels/sec)
 * - count: number of simultaneous chases (default 1)
 * - length: visual length of each chase in pixels (sigma-based tail) (default 8)
 * - headWidth: sharpness of the head in px (sigma for the Gaussian) (default 2.0)
 * - spacing: optional spacing override in px between chases (default: ledCount / count)
 * - duty: 0..1 fraction “on” within each spacing (create gaps) (default 1.0 = always on)
 * - jitter: 0..1 random phase offset per chase (stable based on instanceKey) (default 0)
 * - blend: 'max' | 'add' | 'screen' | 'alpha' (default 'max')
 * - alpha: 0..1 intensity scaler for alpha blend (only used if blend='alpha', default 1)
 * - backgroundColor: '#000000' (RGB)
 * - backgroundDim: 0..1 multiplier applied to backgroundColor (default 1)
 * - reverse: boolean
 * - mirror: boolean
 * - colorMode: 'cycle' | 'list' (getColorMode(params))
 * - usePalette: boolean (prefer palette if present unless explicitly false)
 * - blur: 0..10 controls tail blur (0 = abrupt cutoff, 10 = smooth comet tail)
 * - cycleRate: palette crawl in cycles/sec (default 0.1)
 * - instanceKey: string to stabilize jitter phases between frames (default 'default')
 */

import { EffectGenerator } from './helpers';
import { parseColor } from './helpers/colorUtils';
import {
  getColorsFromParams,
  getColorMode,
  getPalette,
  createTempPalette,
  paletteManager
} from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

export class ChaseEffect implements EffectGenerator {
  /** Normalize time to seconds whether input is ms or s */
  private toSeconds(time: number): number {
    if (!isFinite(time)) return 0;
    return time > 1e6 ? time / 1000 : time;
  }

  /**
   * Map speed slider [0..10] to pixels/second.
   * Tweak MAX_PXPS to taste (default 240 = reasonable chase speed at max).
   * Uses smoothstep easing so low speeds are still visibly moving.
   */
  private mapSpeed(speed: number, MAX_PXPS = 240): number {
    const clamped = Math.max(0, Math.min(10, Number(speed) || 0));
    const t = clamped / 10; // 0..1
    // smoothstep for nicer low-speed control
    const eased = t * t * (3 - 2 * t);
    return eased * MAX_PXPS; // px/sec
  }

  /** Ring distance (shortest) on length L */
  private ringDistance(a: number, b: number, L: number): number {
    const d = Math.abs(a - b);
    return Math.min(d, L - d);
  }

  /** Gaussian falloff: sigma controls sharpness, returns 0..1 */
  private gaussian(distance: number, sigma: number): number {
    if (sigma <= 0) return distance === 0 ? 1 : 0;
    const n = distance / sigma;
    return Math.exp(-0.5 * n * n);
  }

  /** Blend helpers */
  private blendMax(dst: number, src: number): number { return Math.max(dst, src); }
  private blendAdd(dst: number, src: number): number { return Math.min(255, dst + src); }
  private blendScreen(dst: number, src: number): number {
    // screen = 1 - (1-d)(1-s)
    const d = dst / 255; const s = src / 255;
    return Math.min(255, Math.round((1 - (1 - d) * (1 - s)) * 255));
  }
  private blendAlpha(dst: number, src: number, a: number): number {
    // out = dst*(1-a) + src*a
    return Math.round(dst * (1 - a) + src * a);
  }

  /** Simple stable pseudo-random based on string seed + index */
  private hash01(seed: string, i: number): number {
    let h = 2166136261 ^ i;
    for (let c = 0; c < seed.length; c++) {
      h ^= seed.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    // map uint32 -> [0,1)
    return ((h >>> 0) / 0xffffffff);
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    // core params
    const speedParam = params.get('speed') ?? 5;      // 0..10
    const count      = Math.max(1, Math.floor(params.get('count') ?? 1));
    const lengthPx   = Math.max(1, Number(params.get('length') ?? 8));      // visual length
    const headWidth  = Math.max(0.1, Number(params.get('headWidth') ?? 2)); // Gaussian sigma
    const blur       = Math.max(0, Math.min(10, Number(params.get('blur') ?? 5))); // 0..10
    const spacingOpt = params.get('spacing'); // optional pixels between chases
    const duty       = Math.max(0, Math.min(1, Number(params.get('duty') ?? 1))); // 0..1
    const jitter     = Math.max(0, Math.min(1, Number(params.get('jitter') ?? 0)));
    const reverse    = !!(params.get('reverse') ?? false);
    const mirror     = !!(params.get('mirror') ?? false);

    const blendMode  = (params.get('blend') ?? 'max') as 'max' | 'add' | 'screen' | 'alpha';
    const alpha      = Math.max(0, Math.min(1, Number(params.get('alpha') ?? 1)));

    const bgCol   = parseColor(params.get('backgroundColor') ?? '#000000');
    const bgDim   = Math.max(0, Math.min(1, Number(params.get('backgroundDim') ?? 1)));

    const colorMode = getColorMode(params); // 'cycle' | 'list'
    const palette   = getPalette(params);
    // usePalette can be explicitly true/false, or defaults to using palette if available
    const usePaletteParam = params.get('usePalette');
    const usePalette = usePaletteParam !== undefined 
      ? !!usePaletteParam && !!palette  // Explicit: respect user choice
      : (palette != null);              // Default: use palette if available

    const cycleRate = Number(params.get('cycleRate') ?? 0.1); // cycles/sec through palette
    const instanceKey = String(params.get('instanceKey') ?? 'default');

    const buf = Buffer.alloc(ledCount * 3);

    // background fill (dim applied)
    const bgr = Math.round(bgCol.r * bgDim);
    const bgg = Math.round(bgCol.g * bgDim);
    const bgb = Math.round(bgCol.b * bgDim);
    for (let i = 0; i < ledCount; i++) {
      const p = i * 3; buf[p] = bgr; buf[p + 1] = bgg; buf[p + 2] = bgb;
    }

    if (ledCount <= 0) return buf;

    // timing
    const tSecRaw = this.toSeconds(time);
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large enough period (1 hour in seconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_SEC = 3600; // 1 hour in seconds
    const tSec = tSecRaw % TIME_WRAP_SEC;
    
    const pxPerSec = this.mapSpeed(speedParam);
    const dir = reverse ? -1 : 1;

    // spacing and per-chase segment size
    const spacing = Number.isFinite(spacingOpt) && spacingOpt > 0
      ? Number(spacingOpt)
      : ledCount / count;

    // Precompute a color accessor per chase
    const colorsList = getColorsFromParams(params, '#ff0000');
    const getChaseColor = (cIdx: number): { r: number; g: number; b: number } => {
      if (colorMode === 'cycle') {
        const basePhase = (cIdx / Math.max(1, count)); // spread colors
        const cyclePos = ((tSec * cycleRate) + basePhase) % 1;
        if (usePalette && palette) {
          return paletteManager.interpolateColor(palette, cyclePos);
        } else {
          // build a temp palette from the provided list and sample across it
          const temp = createTempPalette(colorsList);
          return paletteManager.interpolateColor(temp, cyclePos);
        }
      } else {
        return colorsList[cIdx % colorsList.length];
      }
    };

    // Loop pixels and accumulate contributions
    for (let i = 0; i < ledCount; i++) {
      // account for mirror/reverse on the *physical* LED index
      const physIdx = applyTransformations(i, ledCount, mirror, false); // reverse handled via dir

      let accR = buf[i * 3];
      let accG = buf[i * 3 + 1];
      let accB = buf[i * 3 + 2];

      for (let cIdx = 0; cIdx < count; cIdx++) {
        // Each chase has a stable jittered phase offset
        const jitterPhase = jitter * this.hash01(instanceKey, cIdx) * spacing; // in pixels

        // Where is this chase head *now*?
        // Place heads cIdx*spacing apart, move at pxPerSec, wrap around ring.
        let head = (cIdx * spacing + jitterPhase + dir * (tSec * pxPerSec)) % ledCount;
        if (head < 0) head += ledCount;

        // Optional duty: only light for the first duty*spacing portion of its local window
        if (duty < 1) {
          const local = (head % spacing) / spacing; // 0..1 within its spacing cell
          if (local > duty) continue;
        }

        // Distance on ring between current pixel and head
        const dist = this.ringDistance(physIdx, head, ledCount);

        // Blur parameter controls tail falloff: 0 = abrupt cutoff, 10 = smooth comet tail
        const blurFactor = blur / 10; // 0..1
        let intensity: number;

        if (blurFactor === 0) {
          // No blur: abrupt cutoff at head + length
          intensity = dist <= (headWidth + lengthPx) ? 1 : 0;
        } else {
          // Soft head + tail using Gaussian; blur controls tail smoothness
          // At blur=0: sharp cutoff, at blur=10: smooth comet tail
          const headIntensity = this.gaussian(dist, headWidth);
          
          // Tail sigma scales with blur: minimum = headWidth, maximum = lengthPx
          // Interpolate between sharp (blur=0) and smooth (blur=10)
          const minTailSigma = headWidth;
          const maxTailSigma = Math.max(headWidth, lengthPx);
          const tailSigma = minTailSigma + (maxTailSigma - minTailSigma) * blurFactor;
          const tailIntensity = this.gaussian(dist, tailSigma);
          
          // Blend head and tail, with tail contribution increasing with blur
          const tailWeight = 0.4 + (blurFactor * 0.4); // 0.4 at blur=0, 0.8 at blur=10
          intensity = Math.max(headIntensity, tailIntensity * tailWeight);
        }

        if (intensity <= 0.001) continue;

        const col = getChaseColor(cIdx);
        
        // Use alpha blending to override background: chase color replaces background based on intensity
        // At intensity=1: pure chase color, at intensity=0: background stays
        // This prevents color washing/blending - chase color overrides background
        const a = Math.max(0, Math.min(1, intensity));
        accR = Math.round(accR * (1 - a) + col.r * a);
        accG = Math.round(accG * (1 - a) + col.g * a);
        accB = Math.round(accB * (1 - a) + col.b * a);
      }

      buf[i * 3] = accR; buf[i * 3 + 1] = accG; buf[i * 3 + 2] = accB;
    }

    return buf;
  }
}

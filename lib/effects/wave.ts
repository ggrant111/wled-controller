/**
 * Wave Effect (dynamic, modulated, multi-wave)
 */

import { EffectGenerator } from './helpers';
import { getColorMode, getPalette, paletteManager, createTempPalette } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';
import { parseColor, RGBColor } from './helpers/colorUtils';

export class WaveEffect implements EffectGenerator {

  // --- Utilities ---
  private toSeconds(time: number): number {
    return !isFinite(time) ? 0 : (time > 1e6 ? time / 1000 : time);
  }

  /**
   * Map speed slider [0..10] to cycles per second of phase motion.
   * Tweak MAX_CPS to taste (default 2.0 = 2 full wave cycles per second at max speed).
   * Uses smoothstep easing so low speeds are still visibly moving.
   */
  private mapSpeed(speed: number, MAX_CPS = 2.0): number {
    const clamped = Math.max(0, Math.min(10, Number(speed) || 0));
    const t = clamped / 10; // 0..1
    const eased = t * t * (3 - 2 * t); // smoothstep
    return eased * MAX_CPS; // cycles/sec of phase over time
  }

  private hash01(seed: string, i: number): number {
    let h = 2166136261 ^ i;
    for (let c = 0; c < seed.length; c++) {
      h ^= seed.charCodeAt(c);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff;
  }

  private triangle(x: number): number {
    // x in radians; map to 0..1
    const t = (x / (2 * Math.PI)) % 1;
    const u = t < 0 ? t + 1 : t;
    return 1 - Math.abs(2 * u - 1);
  }

  private saw(x: number): number {
    const t = (x / (2 * Math.PI)) % 1;
    const u = t < 0 ? t + 1 : t;
    return u; // 0..1
  }

  private square(x: number): number {
    return ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < Math.PI ? 1 : 0;
  }

  private noisePhase(x: number): number {
    // Simple hash-based pseudo-noise from phase; returns 0..1
    const k = Math.floor(x * 1000);
    const r = ((k * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    return r;
  }

  private waveSample(waveform: string, phaseRad: number): number {
    switch (waveform) {
      case 'triangle': return this.triangle(phaseRad);
      case 'saw':      return this.saw(phaseRad);
      case 'square':   return this.square(phaseRad);
      case 'abs_sine': return Math.abs(Math.sin(phaseRad)); // 0..1
      case 'noise':    return this.noisePhase(phaseRad);
      default:         return (Math.sin(phaseRad) + 1) * 0.5; // sine 0..1
    }
  }

  private blendMax(d: number, s: number) { return Math.max(d, s); }
  private blendAdd(d: number, s: number) { return Math.min(255, d + s); }
  private blendScreen(d: number, s: number) {
    const D = d / 255, S = s / 255;
    return Math.round((1 - (1 - D) * (1 - S)) * 255);
  }
  private blendAlpha(d: number, s: number, a: number) {
    return Math.round(d * (1 - a) + s * a);
  }

  private applyGamma01(v: number, gamma: number): number {
    return gamma === 1 ? v : Math.pow(Math.max(0, Math.min(1, v)), gamma);
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    // ---- Parameters ----
    const speed        = params.get('speed') ?? 5;          // 0..10
    const spatialFreq  = Math.max(0.01, Number(params.get('spatialFreq') ?? 1)); // cycles across strip
    const waves        = Math.max(1, Math.floor(params.get('waves') ?? (params.get('count') ?? 1)));
    const reverse      = !!(params.get('reverse') ?? false);
    const mirror       = !!(params.get('mirror') ?? false);

    // Modulations
    const amDepth   = Math.max(0, Math.min(1, Number(params.get('amDepth') ?? 0))); // amplitude mod depth
    const amRate    = Math.max(0, Number(params.get('amRate') ?? 0.2));             // Hz
    const fmDepth   = Math.max(0, Math.min(1, Number(params.get('fmDepth') ?? 0))); // fraction of spatialFreq
    const fmRate    = Math.max(0, Number(params.get('fmRate') ?? 0.15));            // Hz

    // Per-wave variations
    const dispersion = Math.max(0, Math.min(1, Number(params.get('dispersion') ?? 0.2))); // wavelength spread
    const jitter     = Math.max(0, Math.min(1, Number(params.get('jitter') ?? 0.3)));     // phase offset randomness

    // Color/palette
    const colorMode   = getColorMode(params); // 'cycle' | 'list'
    const palette     = getPalette(params);
    // usePalette can be explicitly true/false, or defaults to using palette if available
    const usePaletteParam = params.get('usePalette');
    const usePalette = usePaletteParam !== undefined 
      ? !!usePaletteParam && !!palette  // Explicit: respect user choice
      : (palette != null);              // Default: use palette if available
    // Get colors list - if usePalette is false, get from colors param directly, ignoring palette
    let colorsList: RGBColor[];
    if (usePalette && palette) {
      colorsList = palette.colors.map(c => parseColor(c));
    } else {
      // When not using palette, get colors from colors array parameter
      const colors = params.get('colors');
      if (Array.isArray(colors) && colors.length > 0) {
        colorsList = colors.map(c => parseColor(c));
      } else {
        colorsList = [parseColor('#00ff00')];
      }
    }
    const colorSample = (params.get('colorSample') ?? 'position') as 'position' | 'phase'; // how to index color
    const cycleRate   = Number(params.get('cycleRate') ?? 0.1); // palette crawl Hz

    // Brightness/gamma/background
    const brightness  = Math.max(0, Math.min(1, Number(params.get('brightness') ?? 1)));
    const gamma       = Math.max(0.5, Math.min(3, Number(params.get('gamma') ?? 1.8)));
    const bgColor     = parseColor(params.get('backgroundColor') ?? '#000000');
    const bgDim       = Math.max(0, Math.min(1, Number(params.get('backgroundDim') ?? 1)));

    // Blend
    const blendMode = (params.get('blend') ?? 'max') as 'max' | 'add' | 'screen' | 'alpha';
    const alpha     = Math.max(0, Math.min(1, Number(params.get('alpha') ?? 1)));

    const instanceKey = String(params.get('instanceKey') ?? 'default');

    // ---- Setup ----
    const buf = Buffer.alloc(ledCount * 3);
    if (ledCount <= 0) return buf;

    const t = this.toSeconds(time);
    const cps = this.mapSpeed(speed); // cycles/sec of phase travel
    const dir = reverse ? -1 : 1;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large enough period (3600 seconds = 1 hour) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP = 3600; // seconds
    const tWrapped = t % TIME_WRAP;

    // Background fill (dimmed)
    const bgr = Math.round(bgColor.r * bgDim);
    const bgg = Math.round(bgColor.g * bgDim);
    const bgb = Math.round(bgColor.b * bgDim);
    for (let i = 0; i < ledCount; i++) {
      const p = i * 3; buf[p] = bgr; buf[p + 1] = bgg; buf[p + 2] = bgb;
    }

    // Palette accessor
    const getColor = (pos01: number): { r: number; g: number; b: number } => {
      const basePos = ((pos01 % 1) + 1) % 1;
      if (usePalette && palette) {
        return paletteManager.interpolateColor(palette, basePos);
      } else {
        const temp = createTempPalette(colorsList);
        return paletteManager.interpolateColor(temp, basePos);
      }
    };

    const waveform = String(params.get('waveform') ?? 'sine');

    // ---- Render ----
    for (let i = 0; i < ledCount; i++) {
      // Physical index after mirror/reverse (reverse handled by dir in phase)
      const phys = applyTransformations(i, ledCount, mirror, false);
      const x01 = phys / Math.max(1, ledCount - 1); // 0..1 across strip

      // Accumulate multiple waves
      let acc = 0;
      for (let w = 0; w < waves; w++) {
        // Stable per-wave variations
        const r = this.hash01(instanceKey, w);
        const phaseJitter = (jitter * (r - 0.5)) * 2 * Math.PI; // -j..+j radians
        const localDisp = 1 + (r - 0.5) * 2 * dispersion;       // e.g. 0.8..1.2

        // FM: modulate spatial frequency over time (use wrapped time)
        const fm = fmDepth > 0 ? (1 + fmDepth * Math.sin(2 * Math.PI * (fmRate * tWrapped + r))) : 1;
        const effSpatialFreq = Math.max(0.01, spatialFreq * localDisp * fm);

        // Phase over time (dir flips travel direction) - use wrapped time to prevent unbounded growth
        const phaseCycles = dir * cps * tWrapped; // cycles
        const phaseRad = 2 * Math.PI * (effSpatialFreq * x01 + phaseCycles) + phaseJitter;

        // AM: modulate amplitude over time (use wrapped time)
        const am = amDepth > 0 ? (1 - amDepth + amDepth * (Math.sin(2 * Math.PI * (amRate * tWrapped + r)) * 0.5 + 0.5)) : 1;

        // Sample waveform (0..1), gamma-shape it a little post-sum
        acc += am * this.waveSample(waveform, phaseRad);
      }

      // Normalize by number of waves and apply gamma + brightness
      let intensity = acc / waves;
      intensity = this.applyGamma01(intensity, gamma) * brightness;
      intensity = Math.max(0, Math.min(1, intensity));

      // Color selection:
      // - 'position': color follows physical position (nice gradient ribbons)
      // - 'phase': color tied to phase (color travels with the wavefront)
      const colorIndexPhase = (spatialFreq * x01 + cps * tWrapped) % 1;
      const colorPos = (colorSample === 'phase') ? colorIndexPhase : x01;

      // Optional palette crawl over time (use wrapped time)
      const crawl = ((tWrapped * cycleRate) % 1 + 1) % 1;
      const color = getColor((colorPos + crawl) % 1);

      const srcR = Math.round(color.r * intensity);
      const srcG = Math.round(color.g * intensity);
      const srcB = Math.round(color.b * intensity);

      const pi = i * 3;
      let dR = buf[pi], dG = buf[pi + 1], dB = buf[pi + 2];

      switch (blendMode) {
        case 'add':
          dR = this.blendAdd(dR, srcR); dG = this.blendAdd(dG, srcG); dB = this.blendAdd(dB, srcB);
          break;
        case 'screen':
          dR = this.blendScreen(dR, srcR); dG = this.blendScreen(dG, srcG); dB = this.blendScreen(dB, srcB);
          break;
        case 'alpha': {
          const a = Math.max(0, Math.min(1, alpha * intensity));
          dR = this.blendAlpha(dR, srcR, a); dG = this.blendAlpha(dG, srcG, a); dB = this.blendAlpha(dB, srcB, a);
          break;
        }
        default: // 'max'
          dR = this.blendMax(dR, srcR); dG = this.blendMax(dG, srcG); dB = this.blendMax(dB, srcB);
      }

      buf[pi] = dR; buf[pi + 1] = dG; buf[pi + 2] = dB;
    }

    return buf;
  }
}

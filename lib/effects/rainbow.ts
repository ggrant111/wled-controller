/**
 * Rainbow Effect (fixed)
 * - Proper speed mapping (0..10) -> degrees/sec
 * - Time normalization (handles seconds or milliseconds)
 * - Works with palette or HSV
 * - Mirror/reverse supported
 */

import { EffectGenerator } from './helpers';
import { hsvToRgb } from './helpers/colorUtils';
import { getPalette, paletteManager } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

export class RainbowEffect implements EffectGenerator {

  /**
   * Map speed slider [0..10] to an angular velocity in degrees/second.
   * Tweak MAX_DPS to taste.
   */
  private mapSpeed(speed: number, MAX_DPS = 720): number {
    const clamped = Math.max(0, Math.min(10, Number(speed) || 0));
    const t = clamped / 10; // 0..1
    // Ease a little so low speeds are still visibly moving
    const eased = t * t * (3 - 2 * t); // smoothstep
    return eased * MAX_DPS; // deg/sec
  }

  /** Fast 8-bit scaling */
  private scale8(value: number, scale255: number): number {
    return (value * scale255 / 255) | 0;
  }

  private clamp255(n: number): number {
    return Math.max(0, Math.min(255, n | 0));
  }

  /** Normalize time to seconds regardless of input units */
  private toSeconds(time: number): number {
    if (!isFinite(time)) return 0;
    // Heuristic: if it's large, it's probably ms (e.g., performance.now())
    return time > 1e6 ? time / 1000 : time;
  }

  generate(
    params: Map<string, any>,
    ledCount: number,
    time: number,
    _width?: number,
    _height?: number
  ): Buffer {
    const speedParam = params.get('speed') ?? 5; // 0..10
    const saturation = Math.max(0, Math.min(1, params.get('saturation') ?? 1));
    const brightness = Math.max(0, Math.min(1, params.get('brightness') ?? 1));
    const reverse = !!(params.get('reverse') ?? false);
    const mirror = !!(params.get('mirror') ?? false);

    // Palette handling
    const palette = getPalette(params);
    // Only force palette if user explicitly asked OR a palette object is present AND usePalette was not explicitly false
    const usePalette = (params.get('usePalette') ?? (palette != null)) && palette;

    const buf = Buffer.alloc(ledCount * 3);

    // Time + speed -> hue offset in degrees
    const tSecRaw = this.toSeconds(time);
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in seconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_SEC = 3600; // 1 hour in seconds
    const tSec = tSecRaw % TIME_WRAP_SEC;
    
    const degPerSec = this.mapSpeed(speedParam, /*MAX_DPS*/ 720); // tweakable
    const hueOffsetDeg = (tSec * degPerSec) % 360;

    // Per-LED hue step across the strip
    const hueStepDeg = 360 / Math.max(1, ledCount);
    const brightness255 = Math.round(brightness * 255);

    // Some hsvToRgb helpers want hue 0..1; set this flag if yours does
    const hsvHueIsUnit = params.get('hsvHueIsUnit') ?? false;

    for (let i = 0; i < ledCount; i++) {
      const idx = applyTransformations(i, ledCount, mirror, reverse);

      // base hue for this pixel (degrees)
      const hueDeg = (hueOffsetDeg + idx * hueStepDeg) % 360;

      let r: number, g: number, b: number;

      if (usePalette && palette) {
        // Map degrees -> [0..1) for palette sampling
        const pos = ((hueDeg / 360) % 1 + 1) % 1;
        const pc = paletteManager.interpolateColor(palette, pos);
        r = this.scale8(pc.r, brightness255);
        g = this.scale8(pc.g, brightness255);
        b = this.scale8(pc.b, brightness255);
      } else {
        const hueForHSV = hsvHueIsUnit ? (hueDeg / 360) : hueDeg;
        const rgb = hsvToRgb(hueForHSV, saturation, brightness);
        r = this.clamp255(rgb.r);
        g = this.clamp255(rgb.g);
        b = this.clamp255(rgb.b);
      }

      const p = i * 3;
      buf[p] = r; buf[p + 1] = g; buf[p + 2] = b;
    }

    return buf;
  }
}

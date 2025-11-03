/**
 * Cylon Effect — Cinematic
 * - Time-based motion (px/sec), smooth bounce
 * - Gaussian eye, velocity-aware tail, impact squash
 * - Multi-eye, mirror, palette cycling
 * - Trail buffer with exponential decay, optional temporal blend
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

type RGB = { r: number; g: number; b: number };

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }
function easeOutCubic(x: number) { const t = clamp(x, 0, 1); return 1 - Math.pow(1 - t, 3); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export class CylonEffect implements EffectGenerator {
  // Continuous motion state
  private pos = 0;            // current head position (float, px)
  private dir = 1;            // +1 or -1
  private lastTime = 0;       // ms
  private impactT = 0;        // ms remaining of impact effect
  private prevFrame: Uint8Array | null = null;

  // Trail buffers (linear floats, not clamped u8)
  private trR: Float32Array | null = null;
  private trG: Float32Array | null = null;
  private trB: Float32Array | null = null;
  private alloc(leds: number) {
    if (!this.trR || this.trR.length !== leds) {
      this.trR = new Float32Array(leds);
      this.trG = new Float32Array(leds);
      this.trB = new Float32Array(leds);
    }
  }

  private getColorFor(
    mode: string,
    usePalette: boolean,
    palette: any,
    colors: RGB[],
    positionNorm: number,
    timeMs: number,
    speed: number
  ): RGB {
    if (mode === 'cycle') {
      // Wrap timeMs before calculation to prevent precision issues
      const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
      const timeWrapped = timeMs % TIME_WRAP_MS;
      const cycle = ((timeWrapped * 0.001) * (speed * 2)) % 1;
      if (usePalette && palette) {
        return paletteManager.interpolateColor(palette, cycle);
      } else {
        const tmp = createTempPalette(colors);
        return paletteManager.interpolateColor(tmp, cycle);
      }
    } else { // position
      const pos = (positionNorm % 1 + 1) % 1;
      if (usePalette && palette) {
        return paletteManager.interpolateColor(palette, pos);
      } else {
        const tmp = createTempPalette(colors);
        return paletteManager.interpolateColor(tmp, pos);
      }
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    // ---------- Parameters ----------
    const speed           = params.get('speed') ?? 0.25;  // cycles per second (one full there-and-back)
    const widthPx         = params.get('width') ?? 4;     // visual width (approx FWHM of Gaussian)
    const tailMs          = params.get('tailMs') ?? 380;  // trail decay time constant (ms)
    const tailGain        = params.get('tailGain') ?? 1.0;// how much current frame writes into trail
    const trailGamma      = params.get('trailGamma') ?? 1.0; // curve tail brightness (>=0.6..1.2)
    const temporalBlend   = params.get('temporalBlend') ?? 0.0; // 0..0.4 frame blend
    const reverse         = params.get('reverse') ?? false;
    const mirror          = params.get('mirror') ?? false;

    const eyes            = clamp(params.get('eyes') ?? 1, 1, 4); // 1..4 eyes
    const eyeGap          = params.get('eyeGap') ?? Math.max(3, Math.floor(widthPx * 2.5)); // px between eyes

    const impactMs        = params.get('impactMs') ?? 120; // how long to squash after bounce
    const impactExpand    = params.get('impactExpand') ?? 1.5; // widen factor at impact crest
    const bloomAtImpact   = params.get('bloom') ?? 0.4;    // extra brightness on impact (0..1)

    const colorMode       = getColorMode(params);          // 'cycle' | 'position'
    const palette         = getPalette(params);
    const usePalette      = palette !== null;
    let colors = getColorsFromParams(params, '#ff0000');
    if (!colors || colors.length === 0) colors = [parseColor('#ff0000')];

    // ---------- Time & motion ----------
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

    // Configure buffers
    this.alloc(ledCount);

    // Initialize position if first run
    if (this.pos === 0 && this.dir === 1 && this.prevFrame === null) {
      this.pos = 0;
      this.dir = 1;
    }

    // Convert cycles/sec to px/sec across the full ping-pong path (2*(N-1) px)
    const pathLength = Math.max(1, 2 * (ledCount - 1));
    const vPxPerSec = speed * pathLength;
    const v = vPxPerSec * (dt / 1000) * (reverse ? -this.dir : this.dir);

    // Update position in continuous space, then handle bounce with easing squash
    this.pos += v;
    let bounced = false;

    // Reflect at ends
    if (this.pos <= 0) {
      this.pos = -this.pos; this.dir = 1; bounced = true;
    } else if (this.pos >= (ledCount - 1)) {
      const over = this.pos - (ledCount - 1);
      this.pos = (ledCount - 1) - over; this.dir = -1; bounced = true;
    }

    if (bounced) this.impactT = impactMs; else this.impactT = Math.max(0, this.impactT - dt);

    // Compute squash factor near impact (widens the eye briefly and adds bloom)
    const squash = this.impactT > 0 ? lerp(1, impactExpand, easeOutCubic(this.impactT / impactMs)) : 1.0;
    const sigma = Math.max(0.5, (widthPx * 0.4247) * squash); // FWHM≈2.355σ => σ≈width*0.4247

    // ---------- Drawing ----------
    const buffer = Buffer.alloc(ledCount * 3);

    // Decay trail exponentially
    const k = Math.exp(-dt / Math.max(1, tailMs));
    for (let i = 0; i < ledCount; i++) {
      this.trR![i] *= k;
      this.trG![i] *= k;
      this.trB![i] *= k;
    }

    // Compute head positions for multiple eyes
    const headPositions: number[] = [this.pos];
    if (eyes > 1) {
      const dirSign = (reverse ? -this.dir : this.dir);
      const step = eyeGap * dirSign;
      for (let e = 1; e < eyes; e++) {
        headPositions.push(clamp(this.pos - e * step, 0, ledCount - 1));
      }
    }

    // Compose current frame’s contribution (into trail buffers)
    for (let e = 0; e < headPositions.length; e++) {
      const head = headPositions[e];

      // Choose color per eye; vary slightly across eyes
      const posNorm = head / Math.max(1, ledCount - 1);
      let c = this.getColorFor(colorMode, usePalette, palette, colors, posNorm, tMs, speed);
      // Impact bloom: add a gentle white lift when bouncing
      if (this.impactT > 0) {
        const bloom = bloomAtImpact * easeOutCubic(this.impactT / impactMs);
        c = { r: clamp(c.r + 255 * bloom, 0, 255), g: clamp(c.g + 255 * (bloom * 0.8), 0, 255), b: clamp(c.b + 255 * bloom, 0, 255) };
      }

      // Spread using Gaussian around head
      const left = Math.max(0, Math.floor(head - 4 * sigma));
      const right = Math.min(ledCount - 1, Math.ceil(head + 4 * sigma));
      for (let i = left; i <= right; i++) {
        const dx = i - head;
        let w = Math.exp(-(dx * dx) / (2 * sigma * sigma)); // 0..1
        // Slightly sharpen core, smooth tail via gamma curve
        w = Math.pow(clamp(w, 0, 1), trailGamma);

        // Mirror option writes a folded copy
        const writeAt = (idx: number, r: number, g: number, b: number) => {
          this.trR![idx] += r * w * tailGain / 255;
          this.trG![idx] += g * w * tailGain / 255;
          this.trB![idx] += b * w * tailGain / 255;
        };

        writeAt(i, c.r, c.g, c.b);

        if (mirror) {
          const mi = (ledCount - 1) - i;
          writeAt(mi, c.r, c.g, c.b);
        }
      }
    }

    // Convert trail buffers to bytes
    for (let i = 0; i < ledCount; i++) {
      const r = clamp(Math.floor(this.trR![i] * 255), 0, 255);
      const g = clamp(Math.floor(this.trG![i] * 255), 0, 255);
      const b = clamp(Math.floor(this.trB![i] * 255), 0, 255);
      const px = i * 3;
      buffer[px] = r; buffer[px + 1] = g; buffer[px + 2] = b;
    }

    // Optional temporal blend (helps with shimmer on camera)
    if (this.prevFrame && temporalBlend > 0) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(buffer[i] * (1 - temporalBlend) + this.prevFrame[i] * temporalBlend);
      }
    }
    this.prevFrame = new Uint8Array(buffer);

    return buffer;
  }
}

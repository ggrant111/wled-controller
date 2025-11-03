/**
 * Color Twinkle Effect — Natural
 * - Poisson start times, independent envelopes (rise/hold/fall)
 * - Palette drift or fixed color array
 * - Incandescent cool-down (warm fade)
 * - Neighbor glow and background base
 */

import { EffectGenerator } from './helpers';
import { parseColor, rgbToHex } from './helpers/colorUtils';
import { getColorArray, paletteManager } from './helpers/paletteUtils';

type RGB = { r: number; g: number; b: number };

type Phase = 0 | 1 | 2 | 3; // 0=off, 1=rise, 2=hold, 3=fall
interface PixState {
  phase: Phase;
  t0: number;   // phase start ms
  t1: number;   // phase end ms
  seed: number; // 0..1 for per-pixel palette position
  salt: number; // random for timings/jitter
  color: RGB;   // chosen base color for this twinkle (peak color)
}

export class ColorTwinkleEffect implements EffectGenerator {
  private states: PixState[] = [];
  private lastMs = 0;
  private paletteOffset = 0;

  private ensure(ledCount: number) {
    if (this.states.length !== ledCount) {
      this.states = new Array(ledCount).fill(0).map(() => ({
        phase: 0, t0: 0, t1: 0, seed: Math.random(), salt: Math.random(), color: { r: 0, g: 0, b: 0 }
      }));
    }
  }

  private clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
  private easeIn(x: number)  { x = this.clamp01(x); return x * x; }
  private easeOut(x: number) { x = this.clamp01(x); return 1 - (1 - x) * (1 - x); }

  private pickColor(
    colors: RGB[],
    paletteMode: boolean,
    paletteSpeed: number,
    timeMs: number,
    seed: number
  ): RGB {
    if (paletteMode) {
      const drift = (timeMs * paletteSpeed * 0.001) % 1;
      const pos = (seed + drift) % 1;
      // build a temp palette from provided colors (hex strings)
      const tmp = { id: 'tmp', name: 'tmp', colors: colors.map(c => rgbToHex(c)) };
      const c = paletteManager.interpolateColor(tmp, pos);
      return { r: c.r, g: c.g, b: c.b };
    }
    // Fixed set: pick deterministically from seed
    const idx = Math.floor(seed * colors.length) % Math.max(1, colors.length);
    return colors[idx];
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    // -------- Params --------
    const speed      = params.get('speed') ?? 0.6;     // global animation pace multiplier
    const density    = this.clamp01(params.get('density') ?? 0.35); // target active fraction (0..1)
    const bgColor    = parseColor(params.get('backgroundColor') ?? '#000000');

    const paletteMode  = params.get('paletteMode') ?? false; // drift through provided colors
    const paletteSpeed = params.get('paletteSpeed') ?? 0.08; // 0..~0.3 looks good

    // Envelope (ms)
    const fadeInMs   = params.get('fadeInMs')   ?? 180;
    const holdMs     = params.get('holdMs')     ?? 110;
    const fadeOutMs  = params.get('fadeOutMs')  ?? 380;

    // Timing jitter (+/-%)
    const jitterPct  = params.get('jitter')     ?? 0.25;

    // Incandescent cool-down (warmth while fading)
    const coolInc    = params.get('coolLikeIncandescent') ?? true;

    // Neighbor glow (small spatial blur)
    const neighborGlow = params.get('neighborGlow') ?? 0.18; // 0..0.35

    // Overall dim
    const backgroundDim = this.clamp01(params.get('backgroundDim') ?? 1.0);

    // Optional max active clamp (safety)
    const maxActive = params.get('maxActive') ?? Infinity;

    // Colors/palette input
    let colors = getColorArray(params, '#ff0000');
    if (!colors || colors.length === 0) colors = [parseColor('#ff0000')];

    // -------- Time base --------
    const tMsRaw = time > 5000 ? time : time * 1000;
    
    // Wrap time to prevent precision issues and ensure phase calculations work correctly
    // Use a large period (3600000ms = 1 hour) that doesn't affect visuals
    // but prevents floating point precision loss and ensures time comparisons remain valid
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const tMs = tMsRaw % TIME_WRAP_MS;
    
    // For dt calculation, handle wrap-around correctly
    let dt: number;
    if (this.lastMs > 0) {
      const lastMsWrapped = this.lastMs % TIME_WRAP_MS;
      const unwrappedDt = Math.max(1, tMsRaw - this.lastMs);
      // If unwrapped dt is reasonable (no wrap), use it; otherwise handle wrap
      dt = unwrappedDt < TIME_WRAP_MS ? unwrappedDt : Math.max(1, (tMs - lastMsWrapped + TIME_WRAP_MS) % TIME_WRAP_MS);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(dt, 100); // Max 100ms delta
    } else {
      dt = 16; // Default frame time
    }
    
    // Also normalize stored phase times when time wraps to prevent comparison issues
    // This ensures s.t0 and s.t1 remain valid relative to wrapped time
    // Normalize all stored times to current wrap period to keep comparisons valid
    const currentWrapBase = Math.floor(tMsRaw / TIME_WRAP_MS) * TIME_WRAP_MS;
    if (currentWrapBase > 0 && this.lastMs > 0) {
      const lastWrapBase = Math.floor(this.lastMs / TIME_WRAP_MS) * TIME_WRAP_MS;
      if (currentWrapBase > lastWrapBase) {
        // Time wrapped to a new period, normalize all stored times
        for (let i = 0; i < this.states.length; i++) {
          const s = this.states[i];
          if (s.t0 > 0) {
            s.t0 = s.t0 % TIME_WRAP_MS;
          }
          if (s.t1 > 0) {
            s.t1 = s.t1 % TIME_WRAP_MS;
          }
        }
      }
    }
    
    this.lastMs = tMsRaw; // Store unwrapped for next frame's dt calculation

    this.ensure(ledCount);

    // Expected active fraction density ≈ rate * (fadeIn+hold+fadeOut)
    const avgActiveMs = fadeInMs + holdMs + fadeOutMs;
    const ratePerPixel = density / Math.max(1, avgActiveMs); // activations per ms

    // Track active count this frame to enforce maxActive if set
    let activeCount = 0;

    // Precompute rise/hold/fall durations with jitter per pixel
    const durWithJitter = (base: number, salt: number) => {
      const j = 1 + (2 * salt - 1) * jitterPct; // (1 - jitter)..(1 + jitter)
      return Math.max(5, base * j);
    };

    // -------- Evolve state machine per pixel --------
    const outR = new Float32Array(ledCount);
    const outG = new Float32Array(ledCount);
    const outB = new Float32Array(ledCount);

    for (let i = 0; i < ledCount; i++) {
      const s = this.states[i];

      // Try spawning a new twinkle if we're OFF
      if (s.phase === 0) {
        // Poisson process: p = 1 - exp(-rate * dt)
        const p = 1 - Math.exp(-ratePerPixel * dt);
        if (activeCount < maxActive && Math.random() < p) {
          s.phase = 1;
          s.t0 = tMsRaw; // Store unwrapped time for state
          s.t1 = tMsRaw + durWithJitter(fadeInMs, s.salt);
          s.seed = Math.random();
          s.color = this.pickColor(colors, paletteMode, paletteSpeed, tMs, s.seed);
        }
      }

      // Helper to compare times accounting for wrap-around
      // If stored time is much larger than current (by > half period), it's from previous period
      const timeHasPassed = (storedTime: number, currentTime: number): boolean => {
        if (storedTime <= 0) return false;
        const diff = currentTime - storedTime;
        // If difference is negative and large, stored time is from previous period
        if (diff < -TIME_WRAP_MS / 2) {
          return true; // stored time is from previous period, consider it passed
        }
        return diff >= 0;
      };

      // Compute brightness based on phase
      let br = 0;
      if (s.phase === 1) { // rise
        const t0 = s.t0 % TIME_WRAP_MS;
        const t1 = s.t1 % TIME_WRAP_MS;
        // Handle wrap in duration calculation
        const duration = t1 >= t0 ? (t1 - t0) : (TIME_WRAP_MS - t0 + t1);
        const elapsed = tMs >= t0 ? (tMs - t0) : (TIME_WRAP_MS - t0 + tMs);
        const u = this.clamp01(elapsed / Math.max(1, duration));
        br = this.easeOut(u);
        if (timeHasPassed(s.t1, tMs)) {
          s.phase = 2;
          s.t0 = tMsRaw;
          s.t1 = tMsRaw + durWithJitter(holdMs, s.salt * 0.73);
        }
      } else if (s.phase === 2) { // hold
        br = 1;
        if (timeHasPassed(s.t1, tMs)) {
          s.phase = 3;
          s.t0 = tMsRaw;
          s.t1 = tMsRaw + durWithJitter(fadeOutMs, s.salt * 0.42);
        }
      } else if (s.phase === 3) { // fall
        const t0 = s.t0 % TIME_WRAP_MS;
        const t1 = s.t1 % TIME_WRAP_MS;
        // Handle wrap in duration calculation
        const duration = t1 >= t0 ? (t1 - t0) : (TIME_WRAP_MS - t0 + t1);
        const elapsed = tMs >= t0 ? (tMs - t0) : (TIME_WRAP_MS - t0 + tMs);
        const u = this.clamp01(elapsed / Math.max(1, duration));
        br = 1 - this.easeIn(u);
        if (timeHasPassed(s.t1, tMs)) {
          s.phase = 0;
          br = 0;
        }
      }

      if (s.phase !== 0) activeCount++;

      // Base color at this pixel this frame
      let r = s.color.r * br;
      let g = s.color.g * br;
      let b = s.color.b * br;

      // Incandescent cool-down: as it falls, bias toward warm (reduce B, a bit of G)
      if (coolInc && s.phase === 3) {
        const t0 = s.t0 % TIME_WRAP_MS;
        const t1 = s.t1 % TIME_WRAP_MS;
        // Handle wrap in duration calculation
        const duration = t1 >= t0 ? (t1 - t0) : (TIME_WRAP_MS - t0 + t1);
        const elapsed = tMs >= t0 ? (tMs - t0) : (TIME_WRAP_MS - t0 + tMs);
        const u = this.clamp01(elapsed / Math.max(1, duration)); // 0..1 during fall
        const k = 0.6 * u; // strength over the fall
        g *= (1 - 0.35 * k);
        b *= (1 - 0.75 * k);
      }

      outR[i] += r; outG[i] += g; outB[i] += b;
    }

    // -------- Neighbor glow (tiny 1D blur) --------
    if (neighborGlow > 0) {
      const a = neighborGlow * 0.5; // each neighbor
      const b = 1 - neighborGlow;   // center
      const r2 = new Float32Array(ledCount);
      const g2 = new Float32Array(ledCount);
      const b2 = new Float32Array(ledCount);
      for (let i = 0; i < ledCount; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < ledCount - 1 ? i + 1 : i;
        r2[i] = a * outR[L] + b * outR[i] + a * outR[R];
        g2[i] = a * outG[L] + b * outG[i] + a * outG[R];
        b2[i] = a * outB[L] + b * outB[i] + a * outB[R];
      }
      outR.set(r2); outG.set(g2); outB.set(b2);
    }

    // -------- Compose with background --------
    const buffer = Buffer.alloc(ledCount * 3);
    for (let i = 0; i < ledCount; i++) {
      const br = this.clamp01(backgroundDim);
      const r = Math.min(255, Math.max(0, Math.floor(bgColor.r * br + outR[i])));
      const g = Math.min(255, Math.max(0, Math.floor(bgColor.g * br + outG[i])));
      const b = Math.min(255, Math.max(0, Math.floor(bgColor.b * br + outB[i])));
      const px = i * 3;
      buffer[px] = r; buffer[px + 1] = g; buffer[px + 2] = b;
    }

    return buffer;
  }
}

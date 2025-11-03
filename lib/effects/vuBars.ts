/**
 * VU Bars Effect (Smooth)
 * - Temporal smoothing (independent attack/release)
 * - Soft compression & noise floor
 * - Spatial blur across adjacent bars
 * - Peak hold with gentle fall
 * - Optional fade-trail for calmer decay
 */

import { EffectGenerator } from './helpers';
import { getColorArray } from './helpers/paletteUtils';

type RGB = { r: number; g: number; b: number };

export class VUBarsEffect implements EffectGenerator {
  private lastTime = 0;
  private smoothLevels: number[] = [];
  private peakLevels: number[] = [];
  private trailLevels: number[] = [];
  private prevFrame: Uint8Array | null = null;

  private clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

  private ensureState(bars: number) {
    if (this.smoothLevels.length !== bars) {
      this.smoothLevels = new Array(bars).fill(0);
      this.peakLevels = new Array(bars).fill(0);
      this.trailLevels = new Array(bars).fill(0);
    }
  }

  // Simple soft-knee compressor (keeps lows visible, tames spikes)
  private softCompress(x: number, knee = 0.8) {
    // knee in [0..1], higher = more compression
    const k = Math.max(0.01, Math.min(0.99, knee));
    return (x * (1 + k)) / (1 + k * x);
  }

  // Convert desired time constant (ms) to smoothing factor per frame
  private kFromMs(dt: number, ms: number) {
    const tau = Math.max(1, ms); // avoid div by 0
    return 1 - Math.exp(-(dt) / tau);
  }

  // Optional simple spatial blur (1D gaussian-ish) over bars
  private spatialBlur(levels: number[], strength: number) {
    if (strength <= 0) return levels;
    const a = Math.min(0.49, strength); // 0..0.49 (so center stays dominant)
    const b = 1 - 2 * a;
    const out = levels.slice();
    for (let i = 0; i < levels.length; i++) {
      const L = i > 0 ? levels[i - 1] : levels[i];
      const C = levels[i];
      const R = i < levels.length - 1 ? levels[i + 1] : levels[i];
      out[i] = a * L + b * C + a * R;
    }
    return out;
  }

  // Gamma/easing for bar height (makes motion feel smoother)
  private ease(x: number, gamma: number) {
    // gamma < 1 lifts lows; gamma > 1 compresses lows
    return Math.pow(this.clamp01(x), Math.max(0.2, gamma));
  }

  // (Stub) Replace this with your real audio levels [0..1] per bar
  private getAudioLevels(bars: number, sensitivity: number) {
    return new Array(bars).fill(0).map(() => Math.random() * sensitivity);
  }

  generate(
    params: Map<string, any>,
    ledCount: number,
    time: number,
    width: number = 1,
    height: number = 1
  ): Buffer {
    const sensitivity = params.get('sensitivity') ?? 0.75;     // 0..1
    const bars = params.get('bars') ?? 8;
    const colors = getColorArray(params, '#00ff00');

    // Smoothness and dynamics
    const attackMs   = params.get('attackMs')   ?? 60;         // faster rise
    const releaseMs  = params.get('releaseMs')  ?? 280;        // slower fall
    const noiseFloor = params.get('noiseFloor') ?? 0.03;       // gate tiny flicker
    const compKnee   = params.get('compKnee')   ?? 0.7;        // 0..1
    const heightGamma= params.get('heightGamma')?? 0.8;        // <1 = smoother/lift lows
    const spatial    = params.get('spatialBlur')?? 0.2;        // 0..0.49

    // Peaks & trails
    const peakFallPerSec = params.get('peakFallPerSec') ?? 0.6; // peak bar tip fall rate
    const trailDecayMs   = params.get('trailDecayMs')   ?? 450; // afterimage decay (0 to disable)
    const trailMix       = params.get('trailMix')       ?? 0.35;// mix trail into level

    // Brightness shaping (simple global dimmer)
    const brightness = this.clamp01(params.get('brightness') ?? 1.0);

    // Time delta in ms (works whether `time` is ms or seconds—normalize to ms)
    const nowMsRaw = time > 5_000 ? time : time * 1000;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in milliseconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const nowMs = nowMsRaw % TIME_WRAP_MS;
    
    // For dt calculation, handle wrap-around correctly
    let dt: number;
    if (this.lastTime > 0) {
      const unwrappedDt = Math.max(1, nowMsRaw - this.lastTime);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 100); // Max 100ms delta
    } else {
      dt = 16; // Default frame time
    }
    this.lastTime = nowMsRaw; // Store unwrapped for next frame's dt calculation

    this.ensureState(bars);

    // 1) Get raw levels and pre-process
    let rawLevels = this.getAudioLevels(bars, sensitivity)
      .map(v => this.clamp01(v - noiseFloor) / (1 - noiseFloor)) // gate
      .map(v => this.softCompress(v, compKnee));                  // compress

    // 2) Temporal smoothing per bar (separate attack/release)
    const kAttack  = this.kFromMs(dt, attackMs);
    const kRelease = this.kFromMs(dt, releaseMs);
    for (let i = 0; i < bars; i++) {
      const x = rawLevels[i];
      const y = this.smoothLevels[i];
      const k = x > y ? kAttack : kRelease;
      this.smoothLevels[i] = y + (x - y) * k;
    }

    // 3) Spatial blur for calmer motion between neighbors
    const blurred = this.spatialBlur(this.smoothLevels, spatial);

    // 4) Optional trail (slow afterimage blends into levels)
    if (trailDecayMs > 0) {
      const kTrail = this.kFromMs(dt, trailDecayMs);
      for (let i = 0; i < bars; i++) {
        this.trailLevels[i] += (blurred[i] - this.trailLevels[i]) * kTrail;
      }
    }

    const levels = new Array(bars);
    for (let i = 0; i < bars; i++) {
      const base = blurred[i];
      const withTrail = trailDecayMs > 0 ? (1 - trailMix) * base + trailMix * this.trailLevels[i] : base;
      levels[i] = this.clamp01(withTrail);
    }

    // 5) Peak hold with graceful fall
    const peakFall = (peakFallPerSec * dt) / 1000;
    for (let i = 0; i < bars; i++) {
      this.peakLevels[i] = Math.max(levels[i], this.peakLevels[i] - peakFall);
    }

    // 6) Render bars
    const buffer = Buffer.alloc(ledCount * 3);
    const ledsPerBar = Math.max(1, Math.floor(ledCount / bars));
    for (let bar = 0; bar < bars; bar++) {
      const color: RGB = colors[bar % colors.length];
      const level = this.ease(levels[bar], heightGamma);
      const peak  = this.ease(this.peakLevels[bar], heightGamma);
      const barHeight = Math.floor(level * ledsPerBar);
      const peakIdx   = Math.min(ledsPerBar - 1, Math.max(0, Math.floor(peak * ledsPerBar) - 1));
      
      for (let i = 0; i < ledsPerBar; i++) {
        const ledIndex = bar * ledsPerBar + i;
        if (ledIndex >= ledCount) break;

        // Soft edge near the top: fade last 2 LEDs for non-abrupt cutoff
        let scale = 0;
        if (i < barHeight - 2) scale = 1;
        else if (i < barHeight) scale = (barHeight - i) / 2; // 0..1 over last two LEDs

        // Draw main bar
        const r = Math.floor(color.r * brightness * scale);
        const g = Math.floor(color.g * brightness * scale);
        const b = Math.floor(color.b * brightness * scale);

        const px = ledIndex * 3;
        buffer[px]     = Math.max(buffer[px], r);
        buffer[px + 1] = Math.max(buffer[px + 1], g);
        buffer[px + 2] = Math.max(buffer[px + 2], b);

        // Draw peak tip as a dim cap (non-blinking)
        if (i === peakIdx && peak > 0) {
          const pr = Math.floor(color.r * brightness * 0.35);
          const pg = Math.floor(color.g * brightness * 0.35);
          const pb = Math.floor(color.b * brightness * 0.35);
          buffer[px]     = Math.max(buffer[px], pr);
          buffer[px + 1] = Math.max(buffer[px + 1], pg);
          buffer[px + 2] = Math.max(buffer[px + 2], pb);
        }
      }
    }

    // (Optional) tiny temporal blend with the previous frame to reduce residual shimmer
    const temporalBlend = params.get('temporalBlend') ?? 0.0; // 0..0.4 typically
    if (this.prevFrame && temporalBlend > 0) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(
          buffer[i] * (1 - temporalBlend) + this.prevFrame[i] * temporalBlend
        );
      }
    }
    this.prevFrame = new Uint8Array(buffer);

    return buffer;
  }
}

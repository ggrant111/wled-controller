/**
 * Matrix Effect — Cinematic Rain
 * - Poisson spawn (density-aware), velocity in px/sec
 * - Head glow + exponential trail decay
 * - Variable drop length/speed, palette cycling
 * - Optional neighbor glow, reverse/mirror ready
 */

import { EffectGenerator } from './helpers';
import { getColorArray, paletteManager } from './helpers/paletteUtils';
// If you have applyTransformations(mirror, reverse) utility, you can pull it in:
// import { applyTransformations } from './helpers/effectUtils';

type RGB = { r: number; g: number; b: number };

interface Drop {
  pos: number;       // head position (float, px)
  vel: number;       // px/sec
  len: number;       // trail length in px
  color: RGB;        // head color (trail inherits dimmer)
  jitter: number;    // per-drop tiny flicker
}

export class MatrixEffect implements EffectGenerator {
  private lastMs = 0;
  private drops: Drop[] = [];

  // Trail buffers (linear floats 0..1; converted to u8 at the end)
  private trR: Float32Array | null = null;
  private trG: Float32Array | null = null;
  private trB: Float32Array | null = null;

  private ensureBuffers(n: number) {
    if (!this.trR || this.trR.length !== n) {
      this.trR = new Float32Array(n);
      this.trG = new Float32Array(n);
      this.trB = new Float32Array(n);
    }
  }

  private clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  private pickColor(colors: RGB[], paletteMode: boolean, tMs: number, paletteSpeed: number, seed: number): RGB {
    if (paletteMode) {
      const pos = (seed + (tMs * 0.001 * paletteSpeed)) % 1;
      const tmp = { id: 'matrix', name: 'matrix', colors: colors.map(c => `#${((c.r<<16)|(c.g<<8)|c.b).toString(16).padStart(6,'0')}`) };
      const c = paletteManager.interpolateColor(tmp, pos);
      return { r: c.r, g: c.g, b: c.b };
    }
    // fixed: choose deterministically from seed
    const idx = Math.floor(seed * colors.length) % Math.max(1, colors.length);
    return colors[idx];
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    // ---------- Params ----------
    const speedPx     = params.get('speedPx') ?? 90;     // head speed in px/sec
    const speedJitter = this.clamp01(params.get('speedJitter') ?? 0.25); // ±25%
    const density     = this.clamp01(params.get('density') ?? 0.25);     // fraction of LEDs “covered” on avg
    const lenMin      = params.get('lenMin') ?? 6;
    const lenMax      = params.get('lenMax') ?? 18;

    const headBoost   = params.get('headBoost') ?? 1.6;  // head brighter than trail
    const trailDecayMs= params.get('trailDecayMs') ?? 520; // higher = longer persistence
    const trailGamma  = params.get('trailGamma') ?? 1.0;   // <1 sharper core, >1 softer tail
    const neighborGlow= params.get('neighborGlow') ?? 0.12; // tiny spatial blur 0..0.3

    const paletteMode   = params.get('paletteMode') ?? false;
    const paletteSpeed  = params.get('paletteSpeed') ?? 0.08;
    const colors        = getColorArray(params, '#00ff00'); // default Matrix green(s)

    const reverse     = params.get('reverse') ?? false;
    const mirror      = params.get('mirror') ?? false; // reserved if you later fold to center

    const tMsRaw = time > 5000 ? time : time * 1000;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in milliseconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const tMs = tMsRaw % TIME_WRAP_MS;
    
    // For dt calculation, handle wrap-around correctly
    let dt: number;
    if (this.lastMs > 0) {
      const unwrappedDt = Math.max(1, tMsRaw - this.lastMs);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 100); // Max 100ms delta
    } else {
      dt = 16; // Default frame time
    }
    this.lastMs = tMsRaw; // Store unwrapped for next frame's dt calculation

    const buffer = Buffer.alloc(ledCount * 3);
    if (ledCount <= 0) return buffer;

    this.ensureBuffers(ledCount);

    // ---------- Decay existing trail ----------
    const k = Math.exp(-dt / Math.max(1, trailDecayMs));
    for (let i = 0; i < ledCount; i++) {
      this.trR![i] *= k;
      this.trG![i] *= k;
      this.trB![i] *= k;
    }

    // ---------- Spawn logic ----------
    // Expected active drops ≈ (density * ledCount) / avgLen
    const avgLen = (lenMin + lenMax) * 0.5;
    const vel = speedPx; // base px/sec (per drop gets jittered)
    const activeTarget = (density * ledCount) / Math.max(1, avgLen);

    // Spawn rate per second ≈ activeTarget * vel / ledCount
    const spawnRatePerSec = activeTarget * vel / Math.max(1, ledCount);
    const spawnP = 1 - Math.exp(-(spawnRatePerSec * dt) / 1000);

    // You might want an upper bound to avoid flood during params spikes
    const maxDrops = Math.max(2, Math.floor(2 * activeTarget) + 8);

    // Possibly spawn several (rare); loop to use up probability mass
    let spawnTrials = 3; // keep it modest
    while (this.drops.length < maxDrops && Math.random() < spawnP && spawnTrials-- > 0) {
      const seed = Math.random();
      const jitter = 1 + (2 * Math.random() - 1) * speedJitter; // 1±speedJitter
      const drop: Drop = {
        pos: reverse ? (ledCount - 1) : 0,
        vel: vel * jitter * (reverse ? -1 : 1),
        len: Math.max(2, this.lerp(lenMin, lenMax, Math.random())),
        color: this.pickColor(colors, paletteMode, tMs, paletteSpeed, seed),
        jitter: (Math.random() * 2 - 1) * 0.15
      };
      this.drops.push(drop);
    }

    // ---------- Update & draw drops ----------
    // Write into trail buffer using an exponential profile along the length
    const adv = (dt / 1000);
    const last = ledCount - 1;

    const newDrops: Drop[] = [];
    for (const d of this.drops) {
      d.pos += d.vel * adv;

      // Culling: off the strip?
      if ((!reverse && d.pos - d.len > last) || (reverse && d.pos + d.len < 0)) {
        continue; // drop finished
      }
      newDrops.push(d);

      // Head position (float), draw head + trail behind it
      const head = d.pos;
      const headIdx = Math.floor(head);
      const trailStart = Math.max(0, Math.floor(reverse ? head : head - d.len));
      const trailEnd   = Math.min(last, Math.ceil(reverse ? head + d.len : head));
      const dir = reverse ? 1 : -1; // trail direction relative to head

      for (let i = trailStart; i <= trailEnd; i++) {
        // Distance from head along trail (0 at head, grows down the trail)
        const dist = Math.max(0, (i - head) * dir); // 0..len
        const t = this.clamp01(1 - dist / Math.max(1, d.len)); // 1 at head -> 0 at tail
        // Exponential-ish luminance along the trail
        const w = Math.pow(t, trailGamma) * (0.35 + 0.65 * t);

        // Head gets a brightness boost and a tiny flicker to mimic glyph refresh
        const isHead = (i === headIdx);
        const headPulse = isHead ? (headBoost * (1.0 + d.jitter * Math.sin(tMs * 0.02))) : 1.0;
        const scale = this.clamp01(w * headPulse);

        // Write additive into trail buffer, normalize 255->1
        const r = (d.color.r / 255) * scale;
        const g = (d.color.g / 255) * scale;
        const b = (d.color.b / 255) * scale;

        this.trR![i] = Math.min(1, this.trR![i] + r);
        this.trG![i] = Math.min(1, this.trG![i] + g);
        this.trB![i] = Math.min(1, this.trB![i] + b);
      }
    }
    this.drops = newDrops;

    // ---------- Optional neighbor glow (tiny 1D blur) ----------
    if (neighborGlow > 0) {
      const a = neighborGlow * 0.5; // each neighbor
      const b = 1 - 2 * a;
      const r2 = new Float32Array(ledCount);
      const g2 = new Float32Array(ledCount);
      const b2 = new Float32Array(ledCount);
      for (let i = 0; i < ledCount; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < last ? i + 1 : i;
        r2[i] = a * this.trR![L] + b * this.trR![i] + a * this.trR![R];
        g2[i] = a * this.trG![L] + b * this.trG![i] + a * this.trG![R];
        b2[i] = a * this.trB![L] + b * this.trB![i] + a * this.trB![R];
      }
      this.trR!.set(r2); this.trG!.set(g2); this.trB!.set(b2);
    }

    // ---------- Write to byte buffer ----------
    for (let i = 0; i < ledCount; i++) {
      const px = i * 3;
      buffer[px]     = Math.max(0, Math.min(255, Math.floor(this.trR![i] * 255)));
      buffer[px + 1] = Math.max(0, Math.min(255, Math.floor(this.trG![i] * 255)));
      buffer[px + 2] = Math.max(0, Math.min(255, Math.floor(this.trB![i] * 255)));
    }

    return buffer;
  }
}

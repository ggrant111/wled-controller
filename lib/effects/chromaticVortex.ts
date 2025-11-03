/**
 * Chromatic Vortex Effect (modified per suggestions)
 *
 * Changes from your version:
 * 1) Palette morphing cadence: auto-picks a new target palette ~every 20s and blends toward it each frame.
 * 2) Shockwave scheduling parity: defaults to 1.5–4.5s like the C++ sketch; if `shockwaveFrequency` is set, uses your exponential mapping.
 * 3) Trail fade strength: keep ~40 fade in shock layer; reduce final composite fade to ~5% (closer to C++).
 * 4) Vortex speed mode: param `vortexSpeedMode` ('expo' | 'linear'); linear matches C++ feel (1..6 px/frame).
 */

import { EffectGenerator } from './helpers';
import { RGBColor, hsvToRgb, parseColor } from './helpers/colorUtils';
import { applyMirror, applyTransformations } from './helpers/effectUtils';
import { paletteManager } from './helpers/paletteUtils';
import type { Palette as PaletteType } from '../../types';

interface Shockwave {
  active: boolean;
  tStart: number;
  radius: number;
  speed: number;
  hueBase: number;
  thickness: number;
}

interface EffectState {
  vortexOffset: number;       // fractional for smooth motion
  hueShift: number;           // 0..255 slow orbit
  wave: Shockwave;
  nextWaveAt: number;         // ms
  lastPaletteChange: number;  // ms
  currentWraps: number;       // 2..6
  lastShockwaveFrequency: number; // remember last freq to reschedule if changed

  // New: palette morphing state
  currentPaletteName: string;
  targetPaletteName: string;
  paletteBlendT: number;      // 0..1
}

// Internal palette format for blending (RGB colors)
interface BlendPalette {
  colors: RGBColor[];
}

/* ------------------------- Small local helpers ------------------------- */

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function triwave8(x: number): number {
  x = x % 256;
  return x < 128 ? x * 2 : 255 - (x - 128) * 2;
}

function scale8(n: number, scale: number): number {
  return Math.floor((n * scale) / 255);
}

function videoSinewave8(x: number): number {
  const angle = (x / 255) * Math.PI * 2;
  return Math.floor(((Math.sin(angle) + 1) / 2) * 255);
}

function distToWaveIntensity(d: number, r: number, thickness: number): number {
  const falloff = Math.abs(d - r);
  if (falloff > thickness) return 0;
  const t = 1.0 - (falloff / thickness);
  const v = Math.floor(255.0 * t);
  return scale8(videoSinewave8(v), 220);
}

function beatsin8(bpm: number, min: number, max: number, timeMs: number): number {
  // Wrap time to prevent precision issues from very large time values
  // Use a large period (3600000ms = 1 hour) that doesn't affect visuals
  // but prevents floating point precision loss
  const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
  const timeWrapped = timeMs % TIME_WRAP_MS;
  
  const timeSeconds = timeWrapped / 1000;
  const phase = timeSeconds * (bpm / 60) * Math.PI * 2;
  const normalized = (Math.sin(phase) + 1) / 2;
  return Math.floor(min + (max - min) * normalized);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Blend two palettes (same length or different). Result is a BlendPalette with RGB colors. */
function blendPalettes(a: BlendPalette, b: BlendPalette, t: number): BlendPalette {
  const len = Math.max(a?.colors?.length || 0, b?.colors?.length || 0) || 1;
  const out: BlendPalette = { colors: new Array(len).fill(0).map(() => ({ r: 0, g: 0, b: 0 })) };
  for (let i = 0; i < len; i++) {
    const ca = a.colors[i % a.colors.length] || { r: 0, g: 0, b: 0 };
    const cb = b.colors[i % b.colors.length] || { r: 0, g: 0, b: 0 };
    out.colors[i] = {
      r: Math.round(lerp(ca.r, cb.r, t)),
      g: Math.round(lerp(ca.g, cb.g, t)),
      b: Math.round(lerp(ca.b, cb.b, t)),
    };
  }
  return out;
}

/** Convert PaletteType (hex strings) to BlendPalette (RGB colors). */
function paletteToBlendPalette(palette: PaletteType | null | undefined): BlendPalette {
  if (!palette || !palette.colors || palette.colors.length === 0) {
    // Fallback: simple 8-color rainbow
    return {
      colors: [
        { r: 255, g:   0, b:   0 },
        { r: 255, g: 128, b:   0 },
        { r: 255, g: 255, b:   0 },
        { r:   0, g: 255, b:   0 },
        { r:   0, g: 255, b: 255 },
        { r:   0, g:   0, b: 255 },
        { r: 128, g:   0, b: 255 },
        { r: 255, g:   0, b: 128 },
      ],
    };
  }
  
  // Convert hex strings to RGB
  return {
    colors: palette.colors.map((color: string) => parseColor(color))
  };
}

/** Get palette by name/id from paletteManager and convert to BlendPalette. */
function getPaletteByName(nameOrId: string): BlendPalette {
  // Map common names to IDs
  const nameMap: Record<string, string> = {
    'Rainbow': 'rainbow',
    'RainbowStripe': 'rainbow-stripe',
    'Party': 'party',
    'Cloud': 'cloud',
    'Heat': 'lava',
  };
  
  const id = nameMap[nameOrId] || nameOrId.toLowerCase();
  const p = paletteManager.getPaletteById(id);
  return paletteToBlendPalette(p || null);
}

/** Sample blended palette at hue (0..255) with brightness scaling. */
function colorFromPalette(palette: BlendPalette, h: number, brightness: number): RGBColor {
  if (!palette || !palette.colors || palette.colors.length === 0) {
    const hueDegrees = (h * 360) / 256;
    return hsvToRgb(hueDegrees, 1.0, brightness / 255);
  }
  
  // Simple manual interpolation for BlendPalette (already RGB)
  const arr = palette.colors;
  const hueNormalized = (h / 256) % 1;
  const idx = hueNormalized * (arr.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(arr.length - 1, i0 + 1);
  const tt = idx - i0;
  
  const color = {
    r: Math.round(lerp(arr[i0].r, arr[i1].r, tt)),
    g: Math.round(lerp(arr[i0].g, arr[i1].g, tt)),
    b: Math.round(lerp(arr[i0].b, arr[i1].b, tt)),
  };

  return {
    r: scale8(color.r, brightness),
    g: scale8(color.g, brightness),
    b: scale8(color.b, brightness),
  };
}

/* ------------------------------ Effect class ------------------------------ */

export class ChromaticVortexEffect implements EffectGenerator {
  private stateByKey: Map<string, EffectState> = new Map();

  private keyFor(ledCount: number, instanceKey?: string): string {
    return `${ledCount}:${instanceKey || 'default'}`;
  }

  private random(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private centerIndex(ledCount: number): number {
    return Math.floor((ledCount - 1) / 2);
  }

  private triggerWave(state: EffectState, time: number): void {
    state.wave.active = true;
    state.wave.tStart = time;
    state.wave.radius = 0;
    state.wave.speed = 1.8 + (this.random(0, 40) / 20.0); // ~2.0..3.9 px/frame
    state.wave.hueBase = (state.hueShift + this.random(0, 64)) % 256;
    state.wave.thickness = 5 + Math.floor(this.random(0, 8)); // 5..12 px
  }

  private maybeScheduleWave(
    state: EffectState,
    time: number,
    minInterval: number,
    maxInterval: number
  ): void {
    if (time >= state.nextWaveAt && !state.wave.active) {
      this.triggerWave(state, time);
      const interval = minInterval + this.random(0, maxInterval - minInterval);
      state.nextWaveAt = time + interval;
    }
  }

  private renderVortex(
    buffer: Buffer,
    params: Map<string, any>,
    ledCount: number,
    time: number,
    state: EffectState,
    blendedPalette: BlendPalette
  ): void {
    const wraps = state.currentWraps;

    // Speed mode:
    // 'expo'  — wide expressive range (original JS behavior)
    // 'linear'— C++-like (1..6 px/frame)
    const mode: 'expo' | 'linear' = (params.get('vortexSpeedMode') || 'expo');
    const raw = params.get('vortexSpeed') ?? 2; // UI knob 1..6 suggested
    let delta = 0.0;

    if (mode === 'linear') {
      // match C++ feel more closely
      const step = Math.max(1, Math.min(6, Math.floor(raw)));
      delta = step; // px/frame
      state.vortexOffset = (state.vortexOffset + delta) % 256;
    } else {
      // exponential mapping for dramatic range
      const expo = 0.005 * Math.pow(Math.max(0.1, raw), 3.2);
      state.vortexOffset = (state.vortexOffset + expo * 256) % 256; // scale into 0..256 space
    }

    const mirrorMode = params.get('mirror') || false;
    const direction = params.get('reverse') ? -1 : 1;

    const base = state.vortexOffset;
    const scale = (wraps * 256) / Math.max(1, ledCount);
    const c = this.centerIndex(ledCount);

    for (let i = 0; i < ledCount; i++) {
      let idx = i;

      if (mirrorMode) {
        const d = Math.abs(i - c);
        idx = c - d; // reflect to the left side
        idx = Math.max(0, Math.min(ledCount - 1, idx));
      }
      if (direction < 0) idx = (ledCount - 1) - idx;

      const pos = ((idx * scale + base) % 256);
      const h = (pos + state.hueShift) % 256;

      const distFromCenter = Math.abs(i - c);
      const maxDist = Math.max(1, c);
      const depthInput = scale8(Math.floor((distFromCenter * 255) / maxDist), 180);
      const depth = triwave8(depthInput);
      const val = 180 + Math.floor(depth / 4); // 180..~243

      const color = colorFromPalette(blendedPalette, h, val);

      const p = i * 3;
      buffer[p] = color.r;
      buffer[p + 1] = color.g;
      buffer[p + 2] = color.b;
    }
  }

  private renderShockwaves(
    buffer: Buffer,
    ledCount: number,
    time: number,
    state: EffectState
  ): void {
    if (!state.wave.active) return;

    // Expand radius
    state.wave.radius += state.wave.speed;

    // ~40 fade (like FastLED fadeToBlackBy 40)
    for (let i = 0; i < ledCount * 3; i++) {
      buffer[i] = Math.floor(buffer[i] * 0.84);
    }

    const c = this.centerIndex(ledCount);

    for (let i = 0; i < ledCount; i++) {
      const d = Math.abs(i - c);
      const ring = distToWaveIntensity(d, state.wave.radius, state.wave.thickness);
      if (ring > 0) {
        const h = (state.wave.hueBase + Math.floor(d * 2)) % 256;
        const rgb = hsvToRgb((h * 360) / 256, 1.0, ring / 255);
        const p = i * 3;
        buffer[p] = Math.min(255, buffer[p] + rgb.r);
        buffer[p + 1] = Math.min(255, buffer[p + 1] + rgb.g);
        buffer[p + 2] = Math.min(255, buffer[p + 2] + rgb.b);
      }
    }

    // deactivate when beyond edges
    if (state.wave.radius > (Math.max(c, ledCount - 1 - c) + state.wave.thickness + 2)) {
      state.wave.active = false;
    }
  }

  generate(
    params: Map<string, any>,
    ledCount: number,
    time: number,
    width?: number,
    height?: number
  ): Buffer {
    const buffer = Buffer.alloc(ledCount * 3);
    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.keyFor(ledCount, instanceKey);

    let state = this.stateByKey.get(key);
    if (!state) {
      state = {
        vortexOffset: 0,
        hueShift: 0,
        wave: { active: false, tStart: 0, radius: 0, speed: 2.0, hueBase: 0, thickness: 8 },
        nextWaveAt: time + 1000,
        lastPaletteChange: time,
        currentWraps: params.get('wraps') || 3,
        lastShockwaveFrequency: params.get('shockwaveFrequency') ?? 0.35, // default toward C++ cadence
        currentPaletteName: 'Rainbow', // starting palette
        targetPaletteName: 'Rainbow',
        paletteBlendT: 1.0,
      };
      this.stateByKey.set(key, state);
    } else if (state.lastShockwaveFrequency === undefined) {
      state.lastShockwaveFrequency = params.get('shockwaveFrequency') ?? 0.35;
    }

    /* ------------------- Global hue orbit (slow) ------------------- */
    const hueOrbit = beatsin8(2, 0, 4, time);
    state.hueShift = (state.hueShift + hueOrbit) % 256;

    /* ------------------ Wraps cadence (every ~20s) ----------------- */
    const wrapsParam = params.get('wraps') ?? 3;
    if (time - state.lastPaletteChange > 20000) {
      // also piggyback palette retarget on this cadence
      state.currentWraps = Math.max(2, Math.min(6, Math.floor(wrapsParam + this.random(-1, 2))));
      state.lastPaletteChange = time;

      // choose a new target palette name
      const names = ['RainbowStripe', 'Party', 'Cloud', 'Heat', 'Rainbow'];
      const pick = names[Math.floor(this.random(0, names.length))];
      state.currentPaletteName = state.targetPaletteName; // current becomes previous target
      state.targetPaletteName = pick;
      state.paletteBlendT = 0.0; // restart blend
    } else {
      state.currentWraps = wrapsParam;
    }

    /* -------------------- Palette morphing blend ------------------- */
    // If user forces a palette via params, pin both names and skip auto-morphing
    const forcedPaletteId = params.get('palette');
    let blended: BlendPalette;

    if (forcedPaletteId) {
      // User specified a palette - use it directly
      const p = paletteManager.getPaletteById(forcedPaletteId);
      blended = paletteToBlendPalette(p || null);
      state.currentPaletteName = forcedPaletteId;
      state.targetPaletteName = forcedPaletteId;
      state.paletteBlendT = 1.0;
    } else {
      // Blend current->target a bit every frame (~2%)
      state.paletteBlendT = clamp01(state.paletteBlendT + 0.02);
      const currentP = getPaletteByName(state.currentPaletteName);
      const targetP = getPaletteByName(state.targetPaletteName);
      blended = blendPalettes(currentP, targetP, state.paletteBlendT);
    }

    /* --------------- Shockwave scheduling (parity) ----------------- */
    const shockwaveFrequency = params.get('shockwaveFrequency');
    let minInterval = 1500, maxInterval = 4500; // C++ default cadence
    if (shockwaveFrequency !== undefined && shockwaveFrequency !== null) {
      // Exponential mapping from your original code
      const freq = Math.max(0, Math.min(1, shockwaveFrequency));
      const minLow = 300, maxLow = 800;
      const minHigh = 10000, maxHigh = 15000;
      const f = Math.pow(1 - freq, 2);
      minInterval = minLow + (minHigh - minLow) * f;
      maxInterval = maxLow + (maxHigh - maxLow) * f;

      const changed = Math.abs((state.lastShockwaveFrequency ?? freq) - freq) > 0.01;
      if (changed && !state.wave.active && state.nextWaveAt > time) {
        const expected = minInterval + this.random(0, maxInterval - minInterval);
        state.nextWaveAt = time + expected;
      }
      state.lastShockwaveFrequency = freq;
    }
    this.maybeScheduleWave(state, time, minInterval, maxInterval);

    /* -------------------------- Render ----------------------------- */
    // Base vortex
    this.renderVortex(buffer, params, ledCount, time, state, blended);
    // Additive shockwaves
    this.renderShockwaves(buffer, ledCount, time, state);

    // Breathing brightness mask (with exponential speed map)
    const breathingSpeed = params.get('breathingSpeed') ?? 7; // 1..20
    const breathMin = params.get('breathingMin') ?? 110;      // closer to C++ defaults
    const breathMax = params.get('breathingMax') ?? 255;
    const effectiveBPM = 0.25 * Math.pow(Math.max(0.1, breathingSpeed), 1.8);
    const breath = beatsin8(effectiveBPM, breathMin, breathMax, time);

    for (let i = 0; i < ledCount * 3; i++) {
      buffer[i] = Math.floor((buffer[i] * breath) / 255);
    }

    // Subtle composite persistence (~5% fade like C++'s fadeToBlackBy 10 but gentler)
    for (let i = 0; i < ledCount * 3; i++) {
      buffer[i] = Math.floor(buffer[i] * 0.95);
    }

    return buffer;
  }
}

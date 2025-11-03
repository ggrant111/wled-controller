/**
 * PatternGeneratorEffect — speed-robust ledfade (directional), gamma LUT, mirror/flip,
 * speed-aware fade span + temporal supersampling (motion blur)
 *
 * New params:
 *   fadeTime: number               // seconds of fade visibility vs speed (default 0.033 ≈ 1 frame @30fps)
 *   motionBlurMaxSamples: number   // 1..8 temporal supersamples when jump is big (default 6)
 *   motionBlurThreshold: number    // trigger when dPhaseSlots > threshold * effectiveSpan (default 0.9)
 *   instanceKey: string            // optional: isolates state per instance
 */

import { EffectGenerator } from './helpers';
import { RGBColor, parseColor } from './helpers/colorUtils';
import { getPalette } from './helpers/paletteUtils';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function smoothstep(t: number) { t = clamp01(t); return t * t * (3 - 2 * t); }
function mixRGBf(a: RGBColor, b: RGBColor, t: number): RGBColor {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
function toRGBArray(raw: any, fallback: string[]): RGBColor[] {
  const arr = Array.isArray(raw) && raw.length > 0 ? raw : fallback;
  return arr.map((c: any) => (typeof c === 'string' ? parseColor(c) :
    (typeof c === 'object' && c && typeof c.r === 'number') ? c as RGBColor : parseColor('#ffffff')));
}
function repeatColors(colors: RGBColor[], times: number): RGBColor[] {
  if (!Number.isFinite(times) || times <= 1) return colors;
  const out: RGBColor[] = new Array(colors.length * times);
  for (let i = 0; i < times; i++) for (let j = 0; j < colors.length; j++) out[i * colors.length + j] = colors[j];
  return out;
}
function applyTransformations(i: number, n: number, mirror: boolean, flip: boolean) {
  let idx = i;
  if (flip) idx = n - 1 - idx;
  if (mirror) {
    const center = (n - 1) / 2; const dist = Math.abs(idx - center);
    idx = Math.round(center + dist); if (idx < 0) idx = 0; if (idx >= n) idx = n - 1;
  }
  return idx;
}
function fracWithHolds(frac: number, holdFrac: number) {
  const h = Math.max(0, Math.min(0.45, holdFrac));
  const ramp = (1 - 2 * h) / 2; if (ramp <= 1e-6) return frac < 0.5 ? 0 : 0.5;
  if (frac < h) return 0;
  if (frac < h + ramp) return (frac - h) * (0.5 / ramp);
  if (frac < h + ramp + h) return 0.5;
  const f2 = frac - (h + ramp + h); return 0.5 + f2 * (0.5 / ramp);
}

type Mode = 'static' | 'scroll' | 'pingpong';
type Blend = 'none' | 'ledfade';

type FrameState = {
  lastTimeSec: number;
  lastPhaseSlots: number;
};
export class PatternGeneratorEffect implements EffectGenerator {
  private gammaLUTCache: Map<number, Uint8Array> = new Map();
  private stateByKey: Map<string, FrameState> = new Map();

  private buildGammaLUT(gamma: number) {
    const key = Math.round(gamma * 100) / 100;
    const cached = this.gammaLUTCache.get(key);
    if (cached) return cached;
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const v = i / 255;
      lut[i] = Math.max(0, Math.min(255, Math.round(Math.pow(v, gamma) * 255)));
    }
    this.gammaLUTCache.set(key, lut);
    return lut;
  }

  private key(ledCount: number, instanceKey?: string) {
    return `${ledCount}:${instanceKey || 'default'}`;
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const N = ledCount | 0; if (N <= 0) return Buffer.alloc(0);

    // --- params ---
    const instanceKey = (params.get('instanceKey') as string) || 'default';

    const modeRaw = (params.get('mode') as string) || 'scroll';
    const modeNorm = String(modeRaw).trim().toLowerCase();
    const mode: Mode = (modeNorm === 'static' || modeNorm === 'scroll' || modeNorm === 'pingpong') ? modeNorm as Mode : 'scroll';

    const reverse = !!params.get('reverse');   // temporal dir
    const mirror = !!params.get('mirror');
    const flip = !!params.get('flip');

    const palette = getPalette(params);
    const usePaletteParam = params.get('usePalette');
    const usePalette = usePaletteParam !== undefined ? !!usePaletteParam && !!palette : (palette != null);

    let colors: RGBColor[];
    if (usePalette && palette) colors = palette.colors.map(c => parseColor(c));
    else {
      const userColors = params.get('colors');
      colors = (Array.isArray(userColors) && userColors.length > 0) ? toRGBArray(userColors, ['#ffffff']) : [parseColor('#ffffff')];
    }

    const repeat = Math.max(1, Math.floor(Number(params.get('repeat')) || 1));
    if (repeat > 1) colors = repeatColors(colors, repeat);
    if (!colors || colors.length === 0) colors = [parseColor('#ffffff')];

    const slotSize = Math.max(1, Math.floor(Number(params.get('slotSize')) || 1)); // LEDs per slot
    const patternLen = colors.length;

    const speedLEDs = Math.max(0, (params.get('speed') ?? 6) as number); // LEDs/s
    const speedSlots = speedLEDs / slotSize;

    const blend = ((params.get('blend') as string) || 'ledfade') as Blend;

    // Edge span (in slots). Speed-aware expansion via fadeTime.
    const fadeSpan = Math.max(0, Number(params.get('fadeSpan')) || 0.35);
    const fadeSpanPxRaw = Number(params.get('fadeSpanPx'));
    const fadeSpanSlotsBase = Number.isFinite(fadeSpanPxRaw) ? Math.max(0, fadeSpanPxRaw / slotSize) : fadeSpan;

    const fadeTime = Math.max(0, Number(params.get('fadeTime')) || 0.033); // seconds; ~1 frame at 30fps
    // Final effective span grows with speed so fast motion still crosses a visible blend window.
    const effectiveSpanSlots = Math.max(fadeSpanSlotsBase, speedSlots * fadeTime);

    const holdFrac = Math.max(0, Math.min(0.45, Number(params.get('hold')) || 0));

    const brightness = clamp01(Number(params.get('brightness')) || 1.0);
    const gamma = Math.max(0.8, Number(params.get('gamma')) || 2.2);
    const lut = gamma !== 1 ? this.buildGammaLUT(gamma) : null;

    // --- timing / state ---
    const tSec = time > 200 ? time / 1000 : time;
    const key = this.key(N, instanceKey);
    const prev = this.stateByKey.get(key) || { lastTimeSec: tSec, lastPhaseSlots: 0 };

    let dir = 0;            // -1..+1 motion sense
    let phaseSlots = 0;     // absolute phase in slots (can grow unbounded)

    if (speedSlots > 0) {
      if (mode === 'pingpong') {
        const pingpongDistance = Math.max(1, Math.floor(Number(params.get('pingpongDistance')) || Math.min(patternLen, 16)));
        const cycleTime = pingpongDistance / Math.max(1e-6, speedSlots);
        const totalTime = cycleTime * 2;
        const p = ((tSec % totalTime) / cycleTime); // 0..2
        const trianglePos = p < 1 ? (p * pingpongDistance) : ((2 - p) * pingpongDistance);
        phaseSlots = trianglePos;
        dir = p < 1 ? 1 : -1;
        if (reverse) { dir = -dir; phaseSlots = pingpongDistance - phaseSlots; }
      } else if (mode === 'static') {
        dir = 0; phaseSlots = prev.lastPhaseSlots; // keep phase stable
      } else {
        dir = reverse ? -1 : 1;
        phaseSlots = speedSlots * dir * tSec; // linear, continuous
      }
    } else {
      dir = 0; phaseSlots = prev.lastPhaseSlots;
    }

    const dPhaseSlots = phaseSlots - prev.lastPhaseSlots;
    let dt = tSec - prev.lastTimeSec; if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    // --- per-sample color function (for temporal supersampling) ---
    const colorAtSlot = (slot: number) => colors[(slot % patternLen + patternLen) % patternLen];

    const renderAtPhase = (phaseS: number, effIndex: number): RGBColor => {
      // position in slots
      const u = (effIndex / slotSize) + phaseS;
      const base = Math.floor(u);
      let frac = u - base;
      if (holdFrac > 0) frac = fracWithHolds(frac, holdFrac);
      const baseSlot = ((base % patternLen) + patternLen) % patternLen;

      if (blend === 'ledfade' && speedSlots > 0 && dir !== 0 && effectiveSpanSlots > 0) {
        const sign = dir >= 0 ? +1 : -1;
        const neighborSlot = ((baseSlot + sign) % patternLen + patternLen) % patternLen;

        // directional leading-edge distance: 0 at the edge, increases away from it
        const distToLeadingEdge = sign >= 0 ? (1 - frac) : frac;

        const tRaw = 1 - Math.min(1, distToLeadingEdge / Math.max(1e-6, effectiveSpanSlots));
        const t = smoothstep(tRaw);

        const from = colorAtSlot(baseSlot);
        const to = colorAtSlot(neighborSlot);
        return t > 0 ? mixRGBf(from, to, t) : from;
      } else {
        return colorAtSlot(baseSlot);
      }
    };

    // --- temporal supersampling when phase jump skips the blend window ---
    const motionBlurMaxSamples = Math.max(1, Math.min(8, Math.floor(Number(params.get('motionBlurMaxSamples')) || 6)));
    const motionBlurThreshold = Math.max(0.1, Number(params.get('motionBlurThreshold')) || 0.9);

    // If the jump is bigger than ~the effective blend span, we risk skipping it; supersample.
    let samples = 1;
    const jump = Math.abs(dPhaseSlots);
    if (motionBlurMaxSamples > 1 && jump > motionBlurThreshold * effectiveSpanSlots) {
      // number of samples scales with how many spans we jump, clamp to max
      samples = Math.min(motionBlurMaxSamples, 1 + Math.ceil(jump / Math.max(1e-6, effectiveSpanSlots)));
    }

    const out = Buffer.alloc(N * 3);

    for (let i = 0; i < N; i++) {
      const effIndex = applyTransformations(i, N, mirror, flip);

      let accR = 0, accG = 0, accB = 0;

      if (samples === 1) {
        const c = renderAtPhase(phaseSlots, effIndex);
        accR = c.r; accG = c.g; accB = c.b;
      } else {
        // stratified samples from previous phase to current
        for (let s = 0; s < samples; s++) {
          const tS = (s + 0.5) / samples; // 0..1
          const ph = prev.lastPhaseSlots + dPhaseSlots * tS;
          const c = renderAtPhase(ph, effIndex);
          accR += c.r; accG += c.g; accB += c.b;
        }
        accR /= samples; accG /= samples; accB /= samples;
      }

      // brightness & gamma (single rounding)
      let rr = Math.round(accR * brightness);
      let gg = Math.round(accG * brightness);
      let bb = Math.round(accB * brightness);
      rr = rr < 0 ? 0 : rr > 255 ? 255 : rr;
      gg = gg < 0 ? 0 : gg > 255 ? 255 : gg;
      bb = bb < 0 ? 0 : bb > 255 ? 255 : bb;

      const k = i * 3;
      if (lut) {
        out[k]     = lut[rr];
        out[k + 1] = lut[gg];
        out[k + 2] = lut[bb];
      } else {
        out[k]     = rr;
        out[k + 1] = gg;
        out[k + 2] = bb;
      }
    }

    // persist state
    this.stateByKey.set(key, { lastTimeSec: tSec, lastPhaseSlots: phaseSlots });
    return out;
  }
}

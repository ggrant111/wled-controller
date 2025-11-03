/**
 * FlareBurstWavesEffect — anti-haze edition
 * Key fixes:
 *  - Time-based background fade (fadePerSec^dt)
 *  - Temporal blend in linear space (no prevOut blending)
 *  - Post composite black-clip to kill tiny residuals
 *  - Softer soft-add + optional overlap desaturation
 */

import { EffectGenerator } from './helpers';
import { hsvToRgb, RGBColor, parseColor } from './helpers/colorUtils';
import { getPalette, getColorsFromParams } from './helpers/paletteUtils';

type Phase = 'LAUNCH' | 'EXPLODE' | 'WAVES' | 'REST';

type Wave = {
  dir: -1 | 1;
  startAt: number;
  x: number;
  v: number;
  amp: number;
  amp0: number;
  sigma0: number;
  bornAt: number;
  color: RGBColor;
  active: boolean;
  dead?: boolean;
  waveIndex?: number;
};

type State = {
  prev: Uint8Array;     // previous linear buffer
  lastT: number;        // seconds
  phase: Phase;

  // flare
  flareX: number;
  flareV: number;
  flareWidth: number;
  flareColor: RGBColor;
  targetX: number;
  explodeAt?: number;

  // waves
  waves: Wave[];
  wavesDoneAt?: number;
  nextWaveIdx?: number;   // next (pair) index to arm
sepPx?: number;         // required separation in pixels
useTimeSchedule?: boolean; // true if waveInterval > 0

  // cycle timing
  restUntil?: number;
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function num(p: Map<string, any>, k: string, d: number) {
  const v = Number(p.get(k)); return Number.isFinite(v) ? v : d;
}
function num01(p: Map<string, any>, k: string, d: number) { return clamp01(num(p, k, d)); }

/** Soft-add that saturates smoothly toward limit. */
function softAdd(base: number, add: number, limit: number, k: number): number {
  const head = limit - base;
  if (head <= 0) return base;
  const ratio = head / limit;
  // squared curve = stronger protection near the limit
  const inc = Math.min(head, add * ratio * ratio * k);
  return base + inc;
}

function gauss(d: number, sigma: number): number {
  const s2 = 2 * sigma * sigma;
  return Math.exp(-(d * d) / s2);
}

function addAA_soft(buf: Uint8Array, pos: number, rgb: RGBColor, mag: number, softLimit: number, softK: number) {
  const i0 = Math.floor(pos);
  const frac = pos - i0;
  const w0 = 1 - frac, w1 = frac;
  if (i0 >= 0 && i0 * 3 + 2 < buf.length) {
    const k = i0 * 3;
    buf[k]     = Math.min(255, softAdd(buf[k],     Math.round(rgb.r * mag * w0), softLimit, softK));
    buf[k + 1] = Math.min(255, softAdd(buf[k + 1], Math.round(rgb.g * mag * w0), softLimit, softK));
    buf[k + 2] = Math.min(255, softAdd(buf[k + 2], Math.round(rgb.b * mag * w0), softLimit, softK));
  }
  const i1 = i0 + 1;
  if (i1 >= 0 && i1 * 3 + 2 < buf.length) {
    const k = i1 * 3;
    buf[k]     = Math.min(255, softAdd(buf[k],     Math.round(rgb.r * mag * w1), softLimit, softK));
    buf[k + 1] = Math.min(255, softAdd(buf[k + 1], Math.round(rgb.g * mag * w1), softLimit, softK));
    buf[k + 2] = Math.min(255, softAdd(buf[k + 2], Math.round(rgb.b * mag * w1), softLimit, softK));
  }
}

/** Optional overlap limiter that keeps hue (prevents whitening). */
function limitOverlapDesaturate(r: number, g: number, b: number, limit: number) {
  const m = Math.max(r, g, b);
  if (m <= limit) return [r, g, b] as const;
  const s = limit / m;
  return [Math.round(r * s), Math.round(g * s), Math.round(b * s)] as const;
}

export class FlareBurstWavesEffect implements EffectGenerator {
  private stateByKey = new Map<string, State>();
  private key(N: number, inst?: string) { return `${N}:${inst || 'default'}`; }

  private defaultPatriotic(): RGBColor[] {
    return [
      { r: 255, g: 0,   b: 0   },
      { r: 255, g: 255, b: 255 },
      { r: 0,   g: 120, b: 255 },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 0,   b: 0   }
    ];
  }

  private initState(N: number, t: number, params: Map<string, any>): State {
    const flareSpeed = Math.max(10,  num(params, 'flareSpeed', 220));
    const flareWidth = Math.max(1,   num(params, 'flareWidth', 6));
    const flareHue   = params.get('flareHue');
    const flareColor: RGBColor = flareHue == null ? { r: 255, g: 180, b: 64 } : hsvToRgb(Number(flareHue), 1.0, 1.0);

    const fromLeft = Math.random() < 0.5;
    const startX   = fromLeft ? 0 : (N - 1);
    const dir      = fromLeft ? 1 : -1;

    const minT = clamp01(num(params, 'targetMin', 0.3));
    const maxT = clamp01(num(params, 'targetMax', 0.7));
    const lo   = Math.min(minT, maxT);
    const hi   = Math.max(minT, maxT);
    const targetPos = Math.round(lerp(0, N - 1, lo + Math.random() * (hi - lo)));

    return {
      prev: new Uint8Array(N * 3),
      lastT: t,
      phase: 'LAUNCH',
      flareX: startX,
      flareV: dir * flareSpeed,
      flareWidth,
      flareColor,
      targetX: targetPos,
      waves: []
    };
  }

  private spawnExplosionWaves(st: State, N: number, tSec: number, params: Map<string, any>): void {
    // Check usePalette parameter to decide between palette and user colors
    const paletteObj = getPalette(params);
    const usePaletteParam = params.get('usePalette');
    const usePalette = usePaletteParam !== undefined 
      ? !!usePaletteParam && !!paletteObj  // Explicit: respect user choice
      : false;                              // Default: use colors (not palette)
    
    let palette: RGBColor[];
    if (usePalette && paletteObj) {
      // Use palette colors
      palette = paletteObj.colors.map(c => parseColor(c));
    } else {
      // Use user-defined colors array (ignore palette when usePalette is false)
      const colors = params.get('colors');
      if (Array.isArray(colors) && colors.length > 0) {
        palette = colors.map(c => parseColor(c));
      } else {
        palette = this.defaultPatriotic();
      }
    }
  
    // Optional rotate to change color order
    const paletteRotate = Math.round(Number(params.get('paletteRotate')) || 0);
    if (paletteRotate && palette.length > 0) {
      const r = ((paletteRotate % palette.length) + palette.length) % palette.length;
      palette = palette.slice(r).concat(palette.slice(0, r));
    }
  
    const waveCount        = Math.max(1,  Math.round(Number(params.get('waveCount')) || 5));
    const waveInterval     = Math.max(0,  Number(params.get('waveInterval')) || 0); // if >0 => time-scheduled
    const useTimeSchedule  = waveInterval > 0;
  
    const waveSpeed        = Math.max(10, Number(params.get('waveSpeed'))   || 260);
    const sigma0           = Math.max(0.4,Number(params.get('waveSigma'))   || 1.5);
    const dispersion       = Math.max(0,  Number(params.get('dispersion'))  || 0.012);
  
    // Amplitude schedule with minimums/gains
    const amp0             = Math.max(0.1, Number(params.get('waveAmp')) || 1.0);
    const ampDecayPerWave  = Math.min(1, Math.max(0, Number(params.get('ampDecayPerWave')) || 0.88));
    const minWaveAmp       = Math.max(0, Number(params.get('minWaveAmp')) || 0.33);
  
    // Optional per-wave gains: "1,1.1,1.25,1,1"
    let gains: number[] = [];
    const gainsRaw = (params.get('waveGains') as string) || '';
    if (gainsRaw.trim()) {
      gains = gainsRaw.split(',').map(s => Number(s.trim())).map(v => (Number.isFinite(v) ? v : 1));
    }
  
    // Build color sequence for waveCount
    const colors: RGBColor[] = [];
    for (let i = 0; i < waveCount; i++) colors.push(palette[i % palette.length]);
  
    const waves: Wave[] = [];
    for (let i = 0; i < waveCount; i++) {
      const base = amp0 * Math.pow(ampDecayPerWave, i);
      const gain = gains[i] ?? 1.0;
      const amp  = Math.max(minWaveAmp, base * gain);
      const c    = colors[i];
  
      // Time scheduling? Pre-fill startAt times; else mark pending (Infinity).
      const startAt = useTimeSchedule ? (tSec + i * waveInterval) : Number.POSITIVE_INFINITY;
  
      // Left
      waves.push({
        waveIndex: i, dir: -1, startAt, x: st.targetX, v: waveSpeed,
        amp, amp0: amp, sigma0, bornAt: startAt, color: c, active: false
      });
      // Right
      waves.push({
        waveIndex: i, dir:  1, startAt, x: st.targetX, v: waveSpeed,
        amp, amp0: amp, sigma0, bornAt: startAt, color: c, active: false
      });
    }
  
    // Arm the first wave pair immediately
    const armPair = (pairIdx: number, when: number) => {
      for (const w of waves) {
        if (w.waveIndex === pairIdx) {
          w.startAt = when;
          w.bornAt  = when;
          w.x       = st.targetX;
          w.active  = true;
        }
      }
    };
    armPair(0, tSec);
  
    st.waves = waves;
    st.explodeAt = tSec;
    st.useTimeSchedule = useTimeSchedule;
  
    // Distance-based scheduling config
    // If waveInterval==0 => distance schedule: each next pair launches
    // after previous pair has moved sepPx away from the target in BOTH directions.
    const sepPxParam   = Number(params.get('waveSeparationPx'));
    const sepFracParam = Number(params.get('waveSeparationFrac')); // 0..1
    const sepPx = Number.isFinite(sepPxParam)
      ? Math.max(2, sepPxParam)
      : Math.max(2, Math.round((Number.isFinite(sepFracParam) ? sepFracParam : 0.08) * N)); // default 8% of strip
  
    st.sepPx = sepPx;
    st.nextWaveIdx = 1; // we armed index 0 already
  }
  

  private updateWaves(
    st: State,
    N: number,
    tSec: number,
    dt: number,
    params: Map<string, any>,
    TIME_WRAP_SEC: number
  ) {
    if (!st.waves.length) return;
  
    // Per-frame decay / lifetime
    const dampPerSec  = num01(params, 'waveDampPerSec', 0.86);
    const deathThresh = Math.max(0.001, num(params, 'waveDeathThreshold', 0.03));
  
    // --- advance & damp ---
    for (const w of st.waves) {
      // Time-scheduled mode: arm when its start time arrives (handle wrap-around)
      if (st.useTimeSchedule && !w.active && w.startAt !== Number.POSITIVE_INFINITY) {
        const timeSinceStart = (tSec >= w.startAt)
          ? (tSec - w.startAt)
          : (tSec + TIME_WRAP_SEC - w.startAt);
        
        if (timeSinceStart >= 0) {
          w.active = true;
          w.bornAt = tSec;
          w.x      = st.targetX;
        }
      }
      if (!w.active) continue;
  
      // Move the front
      w.x += (w.dir * w.v) * dt;
  
      // Die at the ends (no bounce)
      if ((w.dir < 0 && w.x <= 0) || (w.dir > 0 && w.x >= N - 1)) {
        w.x = Math.max(0, Math.min(N - 1, w.x));
        w.dead = true;
      }
  
      // Global amplitude damping
      w.amp *= Math.pow(dampPerSec, dt);
      if (w.amp < deathThresh) w.dead = true;
    }
  
    // Remove dead waves
    st.waves = st.waves.filter(w => !w.dead);
  
    // --- distance-based staging (when waveInterval == 0) ---
    if (!st.useTimeSchedule && st.nextWaveIdx != null && st.sepPx != null) {
      // Visual shape -> guard margin so bands don't visually touch
      const frontWidthPx = Math.max(0.4, Number(params.get('frontWidthPx')) || 0.9);
      const trailLenPx   = Math.max(0,   Number(params.get('trailLenPx'))   || 4);
      const extraGuard   = Math.max(0,   Number(params.get('sepGuardPx'))   || 4);
      const guardPx      = Math.ceil(frontWidthPx * 2 + trailLenPx + extraGuard);
  
      // Required distance each front must travel from the explosion point
      const need = st.sepPx + guardPx;
  
      // Look at the most recently armed pair
      const prevIdx = Math.max(0, (st.nextWaveIdx as number) - 1);
  
      const prevL = st.waves.find(w =>
        w.waveIndex === prevIdx && w.dir === -1 && w.active
      );
      const prevR = st.waves.find(w =>
        w.waveIndex === prevIdx && w.dir ===  1 && w.active
      );
  
      let canArmNext = false;
  
      if (prevL && prevR) {
        // Both active: require both sides to be at least `need` px from center
        const dL = Math.abs(prevL.x - st.targetX);
        const dR = Math.abs(prevR.x - st.targetX);
        canArmNext = (dL >= need && dR >= need);
      } else {
        // If one/both from that pair are gone, only arm next
        // once there's NO active wave with that waveIndex (prevents instant relaunch)
        const stillThere = st.waves.some(w => w.waveIndex === prevIdx && w.active);
        canArmNext = !stillThere;
      }
  
      if (canArmNext) {
        const pairIdx = st.nextWaveIdx as number;
        // If another pair exists with this index, arm both directions now
        const hasNext = st.waves.some(w => w.waveIndex === pairIdx);
        if (hasNext) {
          for (const w of st.waves) {
            if (w.waveIndex === pairIdx && !w.active) {
              w.startAt = tSec;
              w.bornAt  = tSec;
              w.x       = st.targetX;
              w.active  = true;
            }
          }
          st.nextWaveIdx = pairIdx + 1;
        }
      }
    }
  }
  
  

  private renderWaves(buf: Uint8Array, st: State, N: number, params: Map<string, any>) {
    if (!st.waves.length) return;
  
    // Wave shape & separation
    const frontWidthPx  = Math.max(0.4, Number(params.get('frontWidthPx')) || .9); // sharp front
    const trailLenPx    = Math.max(0,   Number(params.get('trailLenPx'))   || 4);   // short tail
    const trailPersist  = clamp01(Number(params.get('trailPersist')) ?? 0.7);      // per-px decay along trail
  
    // Global brightness/limits
    const dispersion    = Math.max(0,   Number(params.get('dispersion'))    || 0.012);
    const rangeFalloff  = Math.max(0,   Number(params.get('rangeFalloff'))  || 0.18);
    const waveBright    = Math.max(0.05,Number(params.get('waveBrightness'))|| 1.0);
  
    const softLimit     = Math.max(32,  Number(params.get('softLimit'))     || 210);
    const softK         = Math.max(0.2, Number(params.get('softK'))         || 1.05);
    const desatOverlap  = !!params.get('desaturateOverlap'); // optional keep-hue limiter
  
    // Per-pixel "winner takes all" buffers (no additive multi-wave stacking)
    const wr = new Uint16Array(N);
    const wg = new Uint16Array(N);
    const wb = new Uint16Array(N);
    const wa = new Float32Array(N); // winning alpha/strength per pixel
  
    // Helper kernels
    const frontSigma2 = 2 * frontWidthPx * frontWidthPx;
  
    for (const w of st.waves) {
      if (!w.active) continue;
  
      // Sigma grows with distance from explosion (optional dispersion)
      const distFromCenter = Math.abs(w.x - st.targetX);
      const sigma = Math.max(0.4, w.sigma0 + dispersion * distFromCenter);
  
      for (let i = 0; i < N; i++) {
        // Signed distance relative to wave direction:
        //   s = 0 at the wave front
        //   s < 0 behind the front (where we draw the trail)
        //   s > 0 ahead of the front (no light)
        const s = (i - w.x) * w.dir;
  
        // Sharp front (very local)
        let aFront = 0;
        if (Math.abs(s) <= frontWidthPx * 3) {
          aFront = Math.exp(-(s * s) / frontSigma2); // narrow Gaussian ridge
        }
  
        // Short exponential trail only BEHIND the front
        let aTrail = 0;
        if (s < 0 && -s <= trailLenPx) {
          // Convert “distance behind front” to a decay factor
          // trailPersist is per-pixel; raise it to |s|
          aTrail = Math.pow(trailPersist, -s);
        }
  
        // Range attenuation to keep energy localized
        const r  = Math.max(1, Math.abs(i - w.x));
        const att = 1 / Math.sqrt(1 + rangeFalloff * r);
  
        // Combined amplitude, scaled by wave amp & global brightness
        // Small constant so front stands out even when trailPersist is high
        let a = (aFront * 1.0 + aTrail * 0.6) * w.amp * att * waveBright;
        if (!(a > 1e-5)) continue;
  
        // If multiple waves hit this pixel, keep only the strongest (separation!)
        if (a <= wa[i]) continue;
  
        wa[i] = a;
        wr[i] = Math.min(255, Math.round(w.color.r * a * 4.0));
        wg[i] = Math.min(255, Math.round(w.color.g * a * 4.0));
        wb[i] = Math.min(255, Math.round(w.color.b * a * 4.0));
      }
    }
  
    // Composite the winners into the working buffer with soft-add
    for (let i = 0; i < N; i++) {
      if (wa[i] <= 0) continue;
      const k = i * 3;
  
      let R = Math.min(255, softAdd(buf[k],     wr[i], softLimit, softK));
      let G = Math.min(255, softAdd(buf[k + 1], wg[i], softLimit, softK));
      let B = Math.min(255, softAdd(buf[k + 2], wb[i], softLimit, softK));
  
      if (desatOverlap) {
        // Optional: keep hue under heavy overlap instead of whitening
        const m = softLimit;
        if (R > m || G > m || B > m) {
          const s = m / Math.max(R, G, B);
          R = Math.round(R * s); G = Math.round(G * s); B = Math.round(B * s);
        }
      }
  
      buf[k] = R; buf[k + 1] = G; buf[k + 2] = B;
    }
  }
  

  private startNextFlare(st: State, N: number, t: number, params: Map<string, any>) {
    const flareSpeed = Math.max(10,  num(params, 'flareSpeed', 220));
    const flareWidth = Math.max(1,   num(params, 'flareWidth', 6));
    const flareHue   = params.get('flareHue');
    const flareColor: RGBColor = flareHue == null ? { r: 255, g: 180, b: 64 } : hsvToRgb(Number(flareHue), 1.0, 1.0);

    const fromLeft = Math.random() < 0.5;
    st.flareX = fromLeft ? 0 : (N - 1);
    st.flareV = (fromLeft ? 1 : -1) * flareSpeed;
    st.flareWidth = flareWidth;
    st.flareColor = flareColor;

    const minT = clamp01(num(params, 'targetMin', 0.3));
    const maxT = clamp01(num(params, 'targetMax', 0.7));
    const lo = Math.min(minT, maxT), hi = Math.max(minT, maxT);
    st.targetX = Math.round(lerp(0, N - 1, lo + Math.random() * (hi - lo)));

    st.waves = [];
    st.explodeAt = undefined;
    st.wavesDoneAt = undefined;
    st.restUntil = undefined;
    st.phase = 'LAUNCH';
  }

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const N = ledCount | 0;
    if (N <= 0) return Buffer.alloc(0);

    const tSecRaw = time > 200 ? time / 1000 : time;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period (1 hour in seconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_SEC = 3600; // 1 hour in seconds
    const tSec = tSecRaw % TIME_WRAP_SEC;
    
    const key = this.key(N, (params.get('instanceKey') || 'default') as string);

    let st = this.stateByKey.get(key);
    if (!st || st.prev.length !== N * 3) {
      st = this.initState(N, tSec, params);
      this.stateByKey.set(key, st);
    } else {
      // Normalize stored times when time wraps to keep comparisons valid
      const currentWrapBase = Math.floor(tSecRaw / TIME_WRAP_SEC) * TIME_WRAP_SEC;
      const lastWrapBase = Math.floor((st.lastT + TIME_WRAP_SEC) / TIME_WRAP_SEC - 1) * TIME_WRAP_SEC;
      if (currentWrapBase > lastWrapBase) {
        // Time wrapped, normalize stored times
        if (st.explodeAt) st.explodeAt = st.explodeAt % TIME_WRAP_SEC;
        if (st.wavesDoneAt) st.wavesDoneAt = st.wavesDoneAt % TIME_WRAP_SEC;
        if (st.restUntil) st.restUntil = st.restUntil % TIME_WRAP_SEC;
        // Normalize wave startAt and bornAt times
        for (const w of st.waves) {
          if (w.startAt !== Number.POSITIVE_INFINITY) {
            w.startAt = w.startAt % TIME_WRAP_SEC;
          }
          if (w.bornAt !== Number.POSITIVE_INFINITY) {
            w.bornAt = w.bornAt % TIME_WRAP_SEC;
          }
        }
      }
    }

    // --- parameters ---
    const fadePerSec      = num01(params, 'fadePerSec', 0.88);   // stronger = faster decay
    const blackClip       = Math.max(0, num(params, 'blackClip', 2)); // counts to subtract post-composite
    const tBlendLinear    = num01(params, 'temporalBlend', 0.06); // now linear-space
    const neighborGlow    = num01(params, 'neighborGlow', 0.10);
    const powerLimit      = num01(params, 'powerLimit', 1.0);
    const gamma           = Math.max(0.8, num(params, 'gamma', 2.2));
    const softLimit       = Math.max(32, num(params, 'softLimit', 210));
    const softK           = Math.max(0.2, num(params, 'softK', 1.05));

    // --- buffers ---
    const work = new Uint8Array(N * 3);

    // dt & time-based decay - handle wrap-around correctly
    let dt: number;
    if (st.lastT > 0) {
      const unwrappedDt = Math.max(0, tSecRaw - st.lastT);
      // Cap dt to reasonable frame time (prevent huge jumps from wrapping)
      dt = Math.min(unwrappedDt, 0.1); // Max 100ms delta
    } else {
      dt = 0.016; // Default frame time (16ms)
    }
    st.lastT = tSecRaw; // Store unwrapped for next frame's dt calculation
    const fade = Math.pow(fadePerSec, dt); // time-scaled

    // Start from decayed previous linear buffer
    for (let i = 0; i < N * 3; i++) {
      work[i] = Math.floor(st.prev[i] * fade);
    }

    // Optional linear temporal blend (reduces shimmer without haze)
    if (tBlendLinear > 0) {
      const a = Math.min(0.4, tBlendLinear);
      for (let i = 0; i < work.length; i++) {
        // blend toward previous frame slightly in linear space
        work[i] = Math.floor(work[i] * (1 - a) + st.prev[i] * a);
      }
    }

    // --- state machine ---
    switch (st.phase) {
      case 'LAUNCH': {
        st.flareX += st.flareV * dt;
        const goingRight = st.flareV > 0;
        const passed = goingRight ? (st.flareX >= st.targetX) : (st.flareX <= st.targetX);
        if (passed) { st.flareX = st.targetX; st.phase = 'EXPLODE'; }
        break;
      }
      case 'EXPLODE': {
        if (!st.explodeAt) this.spawnExplosionWaves(st, N, tSec, params);
        st.phase = 'WAVES';
        break;
      }
      case 'WAVES': {
        this.updateWaves(st, N, tSec, dt, params, TIME_WRAP_SEC);
        if (st.waves.length === 0) {
          const restTime = Math.max(0, num(params, 'restSec', 0.25));
          st.wavesDoneAt = tSec;
          st.restUntil = tSec + restTime;
          st.phase = 'REST';
        }
        break;
      }
      case 'REST': {
        // Handle time comparison with wrap-around
        if (st.restUntil) {
          const timeSinceRest = (tSec >= st.restUntil)
            ? (tSec - st.restUntil)
            : (tSec + TIME_WRAP_SEC - st.restUntil);
          
          if (timeSinceRest >= 0) {
            // Clear a little harder entering a new cycle
            for (let i = 0; i < work.length; i++) work[i] = Math.floor(work[i] * 0.6);
            this.startNextFlare(st, N, tSec, params);
          }
        }
        break;
      }
    }

    // --- rendering ---

    // 1) Waves
    this.renderWaves(work, st, N, params);

    // 2) Flare (during LAUNCH)
    if (st.phase === 'LAUNCH') {
      const w = Math.max(1, st.flareWidth / 2);
      addAA_soft(work, st.flareX, st.flareColor, 1.0, softLimit, softK);

      const tailPersist = num01(params, 'flareTrail', 0.86);
      const maxSpan = Math.ceil(w * 3);
      for (let i = Math.max(0, Math.floor(st.flareX) - maxSpan); i <= Math.min(N - 1, Math.ceil(st.flareX) + maxSpan); i++) {
        const d = Math.abs(i - st.flareX);
        const core = Math.max(0, 1 - d / w);
        const tail = Math.pow(tailPersist, d);
        const a = Math.max(core, 0.6 * tail) * 0.9;
        if (a > 1e-3) {
          const k = i * 3;
          work[k]     = Math.min(255, softAdd(work[k],     Math.round(st.flareColor.r * a), softLimit, softK));
          work[k + 1] = Math.min(255, softAdd(work[k + 1], Math.round(st.flareColor.g * a), softLimit, softK));
          work[k + 2] = Math.min(255, softAdd(work[k + 2], Math.round(st.flareColor.b * a), softLimit, softK));
        }
      }
    }

    // 3) Explosion pop (short) - handle time comparison with wrap-around
    if (st.explodeAt) {
      const timeSinceExplode = (tSec >= st.explodeAt)
        ? (tSec - st.explodeAt)
        : (tSec + TIME_WRAP_SEC - st.explodeAt);
      
      if (timeSinceExplode <= Math.max(0.01, num(params, 'popHold', 0.04))) {
      const k = st.targetX * 3;
      const flash = num(params, 'popBrightness', 120);
      if (k >= 0 && k + 2 < work.length) {
        work[k]     = Math.min(255, softAdd(work[k],     flash, softLimit, softK));
        work[k + 1] = Math.min(255, softAdd(work[k + 1], flash, softLimit, softK));
        work[k + 2] = Math.min(255, softAdd(work[k + 2], flash, softLimit, softK));
      }
      }
    }

    // 4) Neighbor glow (small)
    if (neighborGlow > 0) {
      const a = neighborGlow * 0.5, b = 1 - 2 * a;
      const r2 = new Uint8Array(N), g2 = new Uint8Array(N), b2 = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < N - 1 ? i + 1 : i;
        const i3 = i * 3, L3 = L * 3, R3 = R * 3;
        r2[i] = Math.min(255, Math.round(a * work[L3]     + b * work[i3]     + a * work[R3]));
        g2[i] = Math.min(255, Math.round(a * work[L3 + 1] + b * work[i3 + 1] + a * work[R3 + 1]));
        b2[i] = Math.min(255, Math.round(a * work[L3 + 2] + b * work[i3 + 2] + a * work[R3 + 2]));
      }
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        work[k] = r2[i]; work[k + 1] = g2[i]; work[k + 2] = b2[i];
      }
    }

    // 5) Post-composite black clip (kills tiny residuals & haze)
    if (blackClip > 0) {
      for (let i = 0; i < work.length; i++) {
        const v = work[i] - blackClip;
        work[i] = v > 0 ? v : 0;
      }
    }

    // 6) Power limit (linear)
    if (powerLimit < 1.0) {
      for (let i = 0; i < work.length; i++) work[i] = Math.floor(work[i] * powerLimit);
    }

    // 7) Gamma out
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      const v = Math.pow(work[i] / 255, 1 / gamma) * 255;
      out[i] = (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
    }

    // Save linear for next frame (no prevOut blending anymore)
    st.prev = work;
    this.stateByKey.set(key, st);
    return out;
  }
}

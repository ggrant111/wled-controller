/**
 * Skipping Rock Effect — Cinematic Water
 * - Subpixel rock with AA core & exponential tail
 * - Exponential skip distance (Poisson process) + energy loss per skip
 * - Ripple fronts with dispersion, 1/sqrt(r) attenuation, reflective ends
 * - Palette drift per skip (optional), temporal blend, neighbor glow, power limit
 */

import { EffectGenerator } from './helpers/effectUtils';
import { hsvToRgb, RGBColor } from './helpers/colorUtils';
import { getColorsFromParams, getPalette } from './helpers/paletteUtils';

type Ripple = {
  left:  { x: number; v: number };
  right: { x: number; v: number };
  amp: number;        // base amplitude
  sigma0: number;     // base thickness
  bornAt: number;     // seconds
  color: RGBColor;
  dead?: boolean;
};

type State = {
  prev: Uint8Array;
  lastT: number;

  paletteColors: RGBColor[];
  paletteT: number;

  // Rock
  rockX: number;      // px (float)
  rockV: number;      // px/s (signed)
  // Skip distance model
  distSinceSkip: number;
  meanSkipDist: number; // pixels
  nextSkipAtDist: number; // pixels until next skip (exp. distributed)
  // Impact flash
  lastImpactX: number;
  flashUntil: number; // seconds

  ripples: Ripple[];

  // temporal blend
  prevOut?: Uint8Array;
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function expSample(mean: number) { // exponential random with given mean
  const u = Math.max(1e-6, 1 - Math.random());
  return -Math.log(u) * mean;
}

function samplePaletteContinuous(colors: RGBColor[], t: number): RGBColor {
  if (colors.length === 0) return { r: 255, g: 255, b: 255 };
  if (colors.length === 1) return colors[0];
  const x = clamp01(t) * (colors.length - 1);
  const i = Math.floor(x);
  const j = Math.min(colors.length - 1, i + 1);
  const f = x - i;
  return {
    r: Math.round(lerp(colors[i].r, colors[j].r, f)),
    g: Math.round(lerp(colors[i].g, colors[j].g, f)),
    b: Math.round(lerp(colors[i].b, colors[j].b, f))
  };
}

export class SkippingRockEffect implements EffectGenerator {
  private stateByKey: Map<string, State> = new Map();

  private key(N: number, instanceKey?: string) { return `${N}:${instanceKey || 'default'}`; }
  
  // Clear state for a specific instance (used when streaming restarts)
  clearState(instanceKey?: string): void {
    if (instanceKey) {
      // Clear specific instance
      const keysToDelete: string[] = [];
      this.stateByKey.forEach((_, key) => {
        if (key.endsWith(`:${instanceKey}`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.stateByKey.delete(key));
    } else {
      // Clear all state
      this.stateByKey.clear();
    }
  }
  private rand(min: number, max: number) { return Math.random() * (max - min) + min; }

  private initState(N: number, t: number, params: Map<string, any>): State {
    // palette
    const pal = getPalette(params);
    const paletteColors = pal
      ? pal.colors.map(hex => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return { r, g, b } as RGBColor;
        })
      : getColorsFromParams(params, '#ffffff');

    // rock
    const rockSpeed = Math.max(20, Number(params.get('rockSpeed')) || 180);
    const dir = Math.random() < 0.5 ? 1 : -1;

    // skip model
    const meanSkipDist = Math.max(10, Number(params.get('meanSkipDist')) || 70);

    const st: State = {
      prev: new Uint8Array(N * 3),
      lastT: t,
      paletteColors,
      paletteT: Math.random(),

      rockX: Math.random() * (N - 1),
      rockV: dir * rockSpeed,

      distSinceSkip: 0,
      meanSkipDist,
      nextSkipAtDist: expSample(meanSkipDist),

      lastImpactX: Math.round((N - 1) / 2),
      flashUntil: -1,

      ripples: [],
      prevOut: undefined
    };
    return st;
  }

  private spawnRipple(st: State, N: number, origin: number, params: Map<string, any>, currentTime: number): void {
    const rippleSpeed = Math.max(20, Number(params.get('rippleSpeed')) || 260); // px/s
    const sigma0Raw = Number(params.get('rippleSigma'));
    // Validate sigma0 to prevent NaN
    const sigma0 = (isFinite(sigma0Raw) && !isNaN(sigma0Raw) && sigma0Raw > 0) ? Math.max(0.6, sigma0Raw) : 1.4;
    const maxRipples = Math.max(1, Number(params.get('maxRipples')) || 16);

    // color pick: drift along palette per skip, or random if disabled
    const useCycle = params.get('usePaletteCycle') ?? true;
    if (useCycle) {
      const step = Number(params.get('paletteShiftPerSkip'));
      st.paletteT = (st.paletteT + (isNaN(step) ? 0.18 : step)) % 1;
    } else {
      st.paletteT = Math.random();
    }
    const color = samplePaletteContinuous(st.paletteColors, st.paletteT);

    if (st.ripples.length >= maxRipples) st.ripples.shift();
    // Use the current time passed as parameter (this is the actual time when ripple is spawned)
    // Ensure origin is within valid LED range
    const validOrigin = Math.max(0, Math.min(N - 1, origin));
    st.ripples.push({
      left:  { x: validOrigin, v: -rippleSpeed },
      right: { x: validOrigin, v:  rippleSpeed },
      amp: 1.0,
      sigma0,
      bornAt: currentTime, // Use current time, not st.lastT which might be from previous frame
      color
    });
    console.log(`[Ripple] Spawned at LED ${origin}, total ripples: ${st.ripples.length}, bornAt: ${currentTime.toFixed(3)}, color: RGB(${color.r}, ${color.g}, ${color.b})`);
  }

  private updateRipples(st: State, N: number, dt: number, now: number, params: Map<string, any>): void {
    const reflectLoss     = clamp01(Number(params.get('reflectLoss')) ?? 0.65); // amplitude retained at a bounce
    const dampPerSec      = clamp01(Number(params.get('rippleDampPerSec')) ?? 0.55); // global decay
    const deathThresh     = Math.max(0.001, Number(params.get('rippleDeathThreshold')) || 0.03);
    const dispersionK     = Number(params.get('dispersion')) ?? 0.015; // sigma grows with radius
    const rangeFalloffK   = Number(params.get('rangeFalloff')) ?? 0.22; // 1/sqrt(r) attenuation strength
    const reflectRandom   = Number(params.get('reflectRandom')) ?? 0.06; // small randomness at walls
    const rippleSpeed     = Math.max(20, Number(params.get('rippleSpeed')) || 260); // px/s

    for (const r of st.ripples) {
      // Validate velocities before movement (prevent NaN propagation)
      if (!isFinite(r.left.v) || isNaN(r.left.v)) {
        console.warn(`[Ripples] Invalid left velocity: ${r.left.v}, resetting`);
        r.left.v = -rippleSpeed;
      }
      if (!isFinite(r.right.v) || isNaN(r.right.v)) {
        console.warn(`[Ripples] Invalid right velocity: ${r.right.v}, resetting`);
        r.right.v = rippleSpeed;
      }
      
      // Validate positions before movement
      if (!isFinite(r.left.x) || isNaN(r.left.x)) {
        console.warn(`[Ripples] Invalid left position: ${r.left.x}, resetting to 0`);
        r.left.x = 0;
      }
      if (!isFinite(r.right.x) || isNaN(r.right.x)) {
        console.warn(`[Ripples] Invalid right position: ${r.right.x}, resetting to ${N - 1}`);
        r.right.x = N - 1;
      }
      
      // move fronts
      r.left.x  += r.left.v  * dt;
      r.right.x += r.right.v * dt;
      
      // Validate velocities AFTER movement (catch any NaN from invalid calculations)
      if (!isFinite(r.left.v) || isNaN(r.left.v)) {
        console.warn(`[Ripples] Left velocity became NaN after movement, resetting`);
        r.left.v = -rippleSpeed;
      }
      if (!isFinite(r.right.v) || isNaN(r.right.v)) {
        console.warn(`[Ripples] Right velocity became NaN after movement, resetting`);
        r.right.v = rippleSpeed;
      }

      // reflect with tiny randomness + loss
      if (r.left.x < 0) {
        r.left.x = -r.left.x; // Reflect back into positive range
        
        // Ensure velocity is valid before reflection calculation
        const currentVel = isFinite(r.left.v) && !isNaN(r.left.v) ? r.left.v : -rippleSpeed;
        const velocityMagnitude = Math.abs(currentVel);
        const randomFactor = 1 + (Math.random() * 2 - 1) * reflectRandom;
        r.left.v = velocityMagnitude * randomFactor; // Ensure positive velocity after reflection
        
        // Validate velocity after reflection
        if (!isFinite(r.left.v) || isNaN(r.left.v)) {
          r.left.v = rippleSpeed; // Reset to default if invalid
        }
        
        r.amp *= reflectLoss;
      }
      if (r.right.x > N - 1) {
        const overshoot = r.right.x - (N - 1);
        r.right.x = (N - 1) - overshoot; // Reflect back into valid range
        
        // Ensure velocity is valid before reflection calculation
        const currentVel = isFinite(r.right.v) && !isNaN(r.right.v) ? r.right.v : rippleSpeed;
        const velocityMagnitude = Math.abs(currentVel);
        const randomFactor = 1 + (Math.random() * 2 - 1) * reflectRandom;
        r.right.v = -velocityMagnitude * randomFactor; // Ensure negative velocity after reflection
        
        // Validate velocity after reflection
        if (!isFinite(r.right.v) || isNaN(r.right.v)) {
          r.right.v = -rippleSpeed; // Reset to default if invalid
        }
        
        r.amp *= reflectLoss;
      }
      // clamp if somehow overshot hard (with NaN checks)
      r.left.x  = isFinite(r.left.x) && !isNaN(r.left.x) ? Math.max(0, Math.min(N - 1, r.left.x)) : 0;
      r.right.x = isFinite(r.right.x) && !isNaN(r.right.x) ? Math.max(0, Math.min(N - 1, r.right.x)) : N - 1;
      
      // Final validation of velocities after all operations
      if (!isFinite(r.left.v) || isNaN(r.left.v)) {
        r.left.v = -rippleSpeed;
      }
      if (!isFinite(r.right.v) || isNaN(r.right.v)) {
        r.right.v = rippleSpeed;
      }

      // global amplitude decay (time-based)
      r.amp *= Math.pow(dampPerSec, dt);

      // die when too small
      r.dead = r.amp < deathThresh;
    }
    st.ripples = st.ripples.filter(r => !r.dead);
  }

  private renderRipples(buf: Uint8Array, st: State, N: number, time: number, params: Map<string, any>): void {
    const additive = params.get('additive') ?? true;
    const dispersionK   = Number(params.get('dispersion')) ?? 0.015;
    const rangeFalloffK = Number(params.get('rangeFalloff')) ?? 0.22;
    const rippleBrightness = Math.max(0.5, Number(params.get('rippleBrightness')) ?? 1.0); // Boost ripple visibility
    
    if (st.ripples.length === 0) return; // Early exit if no ripples

    let totalPixelsRendered = 0;
    let maxAlpha = 0;

    for (const r of st.ripples) {
      // Skip invalid ripples
      if (!isFinite(r.left.x) || !isFinite(r.right.x) || isNaN(r.left.x) || isNaN(r.right.x)) {
        continue;
      }
      
      const age = Math.max(0, time - r.bornAt);
      // dynamic sigma grows with radius (dispersion)
      // use mean radius from average of fronts
      // Handle wrapped ripples: if fronts have crossed, calculate distance properly
      let distance = Math.abs(r.right.x - r.left.x);
      // If distance is greater than half the strip, the fronts have wrapped - use the shorter path
      if (distance > N * 0.5) {
        distance = N - distance;
      }
      const mid = distance * 0.5;
      
      // Validate inputs before calculating sigma to prevent NaN
      const validDispersionK = isFinite(dispersionK) && !isNaN(dispersionK) && dispersionK >= 0 ? dispersionK : 0.015;
      const validSigma0 = isFinite(r.sigma0) && !isNaN(r.sigma0) && r.sigma0 > 0 ? r.sigma0 : 1.4;
      const validMid = isFinite(mid) && !isNaN(mid) && mid >= 0 ? mid : 0;
      
      let sigma = Math.max(0.6, validSigma0 + validDispersionK * validMid);
      // Final validation of sigma to prevent NaN
      if (!isFinite(sigma) || isNaN(sigma) || sigma <= 0) {
        console.warn(`[Ripples] Invalid sigma: ${sigma}, resetting to default. sigma0=${r.sigma0}, dispersionK=${dispersionK}, mid=${mid}`);
        sigma = 1.4; // Safe default
      }
      const sigma2 = 2 * sigma * sigma;

      for (let i = 0; i < N; i++) {
        // Calculate wrapped distances (shortest path around the strip)
        // Handle wrapping: if direct distance > N/2, use the wrap-around distance
        let dl = i - r.left.x;
        if (Math.abs(dl) > N * 0.5) {
          dl = dl > 0 ? dl - N : dl + N;
        }
        let dr = i - r.right.x;
        if (Math.abs(dr) > N * 0.5) {
          dr = dr > 0 ? dr - N : dr + N;
        }
        
        const aL = Math.exp(-(dl * dl) / sigma2);
        const aR = Math.exp(-(dr * dr) / sigma2);

        // 1/sqrt(r) style attenuation (keep bounded)
        // Use wrapped distances for attenuation too
        const rl = Math.max(1, Math.abs(dl));
        const rr = Math.max(1, Math.abs(dr));
        const atten = 1 / (Math.sqrt(1 + rangeFalloffK * rl) * Math.sqrt(1 + rangeFalloffK * rr));

        // Boost amplitude and apply brightness multiplier for better visibility
        // Increase base brightness significantly to make ripples clearly visible
        // The ripples need to be bright enough to stand out against the rock
        // Significantly increase brightness multiplier to make ripples visible
        // When ripples are wrapped (fronts have met), reduce brightness since they're dying
        const isWrapped = Math.abs(r.right.x - r.left.x) > N * 0.5;
        const wrapFactor = isWrapped ? 0.5 : 1.0; // Reduce brightness when wrapped
        let a = (aL + aR) * r.amp * atten * rippleBrightness * 16.0 * wrapFactor; // Increased to 16.0 for much better visibility
        
        // Validate alpha value (prevent NaN/Infinity)
        if (!isFinite(a) || isNaN(a)) continue;
        
        // Track maxAlpha BEFORE the continue check (but after NaN check)
        if (a > maxAlpha) maxAlpha = a;
        
        // Much lower threshold - ripples are naturally dim but we want them visible
        if (a < 1e-6) continue; // Lowered from 1e-5 to 1e-6 to catch very dim ripples

        const idx = i * 3;
        const rrgb = r.color;
        totalPixelsRendered++;
        
        if (additive) {
          buf[idx]     = Math.min(255, buf[idx]     + Math.round(rrgb.r * a));
          buf[idx + 1] = Math.min(255, buf[idx + 1] + Math.round(rrgb.g * a));
          buf[idx + 2] = Math.min(255, buf[idx + 2] + Math.round(rrgb.b * a));
        } else {
          buf[idx]     = Math.max(buf[idx],     Math.round(rrgb.r * a));
          buf[idx + 1] = Math.max(buf[idx + 1], Math.round(rrgb.g * a));
          buf[idx + 2] = Math.max(buf[idx + 2], Math.round(rrgb.b * a));
        }
      }
    }
    
    // Debug: Log rendering stats occasionally
    if (st.ripples.length > 0 && Math.random() < 0.1) { // Log 10% of frames
      const firstRipple = st.ripples[0];
      const firstAge = Math.max(0, time - firstRipple.bornAt);
      const dist = Math.abs(firstRipple.right.x - firstRipple.left.x);
      const wrappedDist = dist > N * 0.5 ? N - dist : dist;
      const mid = wrappedDist * 0.5;
      
      // Use same validation as in render loop
      const validDispersionK = isFinite(dispersionK) && !isNaN(dispersionK) && dispersionK >= 0 ? dispersionK : 0.015;
      const validSigma0 = isFinite(firstRipple.sigma0) && !isNaN(firstRipple.sigma0) && firstRipple.sigma0 > 0 ? firstRipple.sigma0 : 1.4;
      const validMid = isFinite(mid) && !isNaN(mid) && mid >= 0 ? mid : 0;
      let sigma = Math.max(0.6, validSigma0 + validDispersionK * validMid);
      if (!isFinite(sigma) || isNaN(sigma) || sigma <= 0) {
        sigma = 1.4; // Safe default
      }
      
      // Calculate a sample alpha at the center of the ripple for debugging
      const centerX = (firstRipple.left.x + firstRipple.right.x) / 2;
      const sampleI = Math.floor(centerX) % N;
      let sampleDl = sampleI - firstRipple.left.x;
      if (Math.abs(sampleDl) > N * 0.5) {
        sampleDl = sampleDl > 0 ? sampleDl - N : sampleDl + N;
      }
      let sampleDr = sampleI - firstRipple.right.x;
      if (Math.abs(sampleDr) > N * 0.5) {
        sampleDr = sampleDr > 0 ? sampleDr - N : sampleDr + N;
      }
      const sigma2 = 2 * sigma * sigma;
      const sampleAL = Math.exp(-(sampleDl * sampleDl) / sigma2);
      const sampleAR = Math.exp(-(sampleDr * sampleDr) / sigma2);
      const sampleAtten = 1 / (Math.sqrt(1 + rangeFalloffK * Math.max(1, Math.abs(sampleDl))) * Math.sqrt(1 + rangeFalloffK * Math.max(1, Math.abs(sampleDr))));
      const isWrapped = dist > N * 0.5;
      const wrapFactor = isWrapped ? 0.5 : 1.0;
      const sampleA = (sampleAL + sampleAR) * firstRipple.amp * sampleAtten * rippleBrightness * 16.0 * wrapFactor;
      
      // console.log(`[Ripples] Rendered ${totalPixelsRendered} pixels, maxAlpha: ${maxAlpha.toFixed(4)}, active ripples: ${st.ripples.length}`);
      // console.log(`[Ripples] First ripple: age=${firstAge.toFixed(3)}s, amp=${firstRipple.amp.toFixed(4)}, sigma=${sigma.toFixed(2)}, sigma0=${firstRipple.sigma0.toFixed(2)}, dist=${dist.toFixed(1)}, wrappedDist=${wrappedDist.toFixed(1)}`);
      // console.log(`[Ripples] First ripple positions: left=${firstRipple.left.x.toFixed(2)}, right=${firstRipple.right.x.toFixed(2)}`);
      // console.log(`[Ripples] Sample alpha at center: ${isFinite(sampleA) ? sampleA.toFixed(6) : 'NaN'}, threshold: 1e-6`);
    }
  }

  private addAA(buf: Uint8Array, pos: number, rgb: RGBColor, mag: number) {
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const w0 = 1 - frac;
    const w1 = frac;
    if (i0 >= 0 && i0 * 3 + 2 < buf.length) {
      const k = i0 * 3;
      buf[k]     = Math.min(255, buf[k]     + Math.round(rgb.r * mag * w0));
      buf[k + 1] = Math.min(255, buf[k + 1] + Math.round(rgb.g * mag * w0));
      buf[k + 2] = Math.min(255, buf[k + 2] + Math.round(rgb.b * mag * w0));
    }
    const i1 = i0 + 1;
    if (i1 >= 0 && i1 * 3 + 2 < buf.length) {
      const k = i1 * 3;
      buf[k]     = Math.min(255, buf[k]     + Math.round(rgb.r * mag * w1));
      buf[k + 1] = Math.min(255, buf[k + 1] + Math.round(rgb.g * mag * w1));
      buf[k + 2] = Math.min(255, buf[k + 2] + Math.round(rgb.b * mag * w1));
    }
  }

  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer {
    const N = ledCount | 0;
    if (N <= 0) return Buffer.alloc(0);

    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.key(N, instanceKey);

    let st = this.stateByKey.get(key);
    if (!st) {
      st = this.initState(N, time, params);
      this.stateByKey.set(key, st);
    }
    
    // If LED count changed, reinitialize state for this LED count
    // This ensures rock position is always within the correct LED range
    if (st.prev.length !== N * 3) {
      // LED count changed - reinitialize for new count
      st = this.initState(N, time, params);
      this.stateByKey.set(key, st);
    }

    // ---- params ----
    const bgFade          = clamp01(Number(params.get('backgroundFade')) ?? 0.94);
    const gamma           = Math.max(0.8, Number(params.get('gamma')) || 2.2);
    const temporalBlend   = clamp01(Number(params.get('temporalBlend')) ?? 0.0); // 0..0.4 good
    const neighborGlow    = clamp01(Number(params.get('neighborGlow')) ?? 0.0);  // 0..0.3
    const powerLimit      = clamp01(Number(params.get('powerLimit')) ?? 1.0);
    const additive        = params.get('additive') ?? true;

    // rock shape
    const rockWidth       = Math.max(1, Number(params.get('rockWidth')) || 6);
    const rockTrail       = clamp01(Number(params.get('rockTrail')) ?? 0.85);
    const rockBright      = clamp01(Number(params.get('rockBrightness')) ?? 1.0);
    const rockHueParam    = params.get('rockHue'); // number | undefined

    // rock dynamics
    const desiredSpeed    = Math.max(20, Number(params.get('rockSpeed')) || 180); // px/s
    const elasticityRaw   = Number(params.get('elasticity'));
    const elasticity      = isFinite(elasticityRaw) && !isNaN(elasticityRaw) && elasticityRaw > 0 && elasticityRaw <= 1 
                            ? elasticityRaw 
                            : 0.78; // Default if invalid
    const meanSkipDist    = Math.max(10, Number(params.get('meanSkipDist')) || st.meanSkipDist); // px
    st.meanSkipDist = meanSkipDist; // allow live updates

    // buffer (linear-ish; gamma on output)
    const work = new Uint8Array(N * 3);
    for (let i = 0; i < N * 3; i++) work[i] = (st.prev[i] * bgFade) | 0;

    // time step
    const dt = Math.max(0, time - st.lastT);
    st.lastT = time;
    
    // Ensure velocity is valid before moving (catch NaN/Infinity early)
    if (!isFinite(st.rockV) || isNaN(st.rockV)) {
      console.warn(`[SkippingRock] Invalid velocity before movement: ${st.rockV}, resetting to desiredSpeed`);
      st.rockV = st.rockV >= 0 || isNaN(st.rockV) ? desiredSpeed : -desiredSpeed;
    }

    // Move rock with current velocity first
    st.rockX += st.rockV * dt;

    // wall hits are "hard skips" - check before velocity restoration
    let bounced = false;
    const wallHitLeft  = st.rockX < 0;
    const wallHitRight = st.rockX >= N;

    if (wallHitLeft || wallHitRight) {
      bounced = true;
      
      // Wall bounce: reverse direction and reflect position
      // This ensures the rock always stays visible and bounces back
      
      // First, ensure velocity is valid before bounce calculation
      if (!isFinite(st.rockV) || isNaN(st.rockV)) {
        console.warn(`[SkippingRock] Invalid velocity before bounce: ${st.rockV}, resetting to desiredSpeed`);
        st.rockV = st.rockV >= 0 ? desiredSpeed : -desiredSpeed;
      }
      
      if (wallHitLeft) {
        // Hit left wall (x < 0) - bounce right
        // Reflect: mirror the position across x=0
        const overshoot = -st.rockX; // How far past 0 we went (positive)
        st.rockX = overshoot; // Reflect to positive side
        st.rockV = Math.abs(st.rockV) * elasticity; // Positive velocity (moving right)
      } else {
        // Hit right wall (x >= N) - bounce left  
        // Reflect: mirror the position across x=N-1
        const overshoot = st.rockX - (N - 1); // How far past N-1 we went (positive)
        st.rockX = (N - 1) - overshoot; // Reflect back into strip
        st.rockV = -Math.abs(st.rockV) * elasticity; // Negative velocity (moving left)
      }
      
      // Ensure position is within bounds after reflection
      // Use tight clamping to ensure rock is visible but doesn't immediately re-bounce
      st.rockX = Math.max(0, Math.min(N - 1, st.rockX));
      
      // Validate velocity after bounce calculation
      if (!isFinite(st.rockV) || isNaN(st.rockV)) {
        console.error(`[SkippingRock] NaN velocity after bounce calculation! elasticity=${elasticity}, desiredSpeed=${desiredSpeed}`);
        st.rockV = wallHitLeft ? desiredSpeed * elasticity : -desiredSpeed * elasticity;
      }
      
      // Ensure minimum velocity to prevent getting stuck - use higher minimum to keep it moving
      const minVel = Math.max(30, desiredSpeed * 0.2); // At least 20% of desired speed or 30px/s
      if (Math.abs(st.rockV) < minVel || !isFinite(st.rockV)) {
        st.rockV = (st.rockV >= 0 ? 1 : -1) * minVel;
      }
      
      // Don't let velocity get too low - maintain at least 15% of desired speed
      const maxVelLoss = desiredSpeed * 0.15;
      if (Math.abs(st.rockV) < maxVelLoss) {
        st.rockV = (st.rockV >= 0 ? 1 : -1) * maxVelLoss;
      }
      
      // Final validation - ensure velocity is always finite
      if (!isFinite(st.rockV) || isNaN(st.rockV)) {
        console.error(`[SkippingRock] Velocity still invalid after all checks! Setting to safe default.`);
        st.rockV = wallHitLeft ? desiredSpeed * 0.3 : -desiredSpeed * 0.3;
      }
      
      // Final clamp to ensure position is within valid LED range [0, N-1]
      st.rockX = Math.max(0, Math.min(N - 1, st.rockX));
      
      st.distSinceSkip = 0;
      st.nextSkipAtDist = expSample(meanSkipDist);
      st.lastImpactX = Math.round(Math.max(0, Math.min(N - 1, st.rockX)));
      st.flashUntil = time + (Number(params.get('skipHoldMs')) ?? 35) / 1000;

      // spawn ripple at wall
      this.spawnRipple(st, N, st.lastImpactX, params, time);
      
      // Debug: Log bounce for troubleshooting (can be removed later)
      // console.log(`[Bounce] ${wallHitLeft ? 'LEFT' : 'RIGHT'} wall: x=${st.rockX.toFixed(2)}, v=${st.rockV.toFixed(2)}, N=${N}`);
    }
    
    // Always ensure rock stays within LED bounds [0, N-1]
    // Only clamp if we didn't just bounce (bounce already handled position)
    if (!bounced) {
      st.rockX = Math.max(0, Math.min(N - 1, st.rockX));
    }
    
    // Restore velocity toward desiredSpeed if it's been reduced (only if we didn't just bounce)
    // This helps maintain continuous movement by gradually restoring speed after losses
    if (!bounced) {
      const dir = st.rockV >= 0 ? 1 : -1;
      const currentSpeed = Math.abs(st.rockV);
      if (currentSpeed < desiredSpeed * 0.95) {
        // Gradually restore speed (exponential approach toward desiredSpeed)
        // Use faster restoration to prevent velocity from getting stuck too low
        const restoreRate = 0.12; // 12% per frame - more aggressive restoration
        const targetSpeed = desiredSpeed;
        const newSpeed = currentSpeed + (targetSpeed - currentSpeed) * restoreRate;
        st.rockV = dir * Math.min(desiredSpeed, newSpeed);
      } else if (currentSpeed > desiredSpeed * 1.05) {
        // Cap at desired speed if somehow exceeded
        st.rockV = dir * desiredSpeed;
      }
    }
    
    // Safety check: Initialize if velocity is invalid, NaN, or too low
    if (!isFinite(st.rockV) || isNaN(st.rockV) || Math.abs(st.rockV) < 1 || Math.abs(st.rockV) < desiredSpeed * 0.1) {
      const dir = st.rockV >= 0 || isNaN(st.rockV) ? 1 : -1;
      // Reset to at least 30% of desired speed if it gets too low or invalid
      st.rockV = dir * Math.max(desiredSpeed * 0.3, 30);
      if (!isFinite(st.rockV)) {
        console.warn(`[SkippingRock] Velocity still invalid after reset! desiredSpeed=${desiredSpeed}`);
        st.rockV = desiredSpeed * 0.5; // Final fallback
      }
    }

    // internal skip check by accumulated travel distance
    st.distSinceSkip += Math.abs(st.rockV) * dt;
    if (st.distSinceSkip >= st.nextSkipAtDist) {
      st.distSinceSkip = 0;
      st.nextSkipAtDist = expSample(meanSkipDist);
      const origin = Math.round(st.rockX);
      this.spawnRipple(st, N, origin, params, time);
      st.lastImpactX = origin;
      st.flashUntil = time + (Number(params.get('skipHoldMs')) ?? 35) / 1000;

      // lose a bit of speed every skip (gravity/energy loss)
      // Use a milder reduction for internal skips (only lose 5-10% vs wall bounces which lose 22%)
      // This prevents velocity from dropping too quickly
      const internalSkipLoss = 0.92; // Only lose 8% per internal skip (vs 22% for wall bounce)
      st.rockV *= internalSkipLoss;
      
      // Ensure velocity doesn't drop below minimum after internal skip
      const minVelAfterSkip = Math.max(30, desiredSpeed * 0.25); // 25% of desired speed minimum
      if (Math.abs(st.rockV) < minVelAfterSkip) {
        const dir = st.rockV >= 0 ? 1 : -1;
        st.rockV = dir * minVelAfterSkip;
      }
    }

    // update ripples
    this.updateRipples(st, N, dt, time, params);

    // draw ripples
    const rippleCountBefore = st.ripples.length;
    this.renderRipples(work, st, N, time, params);
    if (rippleCountBefore > 0) {
      // Debug: Log ripple rendering
      // console.log(`[Ripples] Rendering ${rippleCountBefore} ripple(s), active after update: ${st.ripples.length}`);
    }

    // draw rock (AA head + exponential tail)
    const rockRGB: RGBColor =
      rockHueParam === null || rockHueParam === undefined
        ? samplePaletteContinuous(st.paletteColors, st.paletteT)
        : hsvToRgb(Number(rockHueParam), 1.0, rockBright);

    const halfW = Math.max(1, rockWidth / 2);
    const tailPersist = rockTrail;

    // AA head
    this.addAA(work, st.rockX, rockRGB, rockBright);

    // tail (both sides), subpixel-aware
    const maxSpan = Math.ceil(halfW * 3);
    for (let i = Math.max(0, Math.floor(st.rockX) - maxSpan); i <= Math.min(N - 1, Math.ceil(st.rockX) + maxSpan); i++) {
      const d = Math.abs(i - st.rockX);
      const core = Math.max(0, 1 - d / halfW);
      const tail = Math.pow(tailPersist, d);
      const a = Math.max(core, 0.6 * tail) * rockBright * 0.85; // keep head brightest
      if (a > 1e-3) {
        const idx = i * 3;
        if (additive) {
          work[idx]     = Math.min(255, work[idx]     + Math.round(rockRGB.r * a));
          work[idx + 1] = Math.min(255, work[idx + 1] + Math.round(rockRGB.g * a));
          work[idx + 2] = Math.min(255, work[idx + 2] + Math.round(rockRGB.b * a));
        } else {
          work[idx]     = Math.max(work[idx],     Math.round(rockRGB.r * a));
          work[idx + 1] = Math.max(work[idx + 1], Math.round(rockRGB.g * a));
          work[idx + 2] = Math.max(work[idx + 2], Math.round(rockRGB.b * a));
        }
      }
    }

    // impact flash (subtle white)
    if (time <= st.flashUntil) {
      const k = st.lastImpactX * 3;
      if (k >= 0 && k + 2 < work.length) {
        const flash = 180;
        work[k]     = Math.min(255, work[k]     + flash);
        work[k + 1] = Math.min(255, work[k + 1] + flash);
        work[k + 2] = Math.min(255, work[k + 2] + flash);
      }
    }

    // neighbor glow (tiny blur)
    if (neighborGlow > 0) {
      const a = neighborGlow * 0.5; // sides
      const b = 1 - 2 * a;          // center
      const r2 = new Uint8Array(N), g2 = new Uint8Array(N), b2 = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const L = i > 0 ? i - 1 : i;
        const R = i < N - 1 ? i + 1 : i;
        const i3 = i * 3, L3 = L * 3, R3 = R * 3;
        r2[i] = Math.min(255, Math.round(a * work[L3] + b * work[i3] + a * work[R3]));
        g2[i] = Math.min(255, Math.round(a * work[L3 + 1] + b * work[i3 + 1] + a * work[R3 + 1]));
        b2[i] = Math.min(255, Math.round(a * work[L3 + 2] + b * work[i3 + 2] + a * work[R3 + 2]));
      }
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        work[k] = r2[i]; work[k + 1] = g2[i]; work[k + 2] = b2[i];
      }
    }

    // power limit (simple overall scaler)
    if (powerLimit < 1.0) {
      for (let i = 0; i < work.length; i++) work[i] = Math.floor(work[i] * powerLimit);
    }

    // temporal blend (camera anti-shimmer)
    if (st.prevOut && temporalBlend > 0) {
      const tB = Math.min(0.4, temporalBlend);
      for (let i = 0; i < work.length; i++) {
        work[i] = Math.floor(work[i] * (1 - tB) + st.prevOut[i] * tB);
      }
    }

    // gamma out
    const out = Buffer.alloc(work.length);
    for (let i = 0; i < work.length; i++) {
      const v = Math.pow(work[i] / 255, 1 / gamma) * 255;
      out[i] = (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
    }

    st.prev = work;
    st.prevOut = new Uint8Array(out);
    this.stateByKey.set(key, st);
    return out;
  }
}

/**
 * Ethereal Matrix Effect
 * 
 * A multi-layered effect combining:
 * - Base plasma wave layer (slow-moving gradient)
 * - Comet layer with black trails (using multiply/replace blend)
 * - Sparkle layer (twinkling stars using add blend)
 * - Rotation overlay (rotating gradient using overlay blend)
 * - Dark pulse layer (periodic black waves using multiply/min blend)
 */

import { EffectGenerator } from './helpers';
import { RGBColor, hsvToRgb, parseColor } from './helpers/colorUtils';
import { blendColors } from './helpers/blendUtils';
import { getColorArray } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

interface Comet {
  position: number;
  speed: number;
  color: RGBColor;
  life: number;
  maxLife: number;
}

interface Sparkle {
  position: number;
  brightness: number;
  maxBrightness: number;
  phase: number;
  color: RGBColor;
}

interface EffectState {
  plasmaPhase: number;
  rotationPhase: number;
  comets: Comet[];
  sparkles: Sparkle[];
  darkPulsePhase: number;
  lastCometSpawn: number;
  lastSparkleSpawn: number;
  hueOffset: number;
}

export class EtherealMatrixEffect implements EffectGenerator {
  private stateByKey: Map<string, EffectState> = new Map();

  private keyFor(ledCount: number, instanceKey?: string): string {
    return `${ledCount}:${instanceKey || 'default'}`;
  }

  private random(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private initState(ledCount: number): EffectState {
    const comets: Comet[] = [];
    const sparkles: Sparkle[] = [];
    
    // Initialize a few sparkles
    for (let i = 0; i < Math.min(5, Math.floor(ledCount / 20)); i++) {
      sparkles.push(this.createSparkle(ledCount));
    }

    return {
      plasmaPhase: 0,
      rotationPhase: 0,
      comets,
      sparkles,
      darkPulsePhase: 0,
      lastCometSpawn: 0,
      lastSparkleSpawn: 0,
      hueOffset: 0,
    };
  }

  private createSparkle(ledCount: number): Sparkle {
    return {
      position: Math.floor(this.random(0, ledCount)),
      brightness: 0,
      maxBrightness: this.random(150, 255),
      phase: this.random(0, Math.PI * 2),
      color: {
        r: Math.floor(this.random(200, 255)),
        g: Math.floor(this.random(200, 255)),
        b: Math.floor(this.random(200, 255)),
      },
    };
  }

  private createComet(ledCount: number, colors: RGBColor[]): Comet {
    const color = colors[Math.floor(this.random(0, colors.length))];
    return {
      position: this.random(0, ledCount),
      speed: this.random(0.5, 2.5),
      color,
      life: 0,
      maxLife: this.random(100, 200),
    };
  }

  /**
   * Map speed parameter (0-10) to actual motion speed
   * 0 = no motion (static)
   * 10 = medium motion
   */
  private mapSpeed(speed: number): number {
    // Linear mapping: 0 -> 0, 10 -> 1.0
    return Math.max(0, Math.min(10, speed)) / 10;
  }

  /**
   * Map parameter (0-10) to brightness multiplier
   */
  private mapBrightness(param: number): number {
    // 0 -> 0.1, 10 -> 1.0
    return 0.1 + (Math.max(0, Math.min(10, param)) / 10) * 0.9;
  }

  /**
   * Map opacity parameter (0-10) to 0-1 multiplier
   */
  private mapOpacity(opacity: number): number {
    // 0 -> 0.0 (off), 10 -> 1.0 (full)
    return Math.max(0, Math.min(10, opacity)) / 10;
  }

  /**
   * Generate base plasma wave layer
   */
  private renderPlasmaLayer(
    buffer: Buffer,
    ledCount: number,
    time: number,
    speed: number,
    brightness: number,
    opacity: number,
    state: EffectState,
    colors: RGBColor[]
  ): void {
    const opacityFactor = this.mapOpacity(opacity);
    if (opacityFactor === 0) return; // Skip layer if opacity is 0

    const speedFactor = this.mapSpeed(speed);
    const brightnessFactor = this.mapBrightness(brightness);
    state.plasmaPhase += 0.005 * speedFactor;
    state.hueOffset += 0.3 * speedFactor;

    for (let i = 0; i < ledCount; i++) {
      const position = i / Math.max(1, ledCount);
      
      // Create plasma-like wave pattern
      const wave1 = Math.sin((position * Math.PI * 4) + state.plasmaPhase);
      const wave2 = Math.sin((position * Math.PI * 6) + state.plasmaPhase * 1.3);
      const wave3 = Math.sin((i * 0.1) + state.plasmaPhase * 0.7);
      
      const combined = (wave1 + wave2 + wave3) / 3;
      const hue = ((combined + 1) * 180 + state.hueOffset) % 360;
      const saturation = 0.7 + (combined + 1) * 0.15;
      let value = (0.3 + (combined + 1) * 0.25) * brightnessFactor * opacityFactor;

      const color = hsvToRgb(hue, saturation, value);
      
      const p = i * 3;
      buffer[p] = color.r;
      buffer[p + 1] = color.g;
      buffer[p + 2] = color.b;
    }
  }

  /**
   * Map parameter (0-10) to frequency multiplier
   * Higher = more frequent
   */
  private mapFrequency(param: number): number {
    // 0 -> 0.1x, 10 -> 3.0x frequency
    return 0.1 + (Math.max(0, Math.min(10, param)) / 10) * 2.9;
  }

  /**
   * Generate comet layer with black trails
   */
  private renderCometLayer(
    buffer: Buffer,
    ledCount: number,
    time: number,
    speed: number,
    cometFrequency: number,
    cometTailLength: number,
    opacity: number,
    state: EffectState,
    colors: RGBColor[],
    timeWrapped: number,
    TIME_WRAP_MS: number
  ): void {
    const opacityFactor = this.mapOpacity(opacity);
    if (opacityFactor === 0) return; // Skip layer if opacity is 0

    const speedFactor = this.mapSpeed(speed);
    const frequencyFactor = this.mapFrequency(cometFrequency);
    // Map tail length: 0 -> 5, 10 -> 30
    const tailLength = Math.floor(5 + (cometTailLength / 10) * 25);

    // Fade existing comets (black override)
    for (let i = state.comets.length - 1; i >= 0; i--) {
      const comet = state.comets[i];
      comet.life += 1 * speedFactor;
      comet.position += comet.speed * speedFactor;

      // Update comet
      if (comet.life >= comet.maxLife || comet.position >= ledCount + 20) {
        state.comets.splice(i, 1);
        continue;
      }

      // Render comet with trail
      const intensity = 1.0 - (comet.life / comet.maxLife);
      
      for (let offset = 0; offset < tailLength; offset++) {
        const pos = Math.floor(comet.position - offset);
        if (pos >= 0 && pos < ledCount) {
          const trailIntensity = (tailLength - offset) / tailLength;
          const pixelIntensity = intensity * trailIntensity;
          
          const p = pos * 3;
          const baseColor = {
            r: buffer[p],
            g: buffer[p + 1],
            b: buffer[p + 2],
          };
          
          // Blend comet color with multiply (darkens base) where comet passes
          const cometBlend = blendColors(
            baseColor,
            comet.color,
            'multiply',
            pixelIntensity * 0.6 * opacityFactor
          );
          
          // Then use replace blend for bright comet head
          const finalColor = blendColors(
            cometBlend,
            comet.color,
            'replace',
            pixelIntensity * (offset === 0 ? 0.9 : 0.3) * opacityFactor
          );
          
          buffer[p] = finalColor.r;
          buffer[p + 1] = finalColor.g;
          buffer[p + 2] = finalColor.b;
        }
      }
    }

    // Spawn new comets periodically
    // Base interval: 2000ms, reduced by speed and frequency
    const baseInterval = 2000;
    const speedReduction = speedFactor * 1500;
    const frequencyReduction = (frequencyFactor - 1) * 1000;
    const cometInterval = Math.max(200, baseInterval - speedReduction - frequencyReduction);
    
    // Use wrapped time for comparisons, but handle wrap-around correctly
    const timeSinceComet = (time >= state.lastCometSpawn) 
      ? (time - state.lastCometSpawn)
      : (time + TIME_WRAP_MS - state.lastCometSpawn);
    
    if (timeSinceComet > cometInterval) {
      state.comets.push(this.createComet(ledCount, colors));
      state.lastCometSpawn = time;
    }
  }

  /**
   * Generate sparkle layer (twinkling stars)
   */
  private renderSparkleLayer(
    buffer: Buffer,
    ledCount: number,
    time: number,
    speed: number,
    sparkleDensity: number,
    opacity: number,
    state: EffectState,
    timeWrapped: number,
    TIME_WRAP_MS: number
  ): void {
    const opacityFactor = this.mapOpacity(opacity);
    if (opacityFactor === 0) return; // Skip layer if opacity is 0

    const speedFactor = this.mapSpeed(speed);
    // Map density: 0 -> max 1 sparkle per 50 LEDs, 10 -> max 1 sparkle per 5 LEDs
    const maxSparkles = Math.floor(ledCount / (50 - (sparkleDensity / 10) * 45));

    // Update existing sparkles
    for (let i = state.sparkles.length - 1; i >= 0; i--) {
      const sparkle = state.sparkles[i];
      sparkle.phase += 0.05 * speedFactor;
      
      // Twinkle effect using sine wave
      sparkle.brightness = (Math.sin(sparkle.phase) + 1) / 2;
      sparkle.brightness *= sparkle.maxBrightness;

      // Remove dead sparkles
      if (sparkle.brightness < 10 && sparkle.phase > Math.PI * 2) {
        state.sparkles.splice(i, 1);
        continue;
      }

      // Render sparkle using add blend (brightens)
      if (sparkle.position >= 0 && sparkle.position < ledCount) {
        const p = Math.floor(sparkle.position) * 3;
        const baseColor = {
          r: buffer[p],
          g: buffer[p + 1],
          b: buffer[p + 2],
        };

        const sparkleColor = {
          r: Math.floor(sparkle.color.r * (sparkle.brightness / 255)),
          g: Math.floor(sparkle.color.g * (sparkle.brightness / 255)),
          b: Math.floor(sparkle.color.b * (sparkle.brightness / 255)),
        };

        const blended = blendColors(baseColor, sparkleColor, 'add', 0.8 * opacityFactor);
        
        buffer[p] = blended.r;
        buffer[p + 1] = blended.g;
        buffer[p + 2] = blended.b;
      }
    }

    // Spawn new sparkles
    const sparkleInterval = 500 - (speedFactor * 300);
    // Use wrapped time for comparisons, but handle wrap-around correctly
    const timeSinceSparkle = (time >= state.lastSparkleSpawn)
      ? (time - state.lastSparkleSpawn)
      : (time + TIME_WRAP_MS - state.lastSparkleSpawn);
    
    if (timeSinceSparkle > sparkleInterval && state.sparkles.length < maxSparkles) {
      state.sparkles.push(this.createSparkle(ledCount));
      state.lastSparkleSpawn = time;
    }
  }

  /**
   * Generate rotation overlay layer
   */
  private renderRotationLayer(
    buffer: Buffer,
    ledCount: number,
    time: number,
    speed: number,
    opacity: number,
    state: EffectState,
    colors: RGBColor[]
  ): void {
    const opacityFactor = this.mapOpacity(opacity);
    if (opacityFactor === 0) return; // Skip layer if opacity is 0

    const speedFactor = this.mapSpeed(speed);
    state.rotationPhase += 0.008 * speedFactor;

    for (let i = 0; i < ledCount; i++) {
      const position = i / Math.max(1, ledCount);
      
      // Rotating gradient pattern
      const angle = (position * Math.PI * 2) + state.rotationPhase;
      const gradient = (Math.sin(angle) + 1) / 2;
      
      // Select color from palette based on gradient
      const colorIndex = Math.floor(gradient * (colors.length - 1));
      const color = colors[colorIndex];
      
      // Use overlay blend for subtle enhancement
      const p = i * 3;
      const baseColor = {
        r: buffer[p],
        g: buffer[p + 1],
        b: buffer[p + 2],
      };

      const overlayColor = {
        r: Math.floor(color.r * gradient * 0.4),
        g: Math.floor(color.g * gradient * 0.4),
        b: Math.floor(color.b * gradient * 0.4),
      };

      const blended = blendColors(baseColor, overlayColor, 'overlay', 0.5 * opacityFactor);
      
      buffer[p] = blended.r;
      buffer[p + 1] = blended.g;
      buffer[p + 2] = blended.b;
    }
  }

  /**
   * Generate dark pulse layer (periodic black waves)
   */
  private renderDarkPulseLayer(
    buffer: Buffer,
    ledCount: number,
    time: number,
    speed: number,
    darkPulseIntensity: number,
    opacity: number,
    state: EffectState
  ): void {
    const opacityFactor = this.mapOpacity(opacity);
    if (opacityFactor === 0) return; // Skip layer if opacity is 0

    const speedFactor = this.mapSpeed(speed);
    // Map intensity: 0 -> 0.0 (no pulses), 10 -> 1.0 (full intensity)
    const intensityMultiplier = darkPulseIntensity / 10;
    
    state.darkPulsePhase += 0.003 * speedFactor;

    const pulsePeriod = Math.PI * 2;
    const pulse = Math.sin((time * 0.001 * speedFactor) + state.darkPulsePhase);
    
    // Create sweeping dark wave
    for (let i = 0; i < ledCount; i++) {
      const position = i / Math.max(1, ledCount);
      const wavePhase = (position * Math.PI * 2) + (pulse * Math.PI);
      const darkIntensity = (Math.sin(wavePhase) + 1) / 2;
      
      // Use multiply blend with black (darkens)
      const p = i * 3;
      const baseColor = {
        r: buffer[p],
        g: buffer[p + 1],
        b: buffer[p + 2],
      };

      // Black color for darkening
      const blackColor = { r: 0, g: 0, b: 0 };
      
      // Blend using multiply - intensity controls how much darkening occurs
      const blended = blendColors(
        baseColor,
        blackColor,
        'multiply',
        darkIntensity * 0.5 * intensityMultiplier * opacityFactor
      );
      
      buffer[p] = blended.r;
      buffer[p + 1] = blended.g;
      buffer[p + 2] = blended.b;
    }
  }

  generate(
    params: Map<string, any>,
    ledCount: number,
    time: number,
    width?: number,
    height?: number
  ): Buffer {
    // Wrap time to prevent precision issues and handle time comparisons correctly
    // Use a large period (1 hour in milliseconds) that doesn't affect visuals
    // but prevents floating point precision loss
    const TIME_WRAP_MS = 3600000; // 1 hour in milliseconds
    const timeWrapped = time % TIME_WRAP_MS;
    
    const buffer = Buffer.alloc(ledCount * 3);
    const instanceKey = params.get('instanceKey') || 'default';
    const key = this.keyFor(ledCount, instanceKey);

    // Get or create state
    let state = this.stateByKey.get(key);
    if (!state) {
      state = this.initState(ledCount);
      this.stateByKey.set(key, state);
      // Initialize spawn times with wrapped time
      state.lastCometSpawn = timeWrapped;
      state.lastSparkleSpawn = timeWrapped;
    } else {
      // Normalize stored spawn times when time wraps to keep comparisons valid
      const currentWrapBase = Math.floor(time / TIME_WRAP_MS) * TIME_WRAP_MS;
      const lastWrapBase = Math.floor((state.lastCometSpawn + TIME_WRAP_MS) / TIME_WRAP_MS - 1) * TIME_WRAP_MS;
      if (currentWrapBase > lastWrapBase) {
        // Time wrapped, normalize stored times
        state.lastCometSpawn = state.lastCometSpawn % TIME_WRAP_MS;
        state.lastSparkleSpawn = state.lastSparkleSpawn % TIME_WRAP_MS;
      }
      
      // Wrap accumulated phases periodically to prevent unbounded growth
      // Wrap every 2*PI to maintain precision while keeping animation smooth
      const PHASE_WRAP = Math.PI * 2;
      if (state.plasmaPhase > PHASE_WRAP * 100) {
        state.plasmaPhase = state.plasmaPhase % PHASE_WRAP;
      }
      if (state.rotationPhase > PHASE_WRAP * 100) {
        state.rotationPhase = state.rotationPhase % PHASE_WRAP;
      }
      if (state.darkPulsePhase > PHASE_WRAP * 100) {
        state.darkPulsePhase = state.darkPulsePhase % PHASE_WRAP;
      }
      if (state.hueOffset > 360) {
        state.hueOffset = state.hueOffset % 360;
      }
    }

    // Extract parameters
    const speed = params.get('speed') ?? 5.0; // 0-10 range
    const plasmaBrightness = params.get('plasmaBrightness') ?? 5.0; // 0-10 range
    const cometFrequency = params.get('cometFrequency') ?? 5.0; // 0-10 range
    const cometTailLength = params.get('cometTailLength') ?? 5.0; // 0-10 range
    const sparkleDensity = params.get('sparkleDensity') ?? 5.0; // 0-10 range
    const darkPulseIntensity = params.get('darkPulseIntensity') ?? 5.0; // 0-10 range
    
    // Layer opacity controls (0 = off, 10 = full intensity)
    const plasmaOpacity = params.get('plasmaOpacity') ?? 10.0; // 0-10 range
    const rotationOpacity = params.get('rotationOpacity') ?? 10.0; // 0-10 range
    const sparkleOpacity = params.get('sparkleOpacity') ?? 10.0; // 0-10 range
    const cometOpacity = params.get('cometOpacity') ?? 10.0; // 0-10 range
    const darkPulseOpacity = params.get('darkPulseOpacity') ?? 10.0; // 0-10 range
    
    const colors = getColorArray(params, '#ff00ff');
    const mirror = params.get('mirror') || false;
    const reverse = params.get('reverse') || false;

    // Render layers in order (each blends on top of previous)
    
    // Layer 1: Base plasma wave
    this.renderPlasmaLayer(buffer, ledCount, timeWrapped, speed, plasmaBrightness, plasmaOpacity, state, colors);

    // Layer 2: Rotation overlay
    this.renderRotationLayer(buffer, ledCount, timeWrapped, speed, rotationOpacity, state, colors);

    // Layer 3: Sparkles (twinkling stars)
    this.renderSparkleLayer(buffer, ledCount, timeWrapped, speed, sparkleDensity, sparkleOpacity, state, timeWrapped, TIME_WRAP_MS);

    // Layer 4: Comets with black trails
    this.renderCometLayer(buffer, ledCount, timeWrapped, speed, cometFrequency, cometTailLength, cometOpacity, state, colors, timeWrapped, TIME_WRAP_MS);

    // Layer 5: Dark pulse waves
    this.renderDarkPulseLayer(buffer, ledCount, timeWrapped, speed, darkPulseIntensity, darkPulseOpacity, state);

    // Apply transformations if needed
    if (mirror || reverse) {
      const transformedBuffer = Buffer.alloc(ledCount * 3);
      for (let i = 0; i < ledCount; i++) {
        const effectiveIndex = applyTransformations(i, ledCount, mirror, reverse);
        const p = i * 3;
        const tp = effectiveIndex * 3;
        transformedBuffer[p] = buffer[tp];
        transformedBuffer[p + 1] = buffer[tp + 1];
        transformedBuffer[p + 2] = buffer[tp + 2];
      }
      return transformedBuffer;
    }

    return buffer;
  }
}


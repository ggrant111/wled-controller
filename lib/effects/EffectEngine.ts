/**
 * Effect Engine - Main class for managing LED effects
 */

import { Effect, EffectType, EffectLayer } from '../../types';
import { getParameterMap, blendFrames } from './helpers';
import { SolidEffect } from './solid';
import { CometEffect } from './comet';
import { RainbowEffect } from './rainbow';
import { FireEffect } from './fire';
import { ColorWipeEffect } from './colorWipe';
import { TwinkleEffect } from './twinkle';
import { VUBarsEffect } from './vuBars';
import { BreathingEffect } from './breathing';
import { ChaseEffect } from './chase';
import { WaveEffect } from './wave';
import { PlasmaEffect } from './plasma';
import { MatrixEffect } from './matrix';
import { ConfettiEffect } from './confetti';
import { GlitterEffect } from './glitter';
import { CylonEffect } from './cylon';
import { ColorTwinkleEffect } from './colorTwinkle';
import { PacificaEffect } from './pacifica';
import { SkippingRockEffect } from './skippingRock';
import { ShockwaveDualEffect } from './shockwaveDual';
import { ChromaticVortexEffect } from './chromaticVortex';
import { EtherealMatrixEffect } from './etherealMatrix';
import { FlareBurstWavesEffect } from './flareBurst';
import { PatternGeneratorEffect } from './patternGenerator';

export class EffectEngine {
  private time: number = 0;
  private frameCount: number = 0;
  
  // Effect instances
  private effects: Map<EffectType, any> = new Map();

  private createEffect(type: EffectType): any {
    switch (type) {
      case 'solid': return new SolidEffect();
      case 'comet': return new CometEffect();
      case 'rainbow': return new RainbowEffect();
      case 'fire': return new FireEffect();
      case 'color-wipe': return new ColorWipeEffect();
      case 'twinkle': return new TwinkleEffect();
      case 'vu-bars': return new VUBarsEffect();
      case 'breathing': return new BreathingEffect();
      case 'chase': return new ChaseEffect();
      case 'wave': return new WaveEffect();
      case 'plasma': return new PlasmaEffect();
      case 'matrix': return new MatrixEffect();
      case 'confetti': return new ConfettiEffect();
      case 'glitter': return new GlitterEffect();
      case 'cylon': return new CylonEffect();
      case 'color-twinkle': return new ColorTwinkleEffect();
      case 'pacifica': return new PacificaEffect();
      case 'skipping-rock': return new SkippingRockEffect();
      case 'shockwave-dual': return new ShockwaveDualEffect();
      case 'chromatic-vortex': return new ChromaticVortexEffect();
      case 'ethereal-matrix': return new EtherealMatrixEffect();
      case 'flare-burst': return new FlareBurstWavesEffect();
      case 'pattern-generator': return new PatternGeneratorEffect();
      default:
        return undefined;
    }
  }

  constructor() {
    // Initialize effect instances
    this.effects.set('solid', new SolidEffect());
    this.effects.set('comet', new CometEffect());
    this.effects.set('rainbow', new RainbowEffect());
    this.effects.set('fire', new FireEffect());
    this.effects.set('color-wipe', new ColorWipeEffect());
    this.effects.set('twinkle', new TwinkleEffect());
    this.effects.set('vu-bars', new VUBarsEffect());
    this.effects.set('breathing', new BreathingEffect());
    this.effects.set('chase', new ChaseEffect());
    this.effects.set('wave', new WaveEffect());
    this.effects.set('plasma', new PlasmaEffect());
    this.effects.set('matrix', new MatrixEffect());
    this.effects.set('confetti', new ConfettiEffect());
    this.effects.set('glitter', new GlitterEffect());
    this.effects.set('cylon', new CylonEffect());
    this.effects.set('color-twinkle', new ColorTwinkleEffect());
    this.effects.set('pacifica', new PacificaEffect());
    this.effects.set('skipping-rock', new SkippingRockEffect());
    this.effects.set('shockwave-dual', new ShockwaveDualEffect());
    this.effects.set('chromatic-vortex', new ChromaticVortexEffect());
    this.effects.set('ethereal-matrix', new EtherealMatrixEffect());
    this.effects.set('flare-burst', new FlareBurstWavesEffect());
    this.effects.set('pattern-generator', new PatternGeneratorEffect());
  }

  updateTime(deltaTime: number): void {
    this.time += deltaTime;
    this.frameCount++;
  }

  resetEffect(type: EffectType): void {
    const instance = this.createEffect(type);
    if (instance) {
      this.effects.set(type, instance);
      // Reset time for fresh start
      this.time = 0;
      this.frameCount = 0;
    }
  }

  generateFrame(effect: Effect, ledCount: number, width: number = 1, height: number = 1): Buffer {
    const params = getParameterMap(effect.parameters);
    const effectInstance = this.effects.get(effect.type);
    
    if (!effectInstance) {
      console.warn(`Effect type '${effect.type}' not found. Available types:`, Array.from(this.effects.keys()));
      return Buffer.alloc(ledCount * 3);
    }
    
    try {
      const result = effectInstance.generate(params, ledCount, this.time, width, height);
      // Validate buffer
      if (!Buffer.isBuffer(result) || result.length !== ledCount * 3) {
        console.error(`Effect '${effect.type}' returned invalid buffer. Expected length: ${ledCount * 3}, got: ${result?.length}`);
        return Buffer.alloc(ledCount * 3);
      }
      return result;
    } catch (error) {
      console.error(`Error generating effect '${effect.type}':`, error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return Buffer.alloc(ledCount * 3);
    }
  }

  /**
   * Generate a frame from multiple effect layers
   * Layers are blended from bottom to top (first to last)
   */
  generateFrameFromLayers(layers: EffectLayer[], ledCount: number, width: number = 1, height: number = 1): Buffer {
    if (layers.length === 0) {
      return Buffer.alloc(ledCount * 3); // Black frame if no layers
    }
    
    // Filter to enabled layers only
    const enabledLayers = layers.filter(layer => layer.enabled);
    
    if (enabledLayers.length === 0) {
      return Buffer.alloc(ledCount * 3); // Black frame if all layers disabled
    }
    
    // Generate base frame from first layer (always uses normal blend or replace)
    const baseLayer = enabledLayers[0];
    let baseFrame = this.generateFrame(baseLayer.effect, ledCount, width, height);
    
    // If only one layer, return it (no blending needed)
    if (enabledLayers.length === 1) {
      return baseFrame;
    }
    
    // Generate and blend remaining layers
    const layerFrames = enabledLayers.slice(1).map(layer => {
      const layerFrame = this.generateFrame(layer.effect, ledCount, width, height);
      return {
        frame: layerFrame,
        blendMode: layer.blendMode,
        opacity: layer.opacity
      };
    });
    
    // Blend all layers together
    return blendFrames(baseFrame, layerFrames);
  }

  getTime(): number {
    return this.time;
  }

  getFrameCount(): number {
    return this.frameCount;
  }
}

export default EffectEngine;

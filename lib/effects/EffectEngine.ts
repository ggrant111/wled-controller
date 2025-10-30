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

export class EffectEngine {
  private time: number = 0;
  private frameCount: number = 0;
  
  // Effect instances
  private effects: Map<EffectType, any> = new Map();

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
  }

  updateTime(deltaTime: number): void {
    this.time += deltaTime;
    this.frameCount++;
  }

  generateFrame(effect: Effect, ledCount: number, width: number = 1, height: number = 1): Buffer {
    const params = getParameterMap(effect.parameters);
    const effectInstance = this.effects.get(effect.type);
    
    if (!effectInstance) {
      console.warn(`Effect type '${effect.type}' not found`);
      return Buffer.alloc(ledCount * 3);
    }
    
    try {
      return effectInstance.generate(params, ledCount, this.time, width, height);
    } catch (error) {
      console.error(`Error generating effect '${effect.type}':`, error);
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

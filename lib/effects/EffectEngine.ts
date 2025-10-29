/**
 * Effect Engine - Main class for managing LED effects
 */

import { Effect, EffectType } from '../../types';
import { getParameterMap } from './helpers';
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

  getTime(): number {
    return this.time;
  }

  getFrameCount(): number {
    return this.frameCount;
  }
}

export default EffectEngine;

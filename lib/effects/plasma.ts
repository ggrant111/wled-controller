/**
 * Plasma Effect
 */

import { EffectGenerator } from './helpers';
import { hsvToRgb } from './helpers/colorUtils';
import { applyTransformations } from './helpers/effectUtils';

export class PlasmaEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const intensity = params.get('intensity') || 0.5;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;

    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const effectiveI = applyTransformations(i, ledCount, mirror, reverse);
      
      const pixelIndex = i * 3;
      
      // Create plasma effect using multiple sine waves
      const value = Math.sin(effectiveI * 0.1 + time * speed * 100) * 
                   Math.sin(effectiveI * 0.15 + time * speed * 80) *
                   Math.sin(time * speed * 60);
      
      // Convert to RGB using hue
      const hue = (value + 1) * 180; // 0-360
      const color = hsvToRgb(hue, 1.0, intensity);
      
      buffer[pixelIndex] = Math.floor(color.r * 255);
      buffer[pixelIndex + 1] = Math.floor(color.g * 255);
      buffer[pixelIndex + 2] = Math.floor(color.b * 255);
    }
    
    return buffer;
  }
}

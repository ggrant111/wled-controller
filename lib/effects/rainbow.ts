/**
 * Rainbow Effect
 */

import { EffectGenerator } from './helpers';
import { hsvToRgb } from './helpers/colorUtils';
import { getPalette, getColorMode, paletteManager } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

export class RainbowEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const saturation = params.get('saturation') || 1.0;
    const brightness = params.get('brightness') || 1.0;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const palette = getPalette(params);
    const usePalette = params.get('usePalette') || (palette !== null);

    const buffer = Buffer.alloc(ledCount * 3);
    const hueOffset = (time * speed * 100) % 360;
    
    for (let i = 0; i < ledCount; i++) {
      const effectiveI = applyTransformations(i, ledCount, mirror, reverse);
      
      let color;
      if (usePalette && palette) {
        // Use palette instead of HSV - create smooth transitions
        const palettePosition = (effectiveI / ledCount + hueOffset / 360) % 1;
        color = paletteManager.interpolateColor(palette, palettePosition);
        color = {
          r: Math.floor(color.r * brightness),
          g: Math.floor(color.g * brightness),
          b: Math.floor(color.b * brightness)
        };
      } else {
        // Use traditional HSV rainbow
        const hue = (hueOffset + (effectiveI * 360 / ledCount)) % 360;
        const hsvColor = hsvToRgb(hue, saturation, brightness);
        color = {
          r: Math.floor(hsvColor.r * 255),
          g: Math.floor(hsvColor.g * 255),
          b: Math.floor(hsvColor.b * 255)
        };
      }
      
      const pixelIndex = i * 3;
      buffer[pixelIndex] = color.r;
      buffer[pixelIndex + 1] = color.g;
      buffer[pixelIndex + 2] = color.b;
    }
    
    return buffer;
  }
}

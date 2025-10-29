/**
 * Fire Effect
 */

import { EffectGenerator } from './helpers';
import { getPalette, paletteManager } from './helpers/paletteUtils';

export class FireEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const intensity = params.get('intensity') || 0.8;
    const cooling = params.get('cooling') || 0.1;
    const sparking = params.get('sparking') || 0.3;
    const palette = getPalette(params);
    const usePalette = palette !== null;

    const buffer = Buffer.alloc(ledCount * 3);
    const heat = new Array(ledCount).fill(0);
    
    // Generate random sparks
    for (let i = 0; i < ledCount; i++) {
      if (Math.random() < sparking) {
        heat[i] = Math.random() * 255;
      }
    }
    
    // Cool down and propagate heat
    for (let i = ledCount - 1; i >= 2; i--) {
      heat[i] = (heat[i - 1] + heat[i - 2] + heat[i - 3]) / 3;
      heat[i] = Math.max(0, heat[i] - cooling * 255);
    }
    
    // Convert heat to RGB
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      const temp = heat[i] * intensity;
      
      let color;
      if (usePalette && palette) {
        // Use palette-based fire colors
        const colorPosition = temp / 255;
        color = paletteManager.interpolateColor(palette, colorPosition);
      } else {
        // Use traditional fire colors
        let r, g, b;
        if (temp < 85) {
          r = temp * 3;
          g = 0;
          b = 0;
        } else if (temp < 170) {
          r = 255;
          g = (temp - 85) * 3;
          b = 0;
        } else {
          r = 255;
          g = 255;
          b = (temp - 170) * 3;
        }
        color = { r: Math.min(255, r), g: Math.min(255, g), b: Math.min(255, b) };
      }
      
      buffer[pixelIndex] = color.r;
      buffer[pixelIndex + 1] = color.g;
      buffer[pixelIndex + 2] = color.b;
    }
    
    return buffer;
  }
}

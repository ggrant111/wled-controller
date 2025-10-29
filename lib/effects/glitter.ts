/**
 * Glitter Effect
 */

import { EffectGenerator } from './helpers';
import { parseColor } from './helpers/colorUtils';
import { getColorArray } from './helpers/paletteUtils';

export class GlitterEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const colors = getColorArray(params, '#ffffff');
    const backgroundColor = parseColor(params.get('backgroundColor') || '#000000');
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Start with background color
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      buffer[pixelIndex] = backgroundColor.r;
      buffer[pixelIndex + 1] = backgroundColor.g;
      buffer[pixelIndex + 2] = backgroundColor.b;
    }
    
    // Add random sparkles
    for (let i = 0; i < ledCount; i++) {
      const sparkle = Math.random();
      if (sparkle < density) {
        const pixelIndex = i * 3;
        const intensity = Math.pow(sparkle / density, 0.5);
        const color = colors[i % colors.length];
        buffer[pixelIndex] = Math.floor(color.r * intensity);
        buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
        buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
      }
    }
    
    return buffer;
  }
}

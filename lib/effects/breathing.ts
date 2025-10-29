/**
 * Breathing Effect
 */

import { EffectGenerator } from './helpers';
import { getColorsFromParams, paletteManager } from './helpers/paletteUtils';

export class BreathingEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const minBrightness = params.get('minBrightness') || 0.1;
    const colors = getColorsFromParams(params, '#ff0000');
    const usePalette = params.get('palette') !== null;

    const buffer = Buffer.alloc(ledCount * 3);
    const intensity = (Math.sin(time * speed * 10) + 1) / 2;
    const brightness = minBrightness + (1 - minBrightness) * intensity;
    
    for (let i = 0; i < ledCount; i++) {
      let color;
      if (usePalette) {
        // Use smooth palette interpolation
        const colorPosition = (i / ledCount + time * speed * 0.1) % 1;
        const tempPalette = { id: 'temp', name: 'temp', colors: colors.map(c => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`) };
        color = paletteManager.interpolateColor(tempPalette, colorPosition);
      } else {
        // Use discrete color selection
        const colorIndex = i % colors.length;
        color = colors[colorIndex];
      }
      
      const pixelIndex = i * 3;
      buffer[pixelIndex] = Math.floor(color.r * brightness);
      buffer[pixelIndex + 1] = Math.floor(color.g * brightness);
      buffer[pixelIndex + 2] = Math.floor(color.b * brightness);
    }
    
    return buffer;
  }
}

/**
 * Twinkle Effect
 */

import { EffectGenerator } from './helpers';
import { getColorsFromParams, paletteManager } from './helpers/paletteUtils';

export class TwinkleEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const palette = getColorsFromParams(params, '#ffffff');
    const usePalette = params.get('palette') !== null;

    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      const twinklePhase = (time * speed * 100 + i * 10) % 100;
      
      if (Math.random() < density) {
        const intensity = Math.sin(twinklePhase * Math.PI / 50) * 0.5 + 0.5;
        let color;
        if (usePalette) {
          // Use smooth palette interpolation
          const colorPosition = (i / ledCount + time * speed * 0.1) % 1;
          const tempPalette = { id: 'temp', name: 'temp', colors: palette.map(c => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`) };
          color = paletteManager.interpolateColor(tempPalette, colorPosition);
        } else {
          // Use discrete color selection
          const colorIndex = i % palette.length;
          color = palette[colorIndex];
        }
        buffer[pixelIndex] = Math.floor(color.r * intensity);
        buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
        buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
      }
    }
    
    return buffer;
  }
}

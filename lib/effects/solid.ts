/**
 * Solid Color Effect
 */

import { EffectGenerator } from './helpers';
import { getColorArray } from './helpers/paletteUtils';

export class SolidEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const colors = getColorArray(params, '#ff0000');
    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const colorIndex = Math.floor((i / ledCount) * colors.length) % colors.length;
      const color = colors[colorIndex];
      const pixelIndex = i * 3;
      buffer[pixelIndex] = color.r;
      buffer[pixelIndex + 1] = color.g;
      buffer[pixelIndex + 2] = color.b;
    }
    
    return buffer;
  }
}

/**
 * VU Bars Effect
 */

import { EffectGenerator } from './helpers';
import { getColorArray } from './helpers/paletteUtils';

export class VUBarsEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number, width: number = 1, height: number = 1): Buffer {
    const sensitivity = params.get('sensitivity') || 0.5;
    const colors = getColorArray(params, '#00ff00');
    const bars = params.get('bars') || 8;

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Simulate audio levels (in real implementation, this would come from audio input)
    const audioLevels = new Array(bars).fill(0).map(() => Math.random() * sensitivity);
    
    const ledsPerBar = Math.floor(ledCount / bars);
    
    for (let bar = 0; bar < bars; bar++) {
      const level = audioLevels[bar];
      const barHeight = Math.floor(level * ledsPerBar);
      const color = colors[bar % colors.length];
      
      for (let i = 0; i < barHeight && i < ledsPerBar; i++) {
        const ledIndex = bar * ledsPerBar + i;
        if (ledIndex < ledCount) {
          const pixelIndex = ledIndex * 3;
          buffer[pixelIndex] = color.r;
          buffer[pixelIndex + 1] = color.g;
          buffer[pixelIndex + 2] = color.b;
        }
      }
    }
    
    return buffer;
  }
}

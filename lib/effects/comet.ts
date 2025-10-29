/**
 * Comet Effect
 */

import { EffectGenerator } from './helpers';
import { getColorArray } from './helpers/paletteUtils';

export class CometEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const length = params.get('length') || 20;
    const colors = getColorArray(params, '#ff0000');
    const tail = params.get('tail') || 0.3;
    const mirror = params.get('mirror') || false;
    const reverse = params.get('reverse') || false;

    const buffer = Buffer.alloc(ledCount * 3);
    let position = (time * speed * 100) % (ledCount + length);
    
    // Get color based on position in colors array
    const colorIndex = Math.floor((position / (ledCount + length)) * colors.length) % colors.length;
    const color = colors[colorIndex];
    
    if (reverse) {
      position = ledCount - position;
    }
    
    for (let i = 0; i < ledCount; i++) {
      let distance;
      
      if (mirror && reverse) {
        // Mirror from center out when reverse
        const center = ledCount / 2;
        distance = Math.abs(i - center);
        const cometFromCenter = Math.abs(position - center);
        distance = Math.abs(distance - cometFromCenter);
      } else if (mirror) {
        // Mirror from both ends
        const distanceFromStart = Math.abs(i - position);
        const distanceFromEnd = Math.abs(ledCount - 1 - i - position);
        distance = Math.min(distanceFromStart, distanceFromEnd);
      } else {
        distance = Math.abs(i - position);
      }
      
      let intensity = 0;
      
      if (distance < length) {
        intensity = 1 - (distance / length);
        if (tail > 0) {
          intensity *= Math.pow(intensity, 1 - tail);
        }
      }
      
      const pixelIndex = i * 3;
      buffer[pixelIndex] = Math.floor(color.r * intensity);
      buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
      buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
    }
    
    return buffer;
  }
}

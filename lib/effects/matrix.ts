/**
 * Matrix Effect
 */

import { EffectGenerator, MatrixData } from './helpers';
import { getColorArray } from './helpers/paletteUtils';

export class MatrixEffect implements EffectGenerator {
  private matrixData?: MatrixData;

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const colors = getColorArray(params, '#00ff00');
    
    // Initialize matrix trail data (persistent between frames)
    if (!this.matrixData) {
      this.matrixData = {
        positions: new Array(ledCount).fill(0),
        trails: new Array(ledCount).fill(0).map(() => Array(10).fill(0))
      };
    }
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      
      // Randomly spawn new droplets
      if (Math.random() < density && this.matrixData.positions[i] === 0) {
        this.matrixData.positions[i] = ledCount - i + 10;
      }
      
      // Update position
      if (this.matrixData.positions[i] > 0) {
        this.matrixData.positions[i] -= speed * 10;
        if (this.matrixData.positions[i] <= 0) {
          this.matrixData.positions[i] = 0;
        }
      }
      
      // Calculate intensity (fade trail)
      let intensity = 0;
      const pos = this.matrixData.positions[i];
      if (pos > 0) {
        intensity = Math.min(1, pos / 10);
        intensity = Math.pow(intensity, 3); // Fade curve
      }
      
      const color = colors[i % colors.length];
      buffer[pixelIndex] = Math.floor(color.r * intensity);
      buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
      buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
    }
    
    return buffer;
  }
}

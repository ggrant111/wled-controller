/**
 * Wave Effect
 */

import { EffectGenerator } from './helpers';
import { getColorsFromParams, getColorMode, getPalette, paletteManager } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

export class WaveEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const frequency = params.get('frequency') || 0.05;
    const count = params.get('count') || 1;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const colorMode = getColorMode(params);
    const palette = getPalette(params);
    const usePalette = palette !== null;

    // Get colors from palette or color array
    let colors = getColorsFromParams(params, '#00ff00');

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Get current cycle color if in cycle mode
    let currentCycleColor;
    if (colorMode === 'cycle') {
      if (usePalette && palette) {
        const cyclePosition = (time * speed * 20) % 1;
        currentCycleColor = paletteManager.interpolateColor(palette, cyclePosition);
      } else {
        const cycleIndex = Math.floor((time * speed * 20) / colors.length) % colors.length;
        currentCycleColor = colors[cycleIndex];
      }
    }
    
    for (let i = 0; i < ledCount; i++) {
      const effectiveI = applyTransformations(i, ledCount, mirror, reverse);
      
      const pixelIndex = i * 3;
      // Multiply frequency by count to show multiple waves
      const wave = Math.sin((effectiveI * frequency * count + time * speed * 100) * Math.PI * 2);
      const intensity = (wave + 1) / 2; // Normalize to 0-1
      
      let color;
      if (colorMode === 'cycle') {
        color = currentCycleColor!;
      } else {
        if (usePalette && palette) {
          // Use smooth palette interpolation
          const colorPosition = ((effectiveI * count) / ledCount + time * speed * 0.1) % 1;
          color = paletteManager.interpolateColor(palette, colorPosition);
        } else {
          // Use discrete color selection
          const colorIndex = Math.floor((effectiveI * count) / ledCount) % colors.length;
          color = colors[colorIndex];
        }
      }
      
      buffer[pixelIndex] = Math.floor(color.r * intensity);
      buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
      buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
    }
    
    return buffer;
  }
}

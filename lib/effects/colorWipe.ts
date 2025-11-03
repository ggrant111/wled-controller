/**
 * Color Wipe Effect
 */

import { EffectGenerator } from './helpers';
import { parseColor } from './helpers/colorUtils';
import { getPalette } from './helpers/paletteUtils';

export class ColorWipeEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const colorsParam = params.get('colors');
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const palette = getPalette(params);
    const usePalette = palette !== null;

    // Parse colors - support array or single colors
    let colors: Array<{r: number, g: number, b: number}> = [];
    if (usePalette && palette) {
      // Use palette colors
      colors = palette.colors.map(c => parseColor(c));
    } else if (Array.isArray(colorsParam)) {
      colors = colorsParam.map(c => parseColor(c));
    } else if (colorsParam) {
      colors = [parseColor(colorsParam)];
    } else {
      // Fallback to original two colors
      colors = [
        parseColor(params.get('color') || '#ff0000'),
        parseColor(params.get('color2') || '#0000ff')
      ];
    }
    
    if (colors.length === 0) return Buffer.alloc(ledCount * 3);
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period that doesn't affect visuals but prevents precision loss
    const TIME_WRAP = 3600000; // 1 hour in milliseconds
    const timeWrapped = time % TIME_WRAP;
    
    // Total cycle time: one full wipe per color
    const totalCycleTime = ledCount * colors.length;
    const cycleProgress = (timeWrapped * speed * 100) % totalCycleTime;
    
    // Determine which color we're currently wiping
    const currentColorIndex = Math.floor(cycleProgress / ledCount);
    const wipeProgress = cycleProgress % ledCount;
    const currentColor = colors[currentColorIndex % colors.length];
    const prevColor = colors[(currentColorIndex - 1 + colors.length) % colors.length];
    
    // Fill all LEDs with the previous color
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      buffer[pixelIndex] = prevColor.r;
      buffer[pixelIndex + 1] = prevColor.g;
      buffer[pixelIndex + 2] = prevColor.b;
    }
    
    // Overwrite with current color where it's been wiped
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      let shouldOverwrite = false;
      
      if (mirror && reverse) {
        // Start from center, expand outward
        const center = ledCount / 2;
        const distance = Math.abs(i - center);
        const maxDistance = wipeProgress;
        shouldOverwrite = distance <= maxDistance;
      } else if (mirror && !reverse) {
        // Start from both ends, meet in middle
        const distanceFromStart = i;
        const distanceFromEnd = ledCount - 1 - i;
        const minDistance = Math.min(distanceFromStart, distanceFromEnd);
        shouldOverwrite = minDistance < wipeProgress;
      } else if (!mirror && reverse) {
        // From end to start
        shouldOverwrite = i >= (ledCount - wipeProgress);
      } else {
        // From start to end (normal)
        shouldOverwrite = i <= wipeProgress;
      }
      
      if (shouldOverwrite) {
        buffer[pixelIndex] = currentColor.r;
        buffer[pixelIndex + 1] = currentColor.g;
        buffer[pixelIndex + 2] = currentColor.b;
      }
    }
    
    return buffer;
  }
}

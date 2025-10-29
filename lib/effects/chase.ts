/**
 * Chase Effect
 */

import { EffectGenerator } from './helpers';
import { parseColor, rgbToHex } from './helpers/colorUtils';
import { getColorsFromParams, getColorMode, getPalette, createTempPalette, paletteManager } from './helpers/paletteUtils';

export class ChaseEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const length = params.get('length') || 5;
    const count = params.get('count') || 1;
    const backgroundColor = parseColor(params.get('backgroundColor') || '#000000');
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const colorMode = getColorMode(params);
    const palette = getPalette(params);
    const usePalette = palette !== null;

    // Get colors from palette or color array
    let colors = getColorsFromParams(params, '#ff0000');

    const buffer = Buffer.alloc(ledCount * 3);
    const spacing = ledCount / count;
    
    // Get current cycle color if in cycle mode
    let currentCycleColor;
    if (colorMode === 'cycle') {
      if (usePalette && palette) {
        const cyclePosition = (time * speed * 20) % 1;
        currentCycleColor = paletteManager.interpolateColor(palette, cyclePosition);
      } else {
        const cyclePosition = (time * speed * 20) % colors.length;
        const tempPalette = createTempPalette(colors);
        currentCycleColor = paletteManager.interpolateColor(tempPalette, cyclePosition / colors.length);
      }
    }
    
    // Fill background
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      buffer[pixelIndex] = backgroundColor.r;
      buffer[pixelIndex + 1] = backgroundColor.g;
      buffer[pixelIndex + 2] = backgroundColor.b;
    }
    
    // Draw multiple chases with smooth transitions
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      let combinedBrightness = 0;
      let combinedR = 0;
      let combinedG = 0;
      let combinedB = 0;
      
      // Calculate contribution from each chase
      for (let c = 0; c < count; c++) {
        const segmentStart = (c * ledCount) / count;
        const segmentEnd = ((c + 1) * ledCount) / count;
        
        if (i >= segmentStart && i < segmentEnd) {
          const localPosition = i - segmentStart;
          const normalizedPos = localPosition / (segmentEnd - segmentStart);
          
          let effectiveTime = time * speed * 100;
          if (reverse) {
            effectiveTime = -effectiveTime;
          }
          
          const wavePos = (normalizedPos * (spacing * 2) + effectiveTime) % (spacing * 2);
          const distance = Math.abs(normalizedPos * spacing - wavePos);
          
          if (distance < length) {
            const intensity = 1 - (distance / length);
            combinedBrightness += intensity;
            
            let color;
            if (colorMode === 'cycle') {
              color = currentCycleColor!;
            } else {
              color = colors[c % colors.length];
            }
            
            combinedR += color.r * intensity;
            combinedG += color.g * intensity;
            combinedB += color.b * intensity;
          }
        }
      }
      
      if (combinedBrightness > 0) {
        buffer[pixelIndex] = Math.min(255, Math.floor(combinedR / combinedBrightness));
        buffer[pixelIndex + 1] = Math.min(255, Math.floor(combinedG / combinedBrightness));
        buffer[pixelIndex + 2] = Math.min(255, Math.floor(combinedB / combinedBrightness));
      }
    }
    
    return buffer;
  }
}

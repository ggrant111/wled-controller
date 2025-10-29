/**
 * Cylon Effect
 */

import { EffectGenerator } from './helpers';
import { parseColor, rgbToHex } from './helpers/colorUtils';
import { getColorsFromParams, getColorMode, getPalette, createTempPalette, paletteManager } from './helpers/paletteUtils';

export class CylonEffect implements EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const width = params.get('width') || 3;
    const tail = params.get('tail') || 0.3;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const colorMode = getColorMode(params);
    const palette = getPalette(params);
    const usePalette = palette !== null;

    // Get colors from palette or color array
    let colors = getColorsFromParams(params, '#ff0000');

    // Ensure we have at least one valid color
    if (!colors || colors.length === 0) {
      colors = [parseColor('#ff0000')];
    }

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Calculate the position of the main LED (the "eye")
    const cycleTime = (ledCount * 2) / (speed * 100); // Full cycle time
    const cycleProgress = (time * speed * 100) % (ledCount * 2);
    
    let mainPosition: number;
    let direction: number;
    
    if (cycleProgress < ledCount) {
      // Moving forward
      mainPosition = cycleProgress;
      direction = 1;
    } else {
      // Moving backward
      mainPosition = ledCount - 1 - (cycleProgress - ledCount);
      direction = -1;
    }
    
    // Apply reverse if enabled
    if (reverse) {
      mainPosition = ledCount - 1 - mainPosition;
      direction = -direction;
    }
    
    // Get current color based on color mode
    let currentColor;
    if (colorMode === 'cycle') {
      if (usePalette && palette) {
        const cyclePosition = (time * speed * 20) % 1;
        currentColor = paletteManager.interpolateColor(palette, cyclePosition);
      } else {
        const cyclePosition = (time * speed * 20) % colors.length;
        const tempPalette = createTempPalette(colors);
        currentColor = paletteManager.interpolateColor(tempPalette, cyclePosition / colors.length);
      }
    } else {
      if (usePalette && palette) {
        // Use smooth palette interpolation based on position
        const colorPosition = (mainPosition / ledCount) % 1;
        currentColor = paletteManager.interpolateColor(palette, colorPosition);
      } else {
        // Use color based on position with smooth interpolation
        const colorPosition = (mainPosition / ledCount) % 1;
        const tempPalette = createTempPalette(colors);
        currentColor = paletteManager.interpolateColor(tempPalette, colorPosition);
      }
    }
    
    // Ensure we have a valid color object
    if (!currentColor || typeof currentColor.r !== 'number') {
      currentColor = parseColor('#ff0000');
    }
    
    // Create the Cylon effect with tail
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      let intensity = 0;
      
      // Calculate distance from main position
      let distance = Math.abs(i - mainPosition);
      
      // Apply mirror if enabled
      if (mirror) {
        const mirroredDistance = Math.abs(ledCount - 1 - i - mainPosition);
        distance = Math.min(distance, mirroredDistance);
      }
      
      // Calculate intensity based on distance and width
      if (distance < width) {
        intensity = 1 - (distance / width);
        
        // Apply tail effect
        if (tail > 0) {
          intensity *= Math.pow(intensity, 1 - tail);
        }
      }
      
      // Apply the color
      buffer[pixelIndex] = Math.floor(currentColor.r * intensity);
      buffer[pixelIndex + 1] = Math.floor(currentColor.g * intensity);
      buffer[pixelIndex + 2] = Math.floor(currentColor.b * intensity);
    }
    
    return buffer;
  }
}

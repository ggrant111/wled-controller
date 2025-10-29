/**
 * Color Twinkle Effect
 */

import { EffectGenerator, ColorTwinkleData } from './helpers';
import { parseColor, rgbToHex, attackDecayWave8 } from './helpers/colorUtils';
import { getColorArray, paletteManager } from './helpers/paletteUtils';

export class ColorTwinkleEffect implements EffectGenerator {
  private colorTwinkleData?: ColorTwinkleData;

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.5;
    const density = params.get('density') || 0.5;
    let colors = getColorArray(params, '#ff0000');
    const backgroundColor = parseColor(params.get('backgroundColor') || '#000000');
    const coolLikeIncandescent = params.get('coolLikeIncandescent') || true;
    const paletteMode = params.get('paletteMode') || false;
    const paletteSpeed = params.get('paletteSpeed') || 0.1;

    // Ensure we have at least one valid color
    if (!colors || colors.length === 0) {
      colors = [parseColor('#ff0000')];
    }

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Initialize twinkle data if not exists
    if (!this.colorTwinkleData) {
      this.colorTwinkleData = {
        pixelClocks: new Array(ledCount).fill(0).map(() => ({
          offset: Math.random() * 65536,
          speedMultiplier: 8 + Math.random() * 15, // 8/8 to 23/8
          salt: Math.random() * 256
        })),
        paletteOffset: 0
      };
    }

    // Update palette offset for color cycling
    if (paletteMode) {
      this.colorTwinkleData.paletteOffset += paletteSpeed;
    }

    const currentTime = time * 1000; // Convert to milliseconds
    const backgroundBrightness = (backgroundColor.r + backgroundColor.g + backgroundColor.b) / 3;

    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      const pixelData = this.colorTwinkleData.pixelClocks[i];
      
      // Calculate adjusted clock for this pixel
      const adjustedTime = (currentTime * pixelData.speedMultiplier / 8) + pixelData.offset;
      
      // Calculate twinkle brightness using attack-decay wave
      const fastCycle = (adjustedTime >> (8 - Math.floor(speed * 8))) & 0xFF;
      const slowCycle = ((adjustedTime >> 8) + pixelData.salt) & 0xFFFF;
      const slowCycle8 = ((slowCycle & 0xFF) + (slowCycle >> 8)) & 0xFF;
      
      let brightness = 0;
      
      // Check if this pixel should twinkle based on density
      const densityCheck = ((slowCycle8 & 0x0E) / 2);
      if (densityCheck < density * 8) {
        brightness = attackDecayWave8(fastCycle);
      }
      
      let color = backgroundColor;
      
      if (brightness > 0) {
        // Select color based on palette mode
        let selectedColor;
        if (paletteMode) {
          const hue = (slowCycle8 - pixelData.salt + this.colorTwinkleData.paletteOffset) & 0xFF;
          const colorPosition = (hue / 256) % 1;
          const tempPalette = { id: 'temp', name: 'temp', colors: colors.map(c => rgbToHex(c)) };
          selectedColor = paletteManager.interpolateColor(tempPalette, colorPosition);
        } else {
          const colorPosition = (slowCycle8 / 256) % 1;
          const tempPalette = { id: 'temp', name: 'temp', colors: colors.map(c => rgbToHex(c)) };
          selectedColor = paletteManager.interpolateColor(tempPalette, colorPosition);
        }
        
        // Apply brightness
        color = {
          r: Math.floor(selectedColor.r * brightness / 255),
          g: Math.floor(selectedColor.g * brightness / 255),
          b: Math.floor(selectedColor.b * brightness / 255)
        };
        
        // Apply incandescent cooling effect
        if (coolLikeIncandescent && fastCycle > 128) {
          const cooling = Math.floor((fastCycle - 128) / 16);
          color.g = Math.max(0, color.g - cooling);
          color.b = Math.max(0, color.b - cooling * 2);
        }
        
        // Blend with background if not significantly brighter
        const colorBrightness = (color.r + color.g + color.b) / 3;
        const deltaBrightness = colorBrightness - backgroundBrightness;
        
        if (deltaBrightness < 32 && backgroundBrightness > 0) {
          // Blend colors
          const blendFactor = Math.max(0, deltaBrightness) / 32;
          color = {
            r: Math.floor(backgroundColor.r + (color.r - backgroundColor.r) * blendFactor),
            g: Math.floor(backgroundColor.g + (color.g - backgroundColor.g) * blendFactor),
            b: Math.floor(backgroundColor.b + (color.b - backgroundColor.b) * blendFactor)
          };
        }
      }
      
      buffer[pixelIndex] = Math.min(255, Math.max(0, color.r));
      buffer[pixelIndex + 1] = Math.min(255, Math.max(0, color.g));
      buffer[pixelIndex + 2] = Math.min(255, Math.max(0, color.b));
    }
    
    return buffer;
  }
}

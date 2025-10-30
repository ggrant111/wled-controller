/**
 * Pacifica Effect - Gentle, blue-green ocean wave animation
 * Based on FastLED Pacifica example by Mark Kriegsman and Mary Corey March
 */

import { EffectGenerator } from './helpers';
import { RGBColor } from './helpers/colorUtils';

export class PacificaEffect implements EffectGenerator {
  // Pacifica color palettes inspired by waters off southern California coast
  private readonly pacificaPalette1: RGBColor[] = [
    { r: 0, g: 5, b: 7 },   // 0x000507
    { r: 0, g: 4, b: 9 },   // 0x000409
    { r: 0, g: 3, b: 11 },  // 0x00030B
    { r: 0, g: 3, b: 13 },  // 0x00030D
    { r: 0, g: 2, b: 16 },  // 0x000210
    { r: 0, g: 2, b: 18 },  // 0x000212
    { r: 0, g: 1, b: 20 },  // 0x000114
    { r: 0, g: 1, b: 23 },  // 0x000117
    { r: 0, g: 0, b: 25 },  // 0x000019
    { r: 0, g: 0, b: 28 },  // 0x00001C
    { r: 0, g: 0, b: 38 },  // 0x000026
    { r: 0, g: 0, b: 49 },  // 0x000031
    { r: 0, g: 0, b: 59 },  // 0x00003B
    { r: 0, g: 0, b: 70 },  // 0x000046
    { r: 20, g: 85, b: 75 }, // 0x14554B
    { r: 40, g: 170, b: 80 } // 0x28AA50
  ];

  private readonly pacificaPalette2: RGBColor[] = [
    { r: 0, g: 5, b: 7 },   // 0x000507
    { r: 0, g: 4, b: 9 },   // 0x000409
    { r: 0, g: 3, b: 11 },  // 0x00030B
    { r: 0, g: 3, b: 13 },  // 0x00030D
    { r: 0, g: 2, b: 16 },  // 0x000210
    { r: 0, g: 2, b: 18 },  // 0x000212
    { r: 0, g: 1, b: 20 },  // 0x000114
    { r: 0, g: 1, b: 23 },  // 0x000117
    { r: 0, g: 0, b: 25 },  // 0x000019
    { r: 0, g: 0, b: 28 },  // 0x00001C
    { r: 0, g: 0, b: 38 },  // 0x000026
    { r: 0, g: 0, b: 49 },  // 0x000031
    { r: 0, g: 0, b: 59 },  // 0x00003B
    { r: 0, g: 0, b: 70 },  // 0x000046
    { r: 12, g: 95, b: 82 }, // 0x0C5F52
    { r: 25, g: 190, b: 95 } // 0x19BE5F
  ];

  private readonly pacificaPalette3: RGBColor[] = [
    { r: 0, g: 2, b: 8 },   // 0x000208
    { r: 0, g: 3, b: 14 },  // 0x00030E
    { r: 0, g: 5, b: 20 },  // 0x000514
    { r: 0, g: 6, b: 26 },  // 0x00061A
    { r: 0, g: 8, b: 32 },  // 0x000820
    { r: 0, g: 9, b: 39 },  // 0x000927
    { r: 0, g: 11, b: 45 }, // 0x000B2D
    { r: 0, g: 12, b: 51 }, // 0x000C33
    { r: 0, g: 14, b: 57 }, // 0x000E39
    { r: 0, g: 16, b: 64 }, // 0x001040
    { r: 0, g: 20, b: 80 }, // 0x001450
    { r: 0, g: 24, b: 96 }, // 0x001860
    { r: 0, g: 28, b: 112 }, // 0x001C70
    { r: 0, g: 32, b: 128 }, // 0x002080
    { r: 16, g: 64, b: 191 }, // 0x1040BF
    { r: 32, g: 96, b: 255 }  // 0x2060FF
  ];

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 1.0;
    const intensity = params.get('intensity') || 1.0;
    
    // Scale speed down significantly for gentle wave motion
    // Speed of 1.0 should be very slow, 0.1 should be extremely slow
    const scaledTime = time * speed * 0.1;
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Clear buffer with dim background blue-green
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      buffer[pixelIndex] = Math.floor(2 * intensity);     // R
      buffer[pixelIndex + 1] = Math.floor(6 * intensity); // G
      buffer[pixelIndex + 2] = Math.floor(10 * intensity); // B
    }

    // Render four wave layers with different speeds and scales
    this.renderWaveLayer(buffer, this.pacificaPalette1, scaledTime, 0, 11, 14, 70, 130, 0, ledCount, intensity);
    this.renderWaveLayer(buffer, this.pacificaPalette2, scaledTime, 1, 6, 9, 40, 80, 1, ledCount, intensity);
    this.renderWaveLayer(buffer, this.pacificaPalette3, scaledTime, 2, 6, 6, 10, 38, 2, ledCount, intensity);
    this.renderWaveLayer(buffer, this.pacificaPalette3, scaledTime, 3, 5, 5, 10, 28, 3, ledCount, intensity);

    // Add whitecaps where waves line up brightly
    this.addWhitecaps(buffer, scaledTime, ledCount, intensity);

    // Deepen blues and greens
    this.deepenColors(buffer, ledCount, intensity);

    return buffer;
  }

  private renderWaveLayer(
    buffer: Buffer,
    palette: RGBColor[],
    time: number,
    layerIndex: number,
    waveScaleMin: number,
    waveScaleMax: number,
    brightnessMin: number,
    brightnessMax: number,
    offsetIndex: number,
    ledCount: number,
    intensity: number
  ): void {
    // Calculate wave parameters with time-varying speeds
    const speedFactor1 = this.beatsin16(3, 179, 269, time);
    const speedFactor2 = this.beatsin16(4, 179, 269, time);
    const waveScale = this.beatsin16(3 + layerIndex, waveScaleMin * 256, waveScaleMax * 256, time);
    const brightness = this.beatsin8(10 + layerIndex * 2, brightnessMin, brightnessMax, time);
    const offset = this.beat16(301 + offsetIndex * 100, time);

    let colorIndex = time * (1011 + layerIndex * 200) * speedFactor1 / 256;
    let waveAngle = offset;

    for (let i = 0; i < ledCount; i++) {
      // Use smaller angle increments for smoother wave transitions
      waveAngle += 150;
      const s16 = Math.sin(waveAngle * Math.PI / 32768) + 1;
      const cs = (s16 * waveScale / 2) + waveScale / 2 + 20;
      colorIndex += cs;
      
      const sindex16 = Math.sin(colorIndex * Math.PI / 32768) + 1;
      const sindex8 = sindex16 * 240;
      
      // Create smooth color interpolation instead of discrete palette indices
      const paletteIndex = sindex8 % palette.length;
      const paletteIndexInt = Math.floor(paletteIndex);
      const paletteIndexFrac = paletteIndex - paletteIndexInt;
      
      // Interpolate between two palette colors for smooth transitions
      const color1 = palette[paletteIndexInt];
      const color2 = palette[(paletteIndexInt + 1) % palette.length];
      
      const color = {
        r: color1.r + (color2.r - color1.r) * paletteIndexFrac,
        g: color1.g + (color2.g - color1.g) * paletteIndexFrac,
        b: color1.b + (color2.b - color1.b) * paletteIndexFrac
      };
      
      const pixelIndex = i * 3;
      
      // Add color to existing buffer with smoother blending
      buffer[pixelIndex] = Math.min(255, buffer[pixelIndex] + Math.floor(color.r * brightness * intensity / 255));
      buffer[pixelIndex + 1] = Math.min(255, buffer[pixelIndex + 1] + Math.floor(color.g * brightness * intensity / 255));
      buffer[pixelIndex + 2] = Math.min(255, buffer[pixelIndex + 2] + Math.floor(color.b * brightness * intensity / 255));
    }
  }

  private addWhitecaps(buffer: Buffer, time: number, ledCount: number, intensity: number): void {
    const baseThreshold = this.beatsin8(9, 55, 65, time);
    let wave = this.beat8(7, time);
    
    for (let i = 0; i < ledCount; i++) {
      const threshold = Math.sin(wave * Math.PI / 128) * 20 + baseThreshold;
      const pixelIndex = i * 3;
      
      // Calculate average light level
      const avgLight = (buffer[pixelIndex] + buffer[pixelIndex + 1] + buffer[pixelIndex + 2]) / 3;
      
      if (avgLight > threshold) {
        const overage = avgLight - threshold;
        const overage2 = Math.min(255, overage + overage);
        const overage4 = Math.min(255, overage2 + overage2);
        
        // Apply smoother whitecap blending
        buffer[pixelIndex] = Math.min(255, buffer[pixelIndex] + Math.floor(overage * intensity * 0.8));
        buffer[pixelIndex + 1] = Math.min(255, buffer[pixelIndex + 1] + Math.floor(overage2 * intensity * 0.9));
        buffer[pixelIndex + 2] = Math.min(255, buffer[pixelIndex + 2] + Math.floor(overage4 * intensity));
      }
      
      // Use smaller wave increment for smoother whitecap transitions
      wave += 5;
    }
  }

  private deepenColors(buffer: Buffer, ledCount: number, intensity: number): void {
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      
      // Deepen blues and greens
      buffer[pixelIndex + 2] = Math.floor(buffer[pixelIndex + 2] * 145 / 255 * intensity); // Blue
      buffer[pixelIndex + 1] = Math.floor(buffer[pixelIndex + 1] * 200 / 255 * intensity); // Green
      
      // Add base color
      buffer[pixelIndex] = Math.min(255, buffer[pixelIndex] + Math.floor(2 * intensity));
      buffer[pixelIndex + 1] = Math.min(255, buffer[pixelIndex + 1] + Math.floor(5 * intensity));
      buffer[pixelIndex + 2] = Math.min(255, buffer[pixelIndex + 2] + Math.floor(7 * intensity));
    }
  }

  // Helper functions to simulate FastLED's beat functions
  private beatsin8(beat: number, low: number, high: number, time: number): number {
    const beatValue = Math.sin(time * beat * Math.PI / 1000) * 0.5 + 0.5;
    return low + beatValue * (high - low);
  }

  private beatsin16(beat: number, low: number, high: number, time: number): number {
    const beatValue = Math.sin(time * beat * Math.PI / 1000) * 0.5 + 0.5;
    return low + beatValue * (high - low);
  }

  private beat8(beat: number, time: number): number {
    return Math.sin(time * beat * Math.PI / 1000) * 127 + 128;
  }

  private beat16(beat: number, time: number): number {
    return Math.sin(time * beat * Math.PI / 1000) * 32767 + 32768;
  }
}

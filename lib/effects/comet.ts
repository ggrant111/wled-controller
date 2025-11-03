/**
 * Comet Effect
 * 
 * Improved with standardized speed (0-10) and smoother math functions
 */

import { EffectGenerator } from './helpers';
import { getColorArray } from './helpers/paletteUtils';
import { applyTransformations } from './helpers/effectUtils';

// No state needed - use direct time calculation like colorWipe

export class CometEffect implements EffectGenerator {

  /**
   * Map speed parameter (0-10) to actual motion speed
   * 0 = stopped, 10 = fast
   */
  private mapSpeed(speed: number): number {
    // Map 0-10 to 0.0-1.0 for speed multiplier
    const clamped = Math.max(0, Math.min(10, speed));
    if (clamped === 0) return 0;
    // Linear mapping: 0 -> 0, 10 -> 1.0
    return clamped / 10;
  }

  /**
   * Smooth intensity falloff using easing
   */
  private easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  /**
   * Smooth intensity falloff for tail
   */
  private tailEasing(distance: number, length: number, tailStrength: number): number {
    if (distance >= length) return 0;
    
    const normalized = distance / length;
    // Use smooth easing instead of raw power function
    const baseIntensity = 1 - normalized;
    const easedIntensity = this.easeOutQuad(baseIntensity);
    
    // Apply tail strength (0 = linear, 1 = very sharp)
    if (tailStrength > 0) {
      return Math.pow(easedIntensity, 1 + tailStrength * 2);
    }
    return easedIntensity;
  }

  /**
   * Clamp RGB value to 0-255
   */
  private clampRGB(value: number): number {
    return Math.max(0, Math.min(255, Math.floor(value)));
  }

  generate(
    params: Map<string, any>,
    ledCount: number,
    time: number,
    width?: number,
    height?: number
  ): Buffer {
    // Standardized speed: 0-10 range (0 = stopped, 10 = fast)
    const speed = params.get('speed') ?? 5.0;
    const length = Math.max(1, Math.min(100, params.get('length') || 20));
    const colors = getColorArray(params, '#ff0000');
    const tail = Math.max(0, Math.min(1, params.get('tail') || 0.3));
    const mirror = params.get('mirror') || false;
    const reverse = params.get('reverse') || false;
    const instanceKey = params.get('instanceKey') || 'default';

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Pre-calculate constants
    const travelDistance = ledCount + length;
    
    // Wrap time to prevent precision issues from very large time values
    // Use a large period that doesn't affect visuals but prevents precision loss
    const TIME_WRAP = 3600000; // 1 hour in milliseconds
    const timeWrapped = time % TIME_WRAP;
    
    // Calculate position directly from time (like colorWipe effect)
    // At speed=10: fast motion, at speed=1: slow motion, at speed=0: stopped
    let position: number;
    if (speed === 0) {
      position = 0; // Stopped
    } else {
      // Scale speed: 0-10 range to motion rate
      // At speed=1: slow, at speed=10: fast
      // Similar to colorWipe: (time * speed * 100)
      const motionRate = (speed / 10) * 100; // Scale speed to motion multiplier
      position = (timeWrapped * motionRate) % travelDistance;
    }
    
    // Get color based on position in colors array
    const positionRatio = position / travelDistance;
    const colorIndex = Math.floor(positionRatio * colors.length) % colors.length;
    const color = colors[colorIndex];

    // Calculate effective position (handle reverse before mirror calculations)
    let effectivePosition = position;
    if (reverse) {
      effectivePosition = travelDistance - position;
    }

    // Pre-calculate constants outside loop
    const maxLength = Math.max(1, length);
    
    for (let i = 0; i < ledCount; i++) {
      let distance: number;
      
      if (mirror && reverse) {
        // Mirror from center out when reverse
        const center = ledCount / 2;
        const distanceFromCenter = Math.abs(i - center);
        const cometFromCenter = Math.abs(effectivePosition - center);
        distance = Math.abs(distanceFromCenter - cometFromCenter);
      } else if (mirror) {
        // Mirror from both ends
        const distanceFromStart = Math.abs(i - effectivePosition);
        const distanceFromEnd = Math.abs((ledCount - 1 - i) - effectivePosition);
        distance = Math.min(distanceFromStart, distanceFromEnd);
      } else {
        distance = Math.abs(i - effectivePosition);
      }
      
      // Use smooth tail easing
      const intensity = this.tailEasing(distance, maxLength, tail);
      
      // Apply intensity with clamping
      const pixelIndex = i * 3;
      buffer[pixelIndex] = this.clampRGB(color.r * intensity);
      buffer[pixelIndex + 1] = this.clampRGB(color.g * intensity);
      buffer[pixelIndex + 2] = this.clampRGB(color.b * intensity);
    }
    
    return buffer;
  }
}

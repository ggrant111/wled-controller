/**
 * Confetti Effect
 */

import { EffectGenerator, ConfettiData } from './helpers';

export class ConfettiEffect implements EffectGenerator {
  private confettiData?: ConfettiData[];

  generate(params: Map<string, any>, ledCount: number, time: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    
    // Initialize confetti particles
    if (!this.confettiData) {
      this.confettiData = Array(Math.floor(ledCount * density)).fill(0).map(() => ({
        position: Math.random() * ledCount,
        color: {
          r: Math.random(),
          g: Math.random(),
          b: Math.random()
        },
        velocity: Math.random() * speed * 5
      }));
    }
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Move particles and draw
    for (const particle of this.confettiData) {
      particle.position += particle.velocity;
      
      if (particle.position < 0) {
        particle.position = ledCount;
        particle.color = { r: Math.random(), g: Math.random(), b: Math.random() };
      }
      
      const pos = Math.floor(particle.position);
      if (pos >= 0 && pos < ledCount) {
        const pixelIndex = pos * 3;
        buffer[pixelIndex] = Math.floor(particle.color.r * 255);
        buffer[pixelIndex + 1] = Math.floor(particle.color.g * 255);
        buffer[pixelIndex + 2] = Math.floor(particle.color.b * 255);
      }
    }
    
    return buffer;
  }
}

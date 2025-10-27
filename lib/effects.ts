import { Effect, EffectType, EffectParameter } from '../types';

export class EffectEngine {
  private time: number = 0;
  private frameCount: number = 0;

  updateTime(deltaTime: number): void {
    this.time += deltaTime;
    this.frameCount++;
  }

  generateFrame(effect: Effect, ledCount: number, width: number = 1, height: number = 1): Buffer {
    const params = this.getParameterMap(effect.parameters);
    
    switch (effect.type) {
      case 'comet':
        return this.generateComet(params, ledCount);
      case 'color-wipe':
        return this.generateColorWipe(params, ledCount);
      case 'fire':
        return this.generateFire(params, ledCount);
      case 'rainbow':
        return this.generateRainbow(params, ledCount);
      case 'twinkle':
        return this.generateTwinkle(params, ledCount);
      case 'vu-bars':
        return this.generateVUBars(params, ledCount, width, height);
      case 'solid':
        return this.generateSolid(params, ledCount);
      case 'breathing':
        return this.generateBreathing(params, ledCount);
      case 'chase':
        return this.generateChase(params, ledCount);
      case 'wave':
        return this.generateWave(params, ledCount);
      case 'plasma':
        return this.generatePlasma(params, ledCount);
      case 'matrix':
        return this.generateMatrix(params, ledCount);
      case 'confetti':
        return this.generateConfetti(params, ledCount);
      case 'glitter':
        return this.generateGlitter(params, ledCount);
      default:
        return Buffer.alloc(ledCount * 3);
    }
  }

  private getParameterMap(parameters: EffectParameter[]): Map<string, any> {
    const paramMap = new Map();
    parameters.forEach(param => {
      paramMap.set(param.name, param.value);
    });
    return paramMap;
  }

  private generateComet(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const length = params.get('length') || 20;
    const colors = this.getColorArray(params, '#ff0000');
    const tail = params.get('tail') || 0.3;
    const mirror = params.get('mirror') || false;
    const reverse = params.get('reverse') || false;

    const buffer = Buffer.alloc(ledCount * 3);
    let position = (this.time * speed * 100) % (ledCount + length);
    
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
  
  private getColorArray(params: Map<string, any>, fallback: string): Array<{r: number, g: number, b: number}> {
    const colors = params.get('colors');
    if (Array.isArray(colors) && colors.length > 0) {
      return colors.map(c => this.parseColor(c));
    }
    return [this.parseColor(fallback)];
  }
  
  private getColorMode(params: Map<string, any>): 'palette' | 'cycle' {
    return params.get('colorMode') || 'palette';
  }

  private generateColorWipe(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const colorsParam = params.get('colors');
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;

    // Parse colors - support array or single colors
    let colors: Array<{r: number, g: number, b: number}> = [];
    if (Array.isArray(colorsParam)) {
      colors = colorsParam.map(c => this.parseColor(c));
    } else if (colorsParam) {
      colors = [this.parseColor(colorsParam)];
    } else {
      // Fallback to original two colors
      colors = [
        this.parseColor(params.get('color') || '#ff0000'),
        this.parseColor(params.get('color2') || '#0000ff')
      ];
    }
    
    if (colors.length === 0) return Buffer.alloc(ledCount * 3);
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Total cycle time: one full wipe per color
    const totalCycleTime = ledCount * colors.length;
    const cycleProgress = (this.time * speed * 100) % totalCycleTime;
    
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

  private generateFire(params: Map<string, any>, ledCount: number): Buffer {
    const intensity = params.get('intensity') || 0.8;
    const cooling = params.get('cooling') || 0.1;
    const sparking = params.get('sparking') || 0.3;

    const buffer = Buffer.alloc(ledCount * 3);
    const heat = new Array(ledCount).fill(0);
    
    // Generate random sparks
    for (let i = 0; i < ledCount; i++) {
      if (Math.random() < sparking) {
        heat[i] = Math.random() * 255;
      }
    }
    
    // Cool down and propagate heat
    for (let i = ledCount - 1; i >= 2; i--) {
      heat[i] = (heat[i - 1] + heat[i - 2] + heat[i - 3]) / 3;
      heat[i] = Math.max(0, heat[i] - cooling * 255);
    }
    
    // Convert heat to RGB
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      const temp = heat[i] * intensity;
      
      // Heat to color mapping
      let r, g, b;
      if (temp < 85) {
        r = temp * 3;
        g = 0;
        b = 0;
      } else if (temp < 170) {
        r = 255;
        g = (temp - 85) * 3;
        b = 0;
      } else {
        r = 255;
        g = 255;
        b = (temp - 170) * 3;
      }
      
      buffer[pixelIndex] = Math.min(255, Math.floor(r));
      buffer[pixelIndex + 1] = Math.min(255, Math.floor(g));
      buffer[pixelIndex + 2] = Math.min(255, Math.floor(b));
    }
    
    return buffer;
  }

  private generateRainbow(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const saturation = params.get('saturation') || 1.0;
    const brightness = params.get('brightness') || 1.0;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;

    const buffer = Buffer.alloc(ledCount * 3);
    const hueOffset = (this.time * speed * 100) % 360;
    
    for (let i = 0; i < ledCount; i++) {
      let effectiveI = i;
      
      // Apply mirror
      if (mirror) {
        effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
      }
      
      // Apply reverse
      if (reverse) {
        effectiveI = ledCount - 1 - effectiveI;
      }
      
      const hue = (hueOffset + (effectiveI * 360 / ledCount)) % 360;
      const color = this.hsvToRgb(hue, saturation, brightness);
      
      const pixelIndex = i * 3;
      buffer[pixelIndex] = color.r;
      buffer[pixelIndex + 1] = color.g;
      buffer[pixelIndex + 2] = color.b;
    }
    
    return buffer;
  }

  private generateTwinkle(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const colors = this.getColorArray(params, '#ffffff');

    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      const twinklePhase = (this.time * speed * 100 + i * 10) % 100;
      
      if (Math.random() < density) {
        const intensity = Math.sin(twinklePhase * Math.PI / 50) * 0.5 + 0.5;
        const colorIndex = i % colors.length;
        const color = colors[colorIndex];
        buffer[pixelIndex] = Math.floor(color.r * intensity);
        buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
        buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
      }
    }
    
    return buffer;
  }

  private generateVUBars(params: Map<string, any>, ledCount: number, width: number, height: number): Buffer {
    const sensitivity = params.get('sensitivity') || 0.5;
    const colors = this.getColorArray(params, '#00ff00');
    const bars = params.get('bars') || 8;

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Simulate audio levels (in real implementation, this would come from audio input)
    const audioLevels = new Array(bars).fill(0).map(() => Math.random() * sensitivity);
    
    const ledsPerBar = Math.floor(ledCount / bars);
    
    for (let bar = 0; bar < bars; bar++) {
      const level = audioLevels[bar];
      const barHeight = Math.floor(level * ledsPerBar);
      const color = colors[bar % colors.length];
      
      for (let i = 0; i < barHeight && i < ledsPerBar; i++) {
        const ledIndex = bar * ledsPerBar + i;
        if (ledIndex < ledCount) {
          const pixelIndex = ledIndex * 3;
          buffer[pixelIndex] = color.r;
          buffer[pixelIndex + 1] = color.g;
          buffer[pixelIndex + 2] = color.b;
        }
      }
    }
    
    return buffer;
  }

  private generateSolid(params: Map<string, any>, ledCount: number): Buffer {
    const colors = this.getColorArray(params, '#ff0000');
    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      const colorIndex = Math.floor((i / ledCount) * colors.length) % colors.length;
      const color = colors[colorIndex];
      const pixelIndex = i * 3;
      buffer[pixelIndex] = color.r;
      buffer[pixelIndex + 1] = color.g;
      buffer[pixelIndex + 2] = color.b;
    }
    
    return buffer;
  }

  private generateBreathing(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const colors = this.getColorArray(params, '#ff0000');
    const minBrightness = params.get('minBrightness') || 0.1;

    const buffer = Buffer.alloc(ledCount * 3);
    const intensity = (Math.sin(this.time * speed * 10) + 1) / 2;
    const brightness = minBrightness + (1 - minBrightness) * intensity;
    
    for (let i = 0; i < ledCount; i++) {
      const colorIndex = i % colors.length;
      const color = colors[colorIndex];
      const pixelIndex = i * 3;
      buffer[pixelIndex] = Math.floor(color.r * brightness);
      buffer[pixelIndex + 1] = Math.floor(color.g * brightness);
      buffer[pixelIndex + 2] = Math.floor(color.b * brightness);
    }
    
    return buffer;
  }

  private generateChase(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const length = params.get('length') || 5;
    const count = params.get('count') || 1;
    const colors = this.getColorArray(params, '#ff0000');
    const backgroundColor = this.parseColor(params.get('backgroundColor') || '#000000');
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const colorMode = this.getColorMode(params);

    const buffer = Buffer.alloc(ledCount * 3);
    const spacing = ledCount / count;
    
    // Get current cycle color if in cycle mode
    let currentCycleColor;
    if (colorMode === 'cycle') {
      const cycleIndex = Math.floor((this.time * speed * 100) / 500) % colors.length;
      currentCycleColor = colors[cycleIndex];
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
          
          let effectiveTime = this.time * speed * 100;
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

  private parseColor(colorStr: string): { r: number; g: number; b: number } {
    const hex = colorStr.replace('#', '');
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16)
    };
  }

  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    
    let r, g, b;
    if (h < 60) {
      r = c; g = x; b = 0;
    } else if (h < 120) {
      r = x; g = c; b = 0;
    } else if (h < 180) {
      r = 0; g = c; b = x;
    } else if (h < 240) {
      r = 0; g = x; b = c;
    } else if (h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }
    
    return {
      r: Math.floor((r + m) * 255),
      g: Math.floor((g + m) * 255),
      b: Math.floor((b + m) * 255)
    };
  }

  private generateWave(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const frequency = params.get('frequency') || 0.05;
    const count = params.get('count') || 1;
    const colors = this.getColorArray(params, '#00ff00');
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;
    const colorMode = this.getColorMode(params);

    const buffer = Buffer.alloc(ledCount * 3);
    
    // Get current cycle color if in cycle mode
    let currentCycleColor;
    if (colorMode === 'cycle') {
      const cycleIndex = Math.floor((this.time * speed * 100) / 500) % colors.length;
      currentCycleColor = colors[cycleIndex];
    }
    
    for (let i = 0; i < ledCount; i++) {
      let effectiveI = i;
      
      // Apply mirror
      if (mirror) {
        effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
      }
      
      // Apply reverse
      if (reverse) {
        effectiveI = ledCount - 1 - effectiveI;
      }
      
      const pixelIndex = i * 3;
      // Multiply frequency by count to show multiple waves
      const wave = Math.sin((effectiveI * frequency * count + this.time * speed * 100) * Math.PI * 2);
      const intensity = (wave + 1) / 2; // Normalize to 0-1
      
      let color;
      if (colorMode === 'cycle') {
        color = currentCycleColor!;
      } else {
        const colorIndex = Math.floor((effectiveI * count) / ledCount) % colors.length;
        color = colors[colorIndex];
      }
      
      buffer[pixelIndex] = Math.floor(color.r * intensity);
      buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
      buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
    }
    
    return buffer;
  }

  private generatePlasma(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const intensity = params.get('intensity') || 0.5;
    const reverse = params.get('reverse') || false;
    const mirror = params.get('mirror') || false;

    const buffer = Buffer.alloc(ledCount * 3);
    
    for (let i = 0; i < ledCount; i++) {
      let effectiveI = i;
      
      // Apply mirror
      if (mirror) {
        effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
      }
      
      // Apply reverse
      if (reverse) {
        effectiveI = ledCount - 1 - effectiveI;
      }
      
      const pixelIndex = i * 3;
      
      // Create plasma effect using multiple sine waves
      const value = Math.sin(effectiveI * 0.1 + this.time * speed * 100) * 
                   Math.sin(effectiveI * 0.15 + this.time * speed * 80) *
                   Math.sin(this.time * speed * 60);
      
      // Convert to RGB using hue
      const hue = (value + 1) * 180; // 0-360
      const color = this.hsvToRgb(hue, 1.0, intensity);
      
      buffer[pixelIndex] = Math.floor(color.r * 255);
      buffer[pixelIndex + 1] = Math.floor(color.g * 255);
      buffer[pixelIndex + 2] = Math.floor(color.b * 255);
    }
    
    return buffer;
  }

  private generateMatrix(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const colors = this.getColorArray(params, '#00ff00');
    
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

  private generateConfetti(params: Map<string, any>, ledCount: number): Buffer {
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

  private generateGlitter(params: Map<string, any>, ledCount: number): Buffer {
    const speed = params.get('speed') || 0.1;
    const density = params.get('density') || 0.1;
    const colors = this.getColorArray(params, '#ffffff');
    const backgroundColor = this.parseColor(params.get('backgroundColor') || '#000000');
    
    const buffer = Buffer.alloc(ledCount * 3);
    
    // Start with background color
    for (let i = 0; i < ledCount; i++) {
      const pixelIndex = i * 3;
      buffer[pixelIndex] = backgroundColor.r;
      buffer[pixelIndex + 1] = backgroundColor.g;
      buffer[pixelIndex + 2] = backgroundColor.b;
    }
    
    // Add random sparkles
    for (let i = 0; i < ledCount; i++) {
      const sparkle = Math.random();
      if (sparkle < density) {
        const pixelIndex = i * 3;
        const intensity = Math.pow(sparkle / density, 0.5);
        const color = colors[i % colors.length];
        buffer[pixelIndex] = Math.floor(color.r * intensity);
        buffer[pixelIndex + 1] = Math.floor(color.g * intensity);
        buffer[pixelIndex + 2] = Math.floor(color.b * intensity);
      }
    }
    
    return buffer;
  }

  private matrixData: any;
  private confettiData: any;
}

export const defaultEffects: Effect[] = [
  {
    id: 'comet',
    name: 'Comet',
    type: 'comet',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'length', type: 'range', value: 20, min: 1, max: 100, step: 1 },
      { name: 'colors', type: 'array', value: ['#ff0000'], isColorArray: true },
      { name: 'tail', type: 'range', value: 0.3, min: 0, max: 1, step: 0.1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'color-wipe',
    name: 'Color Wipe',
    type: 'color-wipe',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'colors', type: 'array', value: ['#ff0000', '#0000ff'], isColorArray: true },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'fire',
    name: 'Fire',
    type: 'fire',
    parameters: [
      { name: 'intensity', type: 'range', value: 0.8, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'cooling', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'sparking', type: 'range', value: 0.3, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    type: 'rainbow',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'saturation', type: 'range', value: 1.0, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'brightness', type: 'range', value: 1.0, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'twinkle',
    name: 'Twinkle',
    type: 'twinkle',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'density', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'colors', type: 'array', value: ['#ffffff'], isColorArray: true },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'vu-bars',
    name: 'VU Bars',
    type: 'vu-bars',
    parameters: [
      { name: 'sensitivity', type: 'range', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'colors', type: 'array', value: ['#00ff00'], isColorArray: true },
      { name: 'bars', type: 'range', value: 8, min: 1, max: 16, step: 1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'solid',
    name: 'Solid Color',
    type: 'solid',
    parameters: [
      { name: 'colors', type: 'array', value: ['#ff0000'], isColorArray: true },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'breathing',
    name: 'Breathing',
    type: 'breathing',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'colors', type: 'array', value: ['#ff0000'], isColorArray: true },
      { name: 'minBrightness', type: 'range', value: 0.1, min: 0, max: 0.5, step: 0.1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'chase',
    name: 'Chase',
    type: 'chase',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'length', type: 'range', value: 5, min: 1, max: 50, step: 1 },
      { name: 'count', type: 'range', value: 1, min: 1, max: 10, step: 1 },
      { name: 'colors', type: 'array', value: ['#ff0000'], isColorArray: true },
      { name: 'colorMode', type: 'options', value: 'palette', options: ['palette', 'cycle'] },
      { name: 'backgroundColor', type: 'color', value: '#000000' },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'wave',
    name: 'Wave',
    type: 'wave',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'frequency', type: 'range', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
      { name: 'count', type: 'range', value: 1, min: 1, max: 10, step: 1 },
      { name: 'colors', type: 'array', value: ['#00ff00'], isColorArray: true },
      { name: 'colorMode', type: 'options', value: 'palette', options: ['palette', 'cycle'] },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'plasma',
    name: 'Plasma',
    type: 'plasma',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'intensity', type: 'range', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'matrix',
    name: 'Matrix',
    type: 'matrix',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'density', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'colors', type: 'array', value: ['#00ff00'], isColorArray: true },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'confetti',
    name: 'Confetti',
    type: 'confetti',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'density', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'glitter',
    name: 'Glitter',
    type: 'glitter',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'density', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'colors', type: 'array', value: ['#ffffff'], isColorArray: true },
      { name: 'backgroundColor', type: 'color', value: '#000000' },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  }
];

export default EffectEngine;

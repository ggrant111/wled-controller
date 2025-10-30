/**
 * Client-side blend mode utilities (browser-compatible with Uint8Array)
 */

export type BlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'max'
  | 'min'
  | 'replace';

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Blend two RGB colors using the specified blend mode and opacity (browser version)
 */
export function blendColors(
  baseColor: RGBColor,
  layerColor: RGBColor,
  blendMode: BlendMode,
  opacity: number = 1.0
): RGBColor {
  const alpha = Math.max(0, Math.min(1, opacity));
  
  if (alpha === 0) {
    return baseColor;
  }
  
  // Normalize colors to 0-1 range
  const base = {
    r: baseColor.r / 255,
    g: baseColor.g / 255,
    b: baseColor.b / 255
  };
  
  const layer = {
    r: layerColor.r / 255,
    g: layerColor.g / 255,
    b: layerColor.b / 255
  };
  
  let blended: { r: number; g: number; b: number };
  
  switch (blendMode) {
    case 'normal':
      blended = {
        r: base.r * (1 - alpha) + layer.r * alpha,
        g: base.g * (1 - alpha) + layer.g * alpha,
        b: base.b * (1 - alpha) + layer.b * alpha
      };
      break;
      
    case 'add':
      blended = {
        r: Math.min(1, base.r + layer.r * alpha),
        g: Math.min(1, base.g + layer.g * alpha),
        b: Math.min(1, base.b + layer.b * alpha)
      };
      break;
      
    case 'multiply':
      blended = {
        r: base.r * (1 - alpha) + (base.r * layer.r) * alpha,
        g: base.g * (1 - alpha) + (base.g * layer.g) * alpha,
        b: base.b * (1 - alpha) + (base.b * layer.b) * alpha
      };
      break;
      
    case 'screen':
      const screen = {
        r: 1 - (1 - base.r) * (1 - layer.r),
        g: 1 - (1 - base.g) * (1 - layer.g),
        b: 1 - (1 - base.b) * (1 - layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + screen.r * alpha,
        g: base.g * (1 - alpha) + screen.g * alpha,
        b: base.b * (1 - alpha) + screen.b * alpha
      };
      break;
      
    case 'overlay':
      const overlay = {
        r: base.r < 0.5 ? 2 * base.r * layer.r : 1 - 2 * (1 - base.r) * (1 - layer.r),
        g: base.g < 0.5 ? 2 * base.g * layer.g : 1 - 2 * (1 - base.g) * (1 - layer.g),
        b: base.b < 0.5 ? 2 * base.b * layer.b : 1 - 2 * (1 - base.b) * (1 - layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + overlay.r * alpha,
        g: base.g * (1 - alpha) + overlay.g * alpha,
        b: base.b * (1 - alpha) + overlay.b * alpha
      };
      break;
      
    case 'soft-light':
      const softLight = {
        r: base.r < 0.5
          ? base.r - (1 - 2 * layer.r) * base.r * (1 - base.r)
          : base.r + (2 * layer.r - 1) * (Math.sqrt(base.r) - base.r),
        g: base.g < 0.5
          ? base.g - (1 - 2 * layer.g) * base.g * (1 - base.g)
          : base.g + (2 * layer.g - 1) * (Math.sqrt(base.g) - base.g),
        b: base.b < 0.5
          ? base.b - (1 - 2 * layer.b) * base.b * (1 - base.b)
          : base.b + (2 * layer.b - 1) * (Math.sqrt(base.b) - base.b)
      };
      blended = {
        r: base.r * (1 - alpha) + softLight.r * alpha,
        g: base.g * (1 - alpha) + softLight.g * alpha,
        b: base.b * (1 - alpha) + softLight.b * alpha
      };
      break;
      
    case 'hard-light':
      const hardLight = {
        r: layer.r < 0.5 ? 2 * base.r * layer.r : 1 - 2 * (1 - base.r) * (1 - layer.r),
        g: layer.g < 0.5 ? 2 * base.g * layer.g : 1 - 2 * (1 - base.g) * (1 - layer.g),
        b: layer.b < 0.5 ? 2 * base.b * layer.b : 1 - 2 * (1 - base.b) * (1 - layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + hardLight.r * alpha,
        g: base.g * (1 - alpha) + hardLight.g * alpha,
        b: base.b * (1 - alpha) + hardLight.b * alpha
      };
      break;
      
    case 'difference':
      const diff = {
        r: Math.abs(base.r - layer.r),
        g: Math.abs(base.g - layer.g),
        b: Math.abs(base.b - layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + diff.r * alpha,
        g: base.g * (1 - alpha) + diff.g * alpha,
        b: base.b * (1 - alpha) + diff.b * alpha
      };
      break;
      
    case 'exclusion':
      const exclusion = {
        r: base.r + layer.r - 2 * base.r * layer.r,
        g: base.g + layer.g - 2 * base.g * layer.g,
        b: base.b + layer.b - 2 * base.b * layer.b
      };
      blended = {
        r: base.r * (1 - alpha) + exclusion.r * alpha,
        g: base.g * (1 - alpha) + exclusion.g * alpha,
        b: base.b * (1 - alpha) + exclusion.b * alpha
      };
      break;
      
    case 'max':
      blended = {
        r: Math.max(base.r, layer.r),
        g: Math.max(base.g, layer.g),
        b: Math.max(base.b, layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + blended.r * alpha,
        g: base.g * (1 - alpha) + blended.g * alpha,
        b: base.b * (1 - alpha) + blended.b * alpha
      };
      break;
      
    case 'min':
      blended = {
        r: Math.min(base.r, layer.r),
        g: Math.min(base.g, layer.g),
        b: Math.min(base.b, layer.b)
      };
      blended = {
        r: base.r * (1 - alpha) + blended.r * alpha,
        g: base.g * (1 - alpha) + blended.g * alpha,
        b: base.b * (1 - alpha) + blended.b * alpha
      };
      break;
      
    case 'replace':
      const hasColor = layer.r > 0 || layer.g > 0 || layer.b > 0;
      if (hasColor) {
        blended = {
          r: base.r * (1 - alpha) + layer.r * alpha,
          g: base.g * (1 - alpha) + layer.g * alpha,
          b: base.b * (1 - alpha) + layer.b * alpha
        };
      } else {
        blended = base;
      }
      break;
      
    default:
      blended = {
        r: base.r * (1 - alpha) + layer.r * alpha,
        g: base.g * (1 - alpha) + layer.g * alpha,
        b: base.b * (1 - alpha) + layer.b * alpha
      };
  }
  
  return {
    r: Math.max(0, Math.min(255, Math.floor(blended.r * 255))),
    g: Math.max(0, Math.min(255, Math.floor(blended.g * 255))),
    b: Math.max(0, Math.min(255, Math.floor(blended.b * 255)))
  };
}

/**
 * Blend multiple effect frames together (browser version with Uint8Array)
 */
export function blendFrames(
  baseFrame: Uint8Array,
  layerFrames: Array<{ frame: Uint8Array; blendMode: BlendMode; opacity: number }>
): Uint8Array {
  if (layerFrames.length === 0) {
    return new Uint8Array(baseFrame);
  }
  
  const ledCount = baseFrame.length / 3;
  
  if (baseFrame.length % 3 !== 0) {
    console.warn('Base frame length is not a multiple of 3');
    return new Uint8Array(baseFrame);
  }
  
  for (const layer of layerFrames) {
    if (layer.frame.length !== baseFrame.length || layer.frame.length % 3 !== 0) {
      console.warn('Layer frame length mismatch');
      return new Uint8Array(baseFrame);
    }
  }
  
  const result = new Uint8Array(baseFrame);
  
  for (let i = 0; i < ledCount; i++) {
    const pixelIndex = i * 3;
    
    let currentColor = {
      r: baseFrame[pixelIndex],
      g: baseFrame[pixelIndex + 1],
      b: baseFrame[pixelIndex + 2]
    };
    
    for (const layer of layerFrames) {
      const layerColor = {
        r: layer.frame[pixelIndex],
        g: layer.frame[pixelIndex + 1],
        b: layer.frame[pixelIndex + 2]
      };
      
      currentColor = blendColors(currentColor, layerColor, layer.blendMode, layer.opacity);
    }
    
    result[pixelIndex] = currentColor.r;
    result[pixelIndex + 1] = currentColor.g;
    result[pixelIndex + 2] = currentColor.b;
  }
  
  return result;
}


/**
 * Color utility functions for LED effects
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a hex color string to RGB values
 */
export function parseColor(colorStr: string): RGBColor {
  const hex = colorStr.replace('#', '');
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16)
  };
}

/**
 * Convert RGB color to hex string
 */
export function rgbToHex(color: RGBColor): string {
  const toHex = (n: number) => {
    const hex = Math.floor(n).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Convert HSV color to RGB
 */
export function hsvToRgb(h: number, s: number, v: number): RGBColor {
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

/**
 * Attack-decay wave function similar to FastLED's attackDecayWave8
 */
export function attackDecayWave8(i: number): number {
  if (i < 86) {
    return i * 3;
  } else {
    i -= 86;
    return 255 - (i + Math.floor(i / 2));
  }
}

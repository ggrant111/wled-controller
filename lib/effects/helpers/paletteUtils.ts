/**
 * Palette and color management utilities for LED effects
 */

import { Palette } from '../../../types';
import { paletteManager } from '../../palettes';
import { RGBColor, parseColor, rgbToHex } from './colorUtils';

// Re-export paletteManager for use in effects
export { paletteManager };

/**
 * Get color mode from parameters
 */
export function getColorMode(params: Map<string, any>): 'palette' | 'cycle' {
  return params.get('colorMode') || 'palette';
}

/**
 * Get palette from parameters
 */
export function getPalette(params: Map<string, any>): Palette | null {
  const paletteId = params.get('palette');
  if (!paletteId) return null;
  
  return paletteManager.getPaletteById(paletteId) || null;
}

/**
 * Get color from palette with brightness adjustment
 */
export function getColorFromPalette(palette: Palette, colorIndex: number, brightness: number = 255): RGBColor {
  return paletteManager.getColorFromPalette(palette, colorIndex, brightness, 'linear');
}

/**
 * Get color array from parameters, supporting both color arrays and palettes
 * Checks for palette parameter first, then colors array, then falls back to default
 */
export function getColorArray(params: Map<string, any>, fallback: string): RGBColor[] {
  // First, check if a palette is specified
  const palette = getPalette(params);
  if (palette && palette.colors && palette.colors.length > 0) {
    return palette.colors.map(c => parseColor(c));
  }
  
  // Then check for colors array
  const colors = params.get('colors');
  if (Array.isArray(colors) && colors.length > 0) {
    return colors.map(c => parseColor(c));
  }
  
  // Finally, fall back to the default color
  return [parseColor(fallback)];
}

/**
 * Get colors from palette or color array with fallback
 */
export function getColorsFromParams(params: Map<string, any>, fallback: string): RGBColor[] {
  const palette = getPalette(params);
  const usePalette = palette !== null;
  
  if (usePalette && palette) {
    return palette.colors.map(c => parseColor(c));
  } else {
    return getColorArray(params, fallback);
  }
}

/**
 * Create a temporary palette from color array for interpolation
 */
export function createTempPalette(colors: RGBColor[]): Palette {
  return {
    id: 'temp',
    name: 'temp',
    colors: colors.map(c => rgbToHex(c))
  };
}

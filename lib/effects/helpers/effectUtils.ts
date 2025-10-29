/**
 * Common effect utilities and interfaces
 */

import { RGBColor } from './colorUtils';

/**
 * Base interface for effect generators
 */
export interface EffectGenerator {
  generate(params: Map<string, any>, ledCount: number, time: number, width?: number, height?: number): Buffer;
}

/**
 * Common effect data structures
 */
export interface MatrixData {
  positions: number[];
  trails: number[][];
}

export interface ConfettiData {
  position: number;
  color: RGBColor;
  velocity: number;
}

export interface ColorTwinkleData {
  pixelClocks: Array<{
    offset: number;
    speedMultiplier: number;
    salt: number;
  }>;
  paletteOffset: number;
}

/**
 * Apply mirror transformation to LED index
 */
export function applyMirror(index: number, ledCount: number): number {
  return index < ledCount / 2 ? index : ledCount - 1 - index;
}

/**
 * Apply reverse transformation to LED index
 */
export function applyReverse(index: number, ledCount: number): number {
  return ledCount - 1 - index;
}

/**
 * Apply both mirror and reverse transformations
 */
export function applyTransformations(index: number, ledCount: number, mirror: boolean, reverse: boolean): number {
  let effectiveIndex = index;
  
  if (mirror) {
    effectiveIndex = applyMirror(effectiveIndex, ledCount);
  }
  
  if (reverse) {
    effectiveIndex = applyReverse(effectiveIndex, ledCount);
  }
  
  return effectiveIndex;
}

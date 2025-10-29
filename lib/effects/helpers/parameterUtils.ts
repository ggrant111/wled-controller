/**
 * Parameter handling utilities for LED effects
 */

import { EffectParameter } from '../../../types';

/**
 * Convert effect parameters array to a Map for easier access
 */
export function getParameterMap(parameters: EffectParameter[]): Map<string, any> {
  const paramMap = new Map();
  parameters.forEach(param => {
    paramMap.set(param.name, param.value);
  });
  return paramMap;
}

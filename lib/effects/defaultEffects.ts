/**
 * Default Effects Configuration
 */

import { Effect } from '../../types';

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
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
      { name: 'palette', type: 'palette', value: 'fire' },
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
      { name: 'usePalette', type: 'boolean', value: false },
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
      { name: 'palette', type: 'palette', value: 'rainbow' },
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
  },
  {
    id: 'cylon',
    name: 'Cylon',
    type: 'cylon',
    parameters: [
      { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
      { name: 'width', type: 'range', value: 3, min: 1, max: 20, step: 1 },
      { name: 'tail', type: 'range', value: 0.3, min: 0, max: 1, step: 0.1 },
      { name: 'colors', type: 'array', value: ['#ff0000'], isColorArray: true },
      { name: 'colorMode', type: 'options', value: 'palette', options: ['palette', 'cycle'] },
      { name: 'palette', type: 'palette', value: 'rainbow' },
      { name: 'reverse', type: 'boolean', value: false },
      { name: 'mirror', type: 'boolean', value: false }
    ]
  },
  {
    id: 'color-twinkle',
    name: 'Color Twinkle',
    type: 'color-twinkle',
    parameters: [
      { name: 'speed', type: 'range', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'density', type: 'range', value: 0.5, min: 0.1, max: 1.0, step: 0.1 },
      { name: 'colors', type: 'array', value: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'], isColorArray: true },
      { name: 'backgroundColor', type: 'color', value: '#000000' },
      { name: 'paletteMode', type: 'boolean', value: false },
      { name: 'paletteSpeed', type: 'range', value: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { name: 'coolLikeIncandescent', type: 'boolean', value: true }
    ]
  },
  {
    id: 'pacifica',
    name: 'Pacifica',
    type: 'pacifica',
    parameters: [
      { name: 'speed', type: 'range', value: 0.5, min: 0.1, max: 2.0, step: 0.1 },
      { name: 'intensity', type: 'range', value: 1.0, min: 0.1, max: 2.0, step: 0.1 }
    ]
  },
  {
    id: 'skipping-rock',
    name: 'Skipping Rock (Ripples + Bounces)',
    type: 'skipping-rock',
    parameters: [
      // Rock motion
      { name: 'rockWidth', type: 'range', value: 6, min: 1, max: 20, step: 1 },
      { name: 'rockSpeed', type: 'range', value: 180, min: 10, max: 600, step: 10 },
      { name: 'rockTrail', type: 'range', value: 0.85, min: 0, max: 1, step: 0.01 },
      { name: 'rockHue', type: 'number', value: undefined as any },
      { name: 'rockBrightness', type: 'range', value: 1.0, min: 0.1, max: 1.0, step: 0.05 },

      // Skips
      { name: 'minSkipDist', type: 'range', value: 40, min: 5, max: 300, step: 5 },
      { name: 'maxSkipDist', type: 'range', value: 120, min: 10, max: 600, step: 10 },
      { name: 'skipHoldMs', type: 'range', value: 35, min: 0, max: 300, step: 5 },
      { name: 'spawnAtRock', type: 'boolean', value: true },

      // Ripples
      { name: 'rippleSpeed', type: 'range', value: 260, min: 10, max: 1000, step: 10 },
      { name: 'rippleSigma', type: 'range', value: 1.6, min: 0.6, max: 4.0, step: 0.1 },
      { name: 'rippleDampPerSec', type: 'range', value: 0.6, min: 0.3, max: 0.99, step: 0.01 },
      { name: 'reflectLoss', type: 'range', value: 0.65, min: 0.3, max: 0.95, step: 0.01 },
      { name: 'maxRipples', type: 'range', value: 12, min: 1, max: 50, step: 1 },
      { name: 'additive', type: 'boolean', value: true },

      // Palette
      { name: 'palette', type: 'palette', value: 'rainbow' },
      { name: 'usePaletteCycle', type: 'boolean', value: true },
      { name: 'paletteShiftPerSkip', type: 'range', value: 0.18, min: 0, max: 1, step: 0.01 },

      // Scene
      { name: 'backgroundFade', type: 'range', value: 0.92, min: 0.5, max: 0.999, step: 0.001 },
      { name: 'gamma', type: 'range', value: 2.2, min: 1.0, max: 3.0, step: 0.1 },
      { name: 'clamp', type: 'boolean', value: true }
    ]
  },
  {
    id: 'shockwave-dual',
    name: 'Shockwave (Dual, Random Meet)',
    type: 'shockwave-dual',
    parameters: [
      // Cycle
      { name: 'minMeet', type: 'range', value: 0.20, min: 0.0, max: 1.0, step: 0.01 },
      { name: 'maxMeet', type: 'range', value: 0.80, min: 0.0, max: 1.0, step: 0.01 },
      { name: 'minRestMs', type: 'range', value: 400, min: 0, max: 3000, step: 50 },
      { name: 'maxRestMs', type: 'range', value: 1400, min: 0, max: 5000, step: 50 },
      { name: 'minHoldMs', type: 'range', value: 40, min: 0, max: 1000, step: 10 },
      { name: 'maxHoldMs', type: 'range', value: 120, min: 0, max: 1000, step: 10 },

      // Travel
      { name: 'speedL', type: 'range', value: 140, min: 10, max: 600, step: 10 },
      { name: 'speedR', type: 'range', value: 140, min: 10, max: 600, step: 10 },
      { name: 'cometTrail', type: 'range', value: 0.86, min: 0.0, max: 1.0, step: 0.01 },

      // Explosion
      { name: 'waves', type: 'range', value: 3, min: 1, max: 8, step: 1 },
      { name: 'waveSpeed', type: 'range', value: 240, min: 10, max: 1000, step: 10 },
      { name: 'dispersion', type: 'range', value: 0.10, min: 0.0, max: 0.5, step: 0.01 },
      { name: 'thickness', type: 'range', value: 2.1, min: 0.6, max: 4.0, step: 0.1 },
      { name: 'decayPerWave', type: 'range', value: 0.55, min: 0.2, max: 0.99, step: 0.01 },
      { name: 'useAdditive', type: 'boolean', value: true },
      { name: 'globalFade', type: 'range', value: 0.965, min: 0.5, max: 0.999, step: 0.001 },
      { name: 'gamma', type: 'range', value: 2.2, min: 1.0, max: 3.0, step: 0.1 },
      { name: 'clamp', type: 'boolean', value: true },

      // Colors
      { name: 'hueCore', type: 'range', value: 30, min: 0, max: 360, step: 1 },
      { name: 'hueEdge', type: 'range', value: 205, min: 0, max: 360, step: 1 },
      { name: 'sat', type: 'range', value: 1.0, min: 0, max: 1, step: 0.01 },
      { name: 'bright', type: 'range', value: 1.0, min: 0.1, max: 1, step: 0.05 },
      { name: 'hueTravelL', type: 'range', value: 330, min: 0, max: 360, step: 1 },
      { name: 'hueTravelR', type: 'range', value: 200, min: 0, max: 360, step: 1 }
    ]
  }
];

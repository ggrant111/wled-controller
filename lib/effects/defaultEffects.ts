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
  }
];

export interface WLEDDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  ledCount: number;
  segments: LEDSegment[];
  isOnline: boolean;
  lastSeen?: Date;
}

export interface LEDSegment {
  id: string;
  start: number;
  length: number;
  color: string;
  brightness: number;
}

export interface GroupMember {
  deviceId: string;
  segmentId?: string; // Optional segment ID for partial device inclusion
  startLed?: number;  // Start LED index for segment
  endLed?: number;    // End LED index for segment
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];  // Supports full devices, device segments, and virtual devices
  isDefault?: boolean;     // True for "All Devices" default group
  brightness: number;
  isStreaming: boolean;
}

export interface VirtualDevice {
  id: string;
  name: string;
  ledRanges: VirtualLEDRange[];  // Just a list of LED ranges from devices
  brightness: number;
  isStreaming: boolean;
}

export interface VirtualLEDRange {
  id: string;
  deviceId: string;
  startLed: number;  // Starting LED index (0-based)
  endLed: number;    // Ending LED index (inclusive)
}

export interface Effect {
  id: string;
  name: string;
  type: EffectType;
  parameters: EffectParameter[];
  duration?: number;
}

export interface EffectParameter {
  name: string;
  type: 'color' | 'number' | 'boolean' | 'range' | 'array' | 'options' | 'palette';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  isColorArray?: boolean;
}

export type EffectType = 
  | 'comet'
  | 'color-wipe'
  | 'fire'
  | 'rainbow'
  | 'twinkle'
  | 'vu-bars'
  | 'solid'
  | 'breathing'
  | 'chase'
  | 'wave'
  | 'plasma'
  | 'matrix'
  | 'confetti'
  | 'glitter'
  | 'cylon'
  | 'color-twinkle';

export interface Preset {
  id: string;
  name: string;
  effect: Effect;
  targets: StreamTarget[];
  brightness: number;
}

export interface StreamTarget {
  type: 'device' | 'group' | 'virtual';
  id: string;
  segments?: string[];
}

export interface StreamingSession {
  id: string;
  targets: StreamTarget[];
  effect: Effect;
  fps: number;
  blendMode: 'add' | 'max' | 'overwrite';
  isActive: boolean;
  startTime: Date;
  selectedTargets?: string[];
}

export interface DDPPacket {
  header: Buffer;
  payload: Buffer;
}

export interface StreamFrame {
  timestamp: number;
  data: Buffer;
  target: StreamTarget;
}

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  isCustom?: boolean;
  description?: string;
}

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

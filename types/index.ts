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
  name?: string; // Optional friendly name for UI and grouping
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
  | 'color-twinkle'
  | 'pacifica'
  | 'shockwave-dual'
  | 'skipping-rock'
  | 'chromatic-vortex'
  | 'ethereal-matrix'
  | 'flare-burst'
  | 'pattern-generator';

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

export interface EffectLayer {
  id: string;
  effect: Effect;
  blendMode: BlendMode;
  opacity: number; // 0.0 to 1.0
  enabled: boolean;
  name?: string; // Optional friendly name
}

export type BlendMode =
  | 'normal' // Standard alpha blending
  | 'add' // Add colors together (brighten)
  | 'multiply' // Multiply colors (darken, blend)
  | 'screen' // Inverse multiply (brighten, blend)
  | 'overlay' // Combine multiply and screen
  | 'soft-light' // Soft diffused light effect
  | 'hard-light' // Strong light effect
  | 'difference' // Subtract colors (high contrast)
  | 'exclusion' // Softer difference
  | 'max' // Take maximum of each color channel
  | 'min' // Take minimum of each color channel
  | 'replace'; // Replace pixels below (like overwrite)

export interface BlendModeInfo {
  value: BlendMode;
  name: string;
  description: string;
}

export const BLEND_MODES: BlendModeInfo[] = [
  {
    value: 'normal',
    name: 'Normal',
    description: 'Standard blending with transparency'
  },
  {
    value: 'add',
    name: 'Add',
    description: 'Adds colors together, making them brighter'
  },
  {
    value: 'multiply',
    name: 'Multiply',
    description: 'Darkens and blends colors together'
  },
  {
    value: 'screen',
    name: 'Screen',
    description: 'Inverts, multiplies, and inverts again for a brightening blend'
  },
  {
    value: 'overlay',
    name: 'Overlay',
    description: 'Combines multiply and screen for enhanced contrast'
  },
  {
    value: 'soft-light',
    name: 'Soft Light',
    description: 'Soft diffused lighting effect'
  },
  {
    value: 'hard-light',
    name: 'Hard Light',
    description: 'Strong lighting effect with high contrast'
  },
  {
    value: 'difference',
    name: 'Difference',
    description: 'Subtracts colors for high contrast effects'
  },
  {
    value: 'exclusion',
    name: 'Exclusion',
    description: 'Softer version of difference with reduced contrast'
  },
  {
    value: 'max',
    name: 'Maximum',
    description: 'Takes the brightest value from both layers'
  },
  {
    value: 'min',
    name: 'Minimum',
    description: 'Takes the darkest value from both layers'
  },
  {
    value: 'replace',
    name: 'Replace',
    description: 'Replaces pixels where this layer has color'
  }
];

export interface StreamingSession {
  id: string;
  targets: StreamTarget[];
  layers: EffectLayer[]; // Multiple effect layers
  fps: number;
  isActive: boolean;
  startTime: Date;
  selectedTargets?: string[];
  excludedDevices?: string[]; // Devices to exclude from group/virtual streams
  // Legacy support - if effect is provided, create a single layer
  effect?: Effect;
  // Playlist metadata
  playlistId?: string; // ID of the playlist if this session is part of a playlist
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

export interface LocationSettings {
  latitude?: number;
  longitude?: number;
  timezone?: string; // IANA timezone ID (e.g., 'America/Los_Angeles')
  city?: string;
  country?: string;
  countryCode?: string; // ISO country code (e.g., 'US', 'CA')
  autoDetected?: boolean;
}

export interface PlaylistItem {
  id: string;
  presetId: string;
  duration: number; // Duration in seconds
  order: number; // Order in playlist
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  shuffle: boolean;
  loop: boolean;
  targets: StreamTarget[]; // Devices/groups/virtuals to play to
  createdAt: string;
  updatedAt: string;
}

export interface EffectPreset {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  useLayers: boolean;
  // Single effect mode
  effect?: Effect;
  parameters?: Record<string, any>; // Plain object for JSON serialization
  // Layers mode
  layers?: EffectLayer[];
  layerParameters?: Record<string, Record<string, any>>; // Nested plain objects for JSON
}

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

// Scheduling
export type ScheduleTimeType = 'time' | 'sunrise' | 'sunset';

export interface ScheduleSequenceItem {
  // Either reference a saved preset by id OR inline effect/layers
  presetId?: string;
  // Inline effect mode
  effect?: Effect;
  // Inline layers mode
  layers?: EffectLayer[];
  // How long this item should run in seconds
  durationSeconds?: number;
}

export interface ScheduleRule {
  id: string;
  name: string;
  enabled: boolean;
  // Targets to stream to
  targets: StreamTarget[];
  // Days of week 0-6 (Sun=0)
  daysOfWeek?: number[];
  // Specific calendar dates (YYYY-MM-DD)
  dates?: string[];
  // Holidays handling
  onHolidaysOnly?: boolean; // Run only on holidays
  skipOnHolidays?: boolean; // Skip if holiday
  selectedHolidayIds?: string[]; // Specific holiday IDs to match
  daysBeforeHoliday?: number; // Days before selected holidays to include (default: 0)
  daysAfterHoliday?: number; // Days after selected holidays to include (default: 0)
  // Time window
  startType: ScheduleTimeType;
  endType?: ScheduleTimeType; // If omitted and durationSeconds provided, compute end
  startTime?: string; // 'HH:MM' in local time when startType === 'time'
  endTime?: string;   // 'HH:MM' in local time when endType === 'time'
  startOffsetMinutes?: number; // For sunrise/sunset
  endOffsetMinutes?: number;   // For sunrise/sunset
  // Location for sunrise/sunset
  latitude?: number;
  longitude?: number;
  timezone?: string; // IANA tz id
  // If no explicit end, run for duration (seconds)
  durationSeconds?: number;
  // Brightness ramping
  rampOnStart?: boolean;
  rampOffEnd?: boolean;
  rampDurationSeconds?: number; // duration of ramp up/down
  // Sequence of presets/effects
  sequence: ScheduleSequenceItem[];
  sequenceLoop?: boolean;
  sequenceShuffle?: boolean;
  // Global FPS for session
  fps?: number;
}

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  rules: ScheduleRule[];
  priority?: number; // Higher priority schedules run when overlapping (default: 0)
  createdAt: string;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // "MM-DD" for fixed dates, or pattern like "4TH_THURSDAY_NOVEMBER" for variable dates
  isRecurring: boolean; // If true, holiday repeats yearly
  description?: string;
  isCustom?: boolean; // True for user-created holidays
  createdAt?: string;
  updatedAt?: string;
}

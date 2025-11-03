import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import JSONStorage from '../lib/storage';
import DDPSender from '../lib/ddp-sender';
import EffectEngine, { defaultEffects } from '../lib/effects';
import { paletteManager } from '../lib/palettes';
import { WLEDDevice, Group, VirtualDevice, Preset, StreamingSession, StreamTarget, Effect, EffectPreset, Schedule, ScheduleRule, ScheduleSequenceItem } from '../types';
// Use require to avoid type resolution issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SunCalc = require('suncalc');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Holidays = require('date-holidays');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const storage = new JSONStorage();
const ddpSender = new DDPSender();
const effectEngine = new EffectEngine();

// Middleware
app.use(cors());
app.use(express.json());

// Streaming sessions
const streamingSessions = new Map<string, StreamingSession>();
let streamingInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
const loggedStreamingDevices = new Set<string>(); // Track which devices have been logged for streaming start
// Scheduler state
interface ActiveRuleSession {
  sessionId: string;
  endAt: number | null; // Overall rule end time
  sequence: ScheduleSequenceItem[]; // Full sequence array
  currentSequenceIndex: number; // Current item index
  currentSequenceStartTime: number; // When current item started (timestamp)
  rule: ScheduleRule; // Store the rule for reference
}
const activeRuleSessions = new Map<string, ActiveRuleSession>();
let schedulerInterval: NodeJS.Timeout | null = null;

async function loadEffectPresetsFromFile(): Promise<EffectPreset[]> {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const presetsFile = path.join(dataDir, 'presets.json');
    await fs.mkdir(dataDir, { recursive: true });
    const data = await fs.readFile(presetsFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function isHoliday(date: Date, country?: string, state?: string): boolean {
  if (!country) return false;
  try {
    const hd = new Holidays(country, state);
    return !!hd.isHoliday(date);
  } catch {
    return false;
  }
}

// Calculate variable date pattern (e.g., "4TH_THURSDAY_NOVEMBER")
function calculateVariableDate(year: number, pattern: string): Date | null {
  const parts = pattern.split('_');
  if (parts.length !== 3) return null;
  
  const [nthStr, dayName, monthName] = parts;
  
  // Parse month name
  const monthMap: Record<string, number> = {
    JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
    JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11
  };
  const month = monthMap[monthName.toUpperCase()];
  if (month === undefined) return null;
  
  // Parse day name
  const dayMap: Record<string, number> = {
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6
  };
  const targetDay = dayMap[dayName.toUpperCase()];
  if (targetDay === undefined) return null;
  
  // Parse nth occurrence
  let nth: number;
  if (nthStr === 'LAST') {
    // Find last occurrence - start from end of month
    const lastDay = new Date(year, month + 1, 0);
    let day = lastDay.getDate();
    let date = new Date(year, month, day);
    
    // Go backwards until we find the matching day of week
    while (date.getDay() !== targetDay) {
      day--;
      if (day < 1) return null;
      date = new Date(year, month, day);
    }
    return date;
  } else {
    // Parse ordinal (1ST, 2ND, 3RD, 4TH, 5TH)
    const match = nthStr.match(/^(\d+)(ST|ND|RD|TH)$/i);
    if (!match) return null;
    nth = parseInt(match[1]);
    if (nth < 1 || nth > 5) return null;
    
    // Find nth occurrence - start from first day of month
    let found = 0;
    let day = 1;
    let date = new Date(year, month, day);
    
    while (day <= 31) {
      if (date.getMonth() !== month) break; // Gone past end of month
      if (date.getDay() === targetDay) {
        found++;
        if (found === nth) return date;
      }
      day++;
      date = new Date(year, month, day);
    }
    return null;
  }
}

// Check if a date matches selected holidays (with days before/after support)
async function matchesSelectedHolidays(date: Date, holidayIds?: string[], daysBefore?: number, daysAfter?: number): Promise<boolean> {
  if (!holidayIds || holidayIds.length === 0) return false;
  
  try {
    const holidaysFile = path.join(process.cwd(), 'data', 'holidays.json');
    const holidaysData = await fs.readFile(holidaysFile, 'utf8');
    const holidays = JSON.parse(holidaysData);
    
    const checkDate = (d: Date): boolean => {
      const dateStr = d.toISOString().slice(0, 10);
      const monthDay = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const year = d.getFullYear();
      
      return holidays.some((h: any) => {
        if (!holidayIds.includes(h.id)) return false;
        
        // Check if it's a variable date pattern (contains underscores and no dashes)
        if (h.date.includes('_') && !h.date.includes('-')) {
          const holidayDate = calculateVariableDate(year, h.date);
          if (holidayDate) {
            return holidayDate.toISOString().slice(0, 10) === dateStr;
          }
          return false;
        }
        
        // Fixed date pattern (MM-DD or YYYY-MM-DD)
        if (h.isRecurring) {
          // For recurring holidays, compare MM-DD
          return h.date === monthDay;
        } else {
          // For one-time holidays, compare full date
          return h.date === dateStr;
        }
      });
    };
    
    // Check the date itself
    if (checkDate(date)) return true;
    
    // Check days before
    if (daysBefore && daysBefore > 0) {
      for (let i = 1; i <= daysBefore; i++) {
        const beforeDate = new Date(date);
        beforeDate.setDate(beforeDate.getDate() - i);
        if (checkDate(beforeDate)) return true;
      }
    }
    
    // Check days after
    if (daysAfter && daysAfter > 0) {
      for (let i = 1; i <= daysAfter; i++) {
        const afterDate = new Date(date);
        afterDate.setDate(afterDate.getDate() + i);
        if (checkDate(afterDate)) return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

function getTodaysTime(date: Date, timeHHMM: string, tz?: string): Date {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

function computeEventTime(type: 'time' | 'sunrise' | 'sunset', baseDate: Date, opts: { time?: string; lat?: number; lon?: number; offsetMin?: number }): Date | null {
  if (type === 'time') {
    if (!opts.time) return null;
    const dt = getTodaysTime(baseDate, opts.time);
    if (opts.offsetMin) dt.setMinutes(dt.getMinutes() + opts.offsetMin);
    return dt;
  }
  if (opts.lat === undefined || opts.lon === undefined) return null;
  const times = SunCalc.getTimes(baseDate, opts.lat, opts.lon);
  const t = type === 'sunrise' ? times.sunrise : times.sunset;
  const dt = new Date(t);
  if (opts.offsetMin) dt.setMinutes(dt.getMinutes() + opts.offsetMin);
  return dt;
}

async function ruleMatchesDate(rule: ScheduleRule, now: Date): Promise<boolean> {
  const dow = now.getDay();
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dow)) return false;
  if (rule.dates && rule.dates.length > 0) {
    const ymd = now.toISOString().slice(0, 10);
    if (!rule.dates.includes(ymd)) return false;
  }
  
  // Check selected holidays with days before/after
  if (rule.selectedHolidayIds && rule.selectedHolidayIds.length > 0) {
    const matchesHoliday = await matchesSelectedHolidays(
      now,
      rule.selectedHolidayIds,
      rule.daysBeforeHoliday,
      rule.daysAfterHoliday
    );
    if (!matchesHoliday) return false;
  }
  
  // Legacy holiday check (using date-holidays library) - kept for backwards compatibility
  // Note: This is now less relevant since we use selectedHolidayIds instead
  const holiday = false; // Disabled - using selectedHolidayIds instead
  if (rule.onHolidaysOnly && !holiday) return false;
  if (rule.skipOnHolidays && holiday) return false;
  return true;
}

// Helper function to stop existing streams to all targets in a rule
// Only stops streams to devices included in the schedule, preserving streams to other devices
async function stopStreamsToTargets(targets: StreamTarget[]): Promise<void> {
  const sessionsToRemove: string[] = [];
  const sessionsModified: string[] = [];
  
  // Resolve schedule targets to device IDs
  const scheduleDeviceIds = await resolveTargetsToDeviceIds(targets);
  
  console.log(`[Scheduler] Resolving schedule targets to devices:`, Array.from(scheduleDeviceIds));
  
  // Check each active streaming session
  for (const session of Array.from(streamingSessions.values())) {
    if (!session.isActive) continue;
    
    // Resolve session targets to device IDs
    const sessionDeviceIds = await resolveTargetsToDeviceIds(session.targets);
    
    // Find devices that overlap (devices in both schedule and session)
    const overlappingDevices = Array.from(scheduleDeviceIds).filter(id => sessionDeviceIds.has(id));
    
    if (overlappingDevices.length === 0) {
      // No overlap, skip this session
      continue;
    }
    
    console.log(`[Scheduler] Session ${session.id} has overlapping devices:`, overlappingDevices);
    
    // Check if session streams to groups/virtuals (can exclude devices) or direct devices
    const hasGroupVirtualTargets = session.targets.some(t => t.type === 'group' || t.type === 'virtual');
    const hasDirectDeviceTargets = session.targets.some(t => t.type === 'device');
    
    if (hasGroupVirtualTargets && !hasDirectDeviceTargets) {
      // Session streams to groups/virtuals - exclude the overlapping devices
      if (!session.excludedDevices) {
        session.excludedDevices = [];
      }
      
      let modified = false;
      for (const deviceId of overlappingDevices) {
        if (!session.excludedDevices.includes(deviceId)) {
          session.excludedDevices.push(deviceId);
          modified = true;
          console.log(`[Scheduler] Excluded device ${deviceId} from session ${session.id}`);
        }
      }
      
      if (modified) {
        sessionsModified.push(session.id);
        io.emit('streaming-session-updated', session);
      }
    } else if (hasDirectDeviceTargets) {
      // Session streams directly to devices - remove those devices from targets
      const prevLen = session.targets.length;
      
      // Remove device targets that overlap with schedule
      session.targets = session.targets.filter(t => {
        if (t.type === 'device') {
          return !scheduleDeviceIds.has(t.id);
        }
        // For groups/virtuals, we need to check if they still have any non-excluded devices
        // For now, keep them but we'll handle exclusion separately
        return true;
      });
      
      // Also handle groups/virtuals that might have overlapping devices
      // Exclude overlapping devices from group/virtual streams
      for (const target of session.targets) {
        if ((target.type === 'group' || target.type === 'virtual') && !session.excludedDevices) {
          session.excludedDevices = [];
        }
        if (target.type === 'group' || target.type === 'virtual') {
          for (const deviceId of overlappingDevices) {
            if (!session.excludedDevices!.includes(deviceId)) {
              session.excludedDevices!.push(deviceId);
              console.log(`[Scheduler] Excluded device ${deviceId} from ${target.type} stream in session ${session.id}`);
            }
          }
        }
      }
      
      // If no targets left, mark inactive
      if (session.targets.length === 0 && prevLen > 0) {
        session.isActive = false;
        sessionsToRemove.push(session.id);
      } else if (session.targets.length < prevLen && prevLen > 0) {
        // Target removed but session still has targets - emit update
        sessionsModified.push(session.id);
        io.emit('streaming-session-updated', session);
      }
    }
  }
  
  // Remove sessions with no targets and emit stopped events
  for (const sessionId of sessionsToRemove) {
    streamingSessions.delete(sessionId);
    io.emit('streaming-stopped', sessionId);
    console.log(`[Scheduler] Stopped and removed session ${sessionId} (no targets remaining)`);
  }
  
  // Emit state change if any sessions were affected
  if (sessionsToRemove.length > 0 || sessionsModified.length > 0) {
    const activeSessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
    io.emit('streaming-state-changed', {
      isStreaming: activeSessions.length > 0,
      session: activeSessions.length > 0 ? activeSessions[0] : null
    });
    console.log(`[Scheduler] Affected ${sessionsToRemove.length} sessions (removed) and ${sessionsModified.length} sessions (modified)`);
  }
}

// Helper function to apply a sequence item to a session
async function applySequenceItemToSession(session: StreamingSession, item: ScheduleSequenceItem, fps: number): Promise<void> {
  const body: any = { targets: session.targets, fps };
  
  if (item.layers && item.layers.length > 0) {
    body.layers = item.layers;
    body.effect = undefined;
  } else if (item.effect) {
    body.effect = item.effect;
    body.blendMode = 'overwrite';
    body.layers = [];
  } else if (item.presetId) {
    const presets = await loadEffectPresetsFromFile();
    const preset = presets.find(p => p.id === item.presetId);
    if (preset) {
      if (preset.useLayers && preset.layers) {
        // Apply layer parameters to layers
        body.layers = preset.layers.map((layer: any) => {
          const layerParamsKey = `${layer.id}-${layer.effect.id}`;
          const savedParams = preset.layerParameters?.[layerParamsKey] || {};
          
          return {
            ...layer,
            effect: {
              ...layer.effect,
              parameters: layer.effect.parameters.map((param: any) => ({
                ...param,
                value: savedParams[param.name] ?? param.value
              }))
            }
          };
        });
        body.effect = undefined;
      } else if (preset.effect) {
        // Apply saved parameters to effect
        body.effect = {
          ...preset.effect,
          parameters: preset.effect.parameters.map((param: any) => ({
            ...param,
            value: preset.parameters?.[param.name] ?? param.value
          }))
        } as any;
        body.blendMode = 'overwrite';
        body.layers = [];
      }
    }
  }
  
  // Update the session
  session.layers = body.layers || [];
  session.effect = body.effect;
  session.fps = fps;
}

async function startSequenceForRule(rule: ScheduleRule): Promise<string | null> {
  const fps = rule.fps || 30;
  let sequence = [...(rule.sequence || [])];
  if (sequence.length === 0) return null;
  if (rule.sequenceShuffle) {
    sequence = sequence.sort(() => Math.random() - 0.5);
  }
  
  // Stop any existing streams to the targets before starting the schedule
  // Only stops streams to devices included in this schedule
  if (rule.targets && rule.targets.length > 0) {
    await stopStreamsToTargets(rule.targets);
    console.log(`[Scheduler] Stopped existing streams to devices in ${rule.targets.length} target(s) before starting schedule`);
  }
  
  // Prepare body for first item
  const first = sequence[0];
  const body: any = { targets: rule.targets, fps };
  if (first.layers && first.layers.length > 0) {
    body.layers = first.layers;
  } else if (first.effect) {
    body.effect = first.effect;
    body.blendMode = 'overwrite';
  } else if (first.presetId) {
    const presets = await loadEffectPresetsFromFile();
    const preset = presets.find(p => p.id === first.presetId);
    if (preset) {
      if (preset.useLayers && preset.layers) {
        // Apply layer parameters to layers
        body.layers = preset.layers.map((layer: any) => {
          const layerParamsKey = `${layer.id}-${layer.effect.id}`;
          const savedParams = preset.layerParameters?.[layerParamsKey] || {};
          
          return {
            ...layer,
            effect: {
              ...layer.effect,
              parameters: layer.effect.parameters.map((param: any) => ({
                ...param,
                value: savedParams[param.name] ?? param.value
              }))
            }
          };
        });
      } else if (preset.effect) {
        // Apply saved parameters to effect
        body.effect = {
          ...preset.effect,
          parameters: preset.effect.parameters.map((param: any) => ({
            ...param,
            value: preset.parameters?.[param.name] ?? param.value
          }))
        } as any;
        body.blendMode = 'overwrite';
      }
    }
  }
  
  const respSession = await new Promise<{ id: string } | null>(async (resolve) => {
    try {
      const session: StreamingSession = {
        id: uuidv4(),
        targets: rule.targets,
        layers: body.layers || [],
        fps,
        isActive: true,
        startTime: new Date(),
        effect: body.effect
      };
      streamingSessions.set(session.id, session);
      
      if (!streamingInterval) {
        loggedStreamingDevices.clear();
        startStreamingLoop();
      }
      
      // Emit Socket.IO events to notify frontend
      io.emit('streaming-started', session);
      io.emit('streaming-state-changed', {
        isStreaming: true,
        session: session
      });
      
      console.log(`[Scheduler] Started streaming session ${session.id} and emitted events`);
      resolve({ id: session.id });
    } catch (e) {
      console.error('[Scheduler] Error creating session:', e);
      resolve(null);
    }
  });
  if (!respSession) return null;
  return respSession.id;
}

function scheduleEndAtForRule(rule: ScheduleRule, startAt: Date, defaultLocation?: { latitude?: number; longitude?: number }): number | null {
  const now = startAt;
  // Use rule's location if specified, otherwise use default location from settings
  const lat = rule.latitude ?? defaultLocation?.latitude;
  const lon = rule.longitude ?? defaultLocation?.longitude;
  const end = computeEventTime(
    rule.endType || 'time',
    now,
    {
      time: rule.endTime,
      lat,
      lon,
      offsetMin: rule.endOffsetMinutes
    }
  );
  if (end) return end.getTime();
  if (rule.durationSeconds) return now.getTime() + rule.durationSeconds * 1000;
  return null;
}

async function rampBrightness(targets: StreamTarget[], from: number, to: number, durationMs: number) {
  const steps = Math.max(1, Math.floor(durationMs / 200));
  for (let i = 1; i <= steps; i++) {
    const value = Math.round(from + (to - from) * (i / steps));
    for (const t of targets) {
      io.emit('brightness-updated', { targetType: t.type, targetId: t.id, brightness: value });
    }
    await new Promise(r => setTimeout(r, Math.floor(durationMs / steps)));
  }
}

async function schedulerTick() {
  try {
    const now = new Date();
    const nowTime = now.getTime();
    const schedules: Schedule[] = await storage.loadSchedules();
    // Load default location settings once per tick
    const defaultLocation = await storage.loadLocationSettings();
    
    // Track potential rule starts for priority handling
    const potentialStarts: Array<{ schedule: Schedule; rule: ScheduleRule; priority: number; startAt: Date }> = [];
    
    for (const sched of schedules) {
      if (!sched.enabled) continue;
      for (const rule of sched.rules) {
        if (!rule.enabled) continue;
        const ruleKey = rule.id;
        // Check active sessions for sequence advancement
        const active = activeRuleSessions.get(ruleKey);
        if (active) {
          // Check if overall rule end time reached
          if (active.endAt && nowTime >= active.endAt) {
            const session = streamingSessions.get(active.sessionId);
            if (session) {
              session.isActive = false;
              const sessionId = session.id;
              streamingSessions.delete(sessionId);
              io.emit('streaming-stopped', sessionId);
              
              // Emit state change
              const activeSessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
              io.emit('streaming-state-changed', {
                isStreaming: activeSessions.length > 0,
                session: activeSessions.length > 0 ? activeSessions[0] : null
              });
            }
            activeRuleSessions.delete(ruleKey);
            if (rule.rampOffEnd && rule.rampDurationSeconds) {
              rampBrightness(rule.targets, 255, 0, rule.rampDurationSeconds * 1000).catch(()=>{});
            }
            console.log(`[Scheduler] Schedule rule "${rule.name}" ended`);
            continue;
          }
          
          // Check if current sequence item duration has elapsed
          const currentItem = active.sequence[active.currentSequenceIndex];
          if (currentItem && currentItem.durationSeconds) {
            const itemEndTime = active.currentSequenceStartTime + (currentItem.durationSeconds * 1000);
            
            if (nowTime >= itemEndTime) {
              // Current item duration expired, advance to next
              let nextIndex = active.currentSequenceIndex + 1;
              
              // Check if we've reached the end of the sequence
              if (nextIndex >= active.sequence.length) {
                if (active.rule.sequenceLoop) {
                  // Loop back to start
                  nextIndex = 0;
                  // Re-shuffle if needed
                  if (active.rule.sequenceShuffle) {
                    active.sequence = active.sequence.sort(() => Math.random() - 0.5);
                  }
                } else {
                  // Sequence complete, stop the session
                  const session = streamingSessions.get(active.sessionId);
                  if (session) {
                    session.isActive = false;
                    const sessionId = session.id;
                    streamingSessions.delete(sessionId);
                    io.emit('streaming-stopped', sessionId);
                    
                    // Emit state change
                    const activeSessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
                    io.emit('streaming-state-changed', {
                      isStreaming: activeSessions.length > 0,
                      session: activeSessions.length > 0 ? activeSessions[0] : null
                    });
                  }
                  activeRuleSessions.delete(ruleKey);
                  continue;
                }
              }
              
              // Apply next sequence item
              const session = streamingSessions.get(active.sessionId);
              if (session && nextIndex < active.sequence.length) {
                const nextItem = active.sequence[nextIndex];
                await applySequenceItemToSession(session, nextItem, active.rule.fps || 30);
                
                // Update active session tracking
                active.currentSequenceIndex = nextIndex;
                active.currentSequenceStartTime = nowTime;
                
                // Emit session updated event
                io.emit('streaming-session-updated', session);
                
                console.log(`[Scheduler] Advanced to sequence item ${nextIndex + 1}/${active.sequence.length} for rule "${active.rule.name}"`);
              }
            }
          }
          continue;
        }
        
        // Start condition
        if (!(await ruleMatchesDate(rule, now))) continue;
        // Use rule's location if specified, otherwise use default location from settings
        const lat = rule.latitude ?? defaultLocation.latitude;
        const lon = rule.longitude ?? defaultLocation.longitude;
        const startAt = computeEventTime(rule.startType, now, { time: rule.startTime, lat, lon, offsetMin: rule.startOffsetMinutes });
        if (!startAt) continue;
        // Start within current minute/window
        if (Math.abs(nowTime - startAt.getTime()) <= 30000) {
          // Add to potential starts for priority handling
          potentialStarts.push({
            schedule: sched,
            rule,
            priority: sched.priority ?? 0,
            startAt
          });
        }
      }
    }
    
    // Handle priority-based scheduling: only start the highest priority schedule(s)
    if (potentialStarts.length > 0) {
      // Sort by priority (descending) and start time (ascending)
      potentialStarts.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.startAt.getTime() - b.startAt.getTime();
      });
      
      // Get the highest priority
      const highestPriority = potentialStarts[0].priority;
      
      // Start all rules with the highest priority
      for (const { schedule, rule, priority } of potentialStarts) {
        if (priority !== highestPriority) continue;
        
        const ruleKey = rule.id;
        let sequence = [...(rule.sequence || [])];
        if (sequence.length === 0) continue;
        if (rule.sequenceShuffle) {
          sequence = sequence.sort(() => Math.random() - 0.5);
        }
        
        const sessionId = await startSequenceForRule(rule);
        if (sessionId) {
          const endAt = scheduleEndAtForRule(rule, now, defaultLocation);
          activeRuleSessions.set(ruleKey, {
            sessionId,
            endAt,
            sequence,
            currentSequenceIndex: 0,
            currentSequenceStartTime: nowTime,
            rule
          });
          if (rule.rampOnStart && rule.rampDurationSeconds) {
            rampBrightness(rule.targets, 0, 255, rule.rampDurationSeconds * 1000).catch(()=>{});
          }
          console.log(`[Scheduler] Started sequence for rule "${rule.name}" (priority ${priority}) with ${sequence.length} items`);
        }
      }
    }
  } catch (e) {
    console.error('Scheduler tick error:', e);
  }
}

function startScheduler() {
  if (schedulerInterval) return;
  // Run every 5 seconds for more accurate sequence item timing
  schedulerInterval = setInterval(schedulerTick, 5000);
}

// Initialize storage
async function initializeStorage() {
  const devices = await storage.loadDevices();
  devices.forEach(device => ddpSender.addDevice(device));
}

// Health check functions
interface WLEDJsonResponse {
  state: {
    on: boolean;
    bri: number; // Global brightness 0-255
    seg?: Array<{
      id: number;
      bri?: number; // Segment brightness 0-255
      start?: number;
      stop?: number;
      len?: number;
    }>;
  };
  info?: {
    ver?: string;
    name?: string;
    leds?: {
      count?: number;
    };
  };
}

async function checkDeviceHealth(device: WLEDDevice): Promise<{ isOnline: boolean; data?: WLEDJsonResponse }> {
  try {
    const url = `http://${device.ip}/json`;
    const response = await axios.get<WLEDJsonResponse>(url, {
      timeout: 3000,
      validateStatus: () => true // Accept any status code
    });
    
    if (response.status === 200 && response.data) {
      return { isOnline: true, data: response.data };
    }
    return { isOnline: false };
  } catch (error) {
    return { isOnline: false };
  }
}

async function checkAllDevicesHealth() {
  try {
    const devices = await storage.loadDevices();
    let hasChanges = false;
    
    for (const device of devices) {
      const healthCheck = await checkDeviceHealth(device);
      const isOnline = healthCheck.isOnline;
      let deviceUpdated = false;
      
      // Update online status
      if (device.isOnline !== isOnline) {
        device.isOnline = isOnline;
        device.lastSeen = new Date();
        deviceUpdated = true;
      }
      
      // Sync brightness from WLED device if online and we have data
      if (isOnline && healthCheck.data?.state) {
        const wledState = healthCheck.data.state;
        const globalBrightness = wledState.bri / 255; // Convert from 0-255 to 0-1
        
        // If device has segments and WLED response has segment data, sync per-segment
        if (wledState.seg && Array.isArray(wledState.seg) && device.segments.length > 0) {
          // Map WLED segments to our device segments by position
          for (let i = 0; i < device.segments.length && i < wledState.seg.length; i++) {
            const wledSeg = wledState.seg[i];
            if (wledSeg.bri !== undefined) {
              const segmentBrightness = wledSeg.bri / 255; // Convert from 0-255 to 0-1
              if (Math.abs((device.segments[i].brightness || 0) - segmentBrightness) > 0.01) {
                device.segments[i].brightness = segmentBrightness;
                deviceUpdated = true;
              }
            }
          }
        } else {
          // No segment data, use global brightness for all segments
          if (device.segments.length > 0) {
            for (const segment of device.segments) {
              if (Math.abs((segment.brightness || 0) - globalBrightness) > 0.01) {
                segment.brightness = globalBrightness;
                deviceUpdated = true;
              }
            }
          }
        }
      }
      
      if (deviceUpdated) {
        await storage.updateDevice(device);
        ddpSender.updateDevice(device);
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      // Emit updated devices to all clients
      const updatedDevices = await storage.loadDevices();
      io.emit('devices-updated', updatedDevices);
    }
  } catch (error) {
    console.error('Health check error:', error);
  }
}

function startHealthCheckInterval() {
  // Check health every 30 seconds
  healthCheckInterval = setInterval(async () => {
    await checkAllDevicesHealth();
  }, 30000);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Request health check
  socket.on('request-health-check', async () => {
    await checkAllDevicesHealth();
  });

  // Real-time parameter updates
  socket.on('update-effect-parameter', async (data) => {
    const { sessionId, parameterName, value, layerId } = data;
    const session = streamingSessions.get(sessionId);
    
    if (session) {
      // If layerId is provided, update layer parameter
      if (layerId && session.layers) {
        const layer = session.layers.find(l => l.id === layerId);
        if (layer) {
          const param = layer.effect.parameters.find(p => p.name === parameterName);
          if (param) {
            param.value = value;
            streamingSessions.set(sessionId, session);
            io.emit('effect-parameter-updated', { sessionId, parameterName, value, layerId });
            try {
              // Reset effect instance to apply changes for stateful effects
              effectEngine.resetEffect(layer.effect.type as any);
            } catch {}
          }
        }
      } else if (session.effect) {
        // Legacy: update single effect
        const param = session.effect.parameters.find(p => p.name === parameterName);
        if (param) {
          param.value = value;
          streamingSessions.set(sessionId, session);
          io.emit('effect-parameter-updated', { sessionId, parameterName, value });
          try {
            effectEngine.resetEffect(session.effect.type as any);
          } catch {}
        }
      }
    }
  });

  // Real-time layer property updates (blendMode, opacity, enabled)
  socket.on('update-layer-property', async (data) => {
    const { sessionId, layerId, property, value } = data;
    const session = streamingSessions.get(sessionId);
    
    if (session && session.layers) {
      const layer = session.layers.find(l => l.id === layerId);
      if (layer && (property === 'blendMode' || property === 'opacity' || property === 'enabled')) {
        (layer as any)[property] = value;
        streamingSessions.set(sessionId, session);
        io.emit('layer-property-updated', { sessionId, layerId, property, value });
        console.log(`Updated layer ${layerId} ${property} to`, value);
      }
    }
  });

  // Brightness updates
  socket.on('update-brightness', async (data) => {
    const { targetType, targetId, brightness } = data;
    
    if (targetType === 'device') {
      const devices = await storage.loadDevices();
      const device = devices.find(d => d.id === targetId);
      if (device) {
        device.segments.forEach(segment => segment.brightness = brightness);
        await storage.updateDevice(device);
        ddpSender.updateDevice(device);
      }
    } else if (targetType === 'group') {
      const groups = await storage.loadGroups();
      const group = groups.find(g => g.id === targetId);
      if (group) {
        group.brightness = brightness;
        await storage.updateGroup(group);
      }
    } else if (targetType === 'virtual') {
      const virtuals = await storage.loadVirtuals();
      const virtual = virtuals.find(v => v.id === targetId);
      if (virtual) {
        virtual.brightness = brightness;
        await storage.updateVirtual(virtual);
      }
    }
    
    io.emit('brightness-updated', { targetType, targetId, brightness });
  });
});

// API Routes

// Devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await storage.loadDevices();
    console.log(`Loaded ${devices.length} devices from storage`);
    if (devices.length === 0) {
      console.warn('No devices found in storage - returning empty array');
    }
    res.json(devices);
  } catch (error) {
    console.error('Error loading devices:', error);
    res.status(500).json({ error: 'Failed to load devices', details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/devices', async (req, res) => {
  try {
    const device: WLEDDevice = {
      id: uuidv4(),
      name: req.body.name,
      ip: req.body.ip,
      port: req.body.port || 4048,
      ledCount: req.body.ledCount,
      segments: req.body.segments || [{ id: uuidv4(), start: 0, length: req.body.ledCount, color: '#ffffff', brightness: 1.0 }],
      isOnline: true, // Devices are online by default when added by user
      lastSeen: new Date()
    };
    
    await storage.addDevice(device);
    ddpSender.addDevice(device);
    io.emit('device-added', device);
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add device' });
  }
});

app.put('/api/devices/:id', async (req, res) => {
  try {
    const devices = await storage.loadDevices();
    const device = devices.find(d => d.id === req.params.id);
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    Object.assign(device, req.body);
    await storage.updateDevice(device);
    ddpSender.updateDevice(device);
    io.emit('device-updated', device);
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update device' });
  }
});

app.delete('/api/devices/:id', async (req, res) => {
  try {
    await storage.removeDevice(req.params.id);
    ddpSender.removeDevice(req.params.id);
    io.emit('device-removed', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

// Groups
app.get('/api/groups', async (req, res) => {
  try {
    const groups = await storage.loadGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

app.post('/api/groups', async (req, res) => {
  try {
    const group: Group = {
      id: uuidv4(),
      name: req.body.name,
      members: req.body.members || [],
      isDefault: req.body.isDefault || false,
      brightness: req.body.brightness || 1.0,
      isStreaming: false
    };
    
    await storage.addGroup(group);
    io.emit('group-added', group);
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add group' });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  try {
    const group: Group = {
      id: req.params.id,
      name: req.body.name,
      members: req.body.members || [],
      isDefault: req.body.isDefault || false,
      brightness: req.body.brightness || 1.0,
      isStreaming: req.body.isStreaming || false
    };
    
    await storage.updateGroup(group);
    io.emit('group-updated', group);
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update group' });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    await storage.removeGroup(req.params.id);
    io.emit('group-removed', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove group' });
  }
});

// Virtual Devices
app.get('/api/virtuals', async (req, res) => {
  try {
    const virtuals = await storage.loadVirtuals();
    res.json(virtuals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load virtuals' });
  }
});

app.post('/api/virtuals', async (req, res) => {
  try {
    const virtual: VirtualDevice = {
      id: uuidv4(),
      name: req.body.name,
      ledRanges: req.body.ledRanges || [],
      brightness: req.body.brightness || 1.0,
      isStreaming: false
    };
    
    await storage.addVirtual(virtual);
    io.emit('virtual-added', virtual);
    res.json(virtual);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add virtual' });
  }
});

app.put('/api/virtuals/:id', async (req, res) => {
  try {
    const virtual: VirtualDevice = {
      id: req.params.id,
      name: req.body.name,
      ledRanges: req.body.ledRanges || [],
      brightness: req.body.brightness || 1.0,
      isStreaming: req.body.isStreaming || false
    };
    
    await storage.updateVirtual(virtual);
    io.emit('virtual-updated', virtual);
    res.json(virtual);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update virtual' });
  }
});

app.delete('/api/virtuals/:id', async (req, res) => {
  try {
    await storage.removeVirtual(req.params.id);
    io.emit('virtual-removed', req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove virtual' });
  }
});

// Effects
app.get('/api/effects', (req, res) => {
  res.json(defaultEffects);
});

// Get current streaming state
app.get('/api/stream/state', (req, res) => {
  const sessions = Array.from(streamingSessions.values());
  const activeSession = sessions.find(s => s.isActive);
  
  if (activeSession) {
    res.json({ 
      isStreaming: true,
      session: activeSession,
      hasActiveSession: true
    });
  } else {
    res.json({ 
      isStreaming: false,
      session: null,
      hasActiveSession: false
    });
  }
});

// List all streaming sessions (full data)
app.get('/api/stream/sessions', (req, res) => {
  try {
    const sessions = Array.from(streamingSessions.values());
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get active playlist information
app.get('/api/playlists/active', (req, res) => {
  try {
    // Find the session with a playlistId
    const playlistSession = Array.from(streamingSessions.values()).find(
      session => session.playlistId
    );

    if (playlistSession) {
      res.json({
        activePlaylist: {
          sessionId: playlistSession.id,
          playlistId: playlistSession.playlistId
        }
      });
    } else {
      res.json({ activePlaylist: null });
    }
  } catch (error) {
    console.error('Error getting active playlist:', error);
    res.status(500).json({ error: 'Failed to get active playlist' });
  }
});

// Stop the currently active playlist
app.post('/api/playlists/stop', (req, res) => {
  try {
    // Find the session with a playlistId
    const playlistSession = Array.from(streamingSessions.values()).find(
      session => session.playlistId
    );

    if (!playlistSession) {
      return res.status(404).json({ error: 'No active playlist found' });
    }

    // Stop the playlist session
    const sessionId = playlistSession.id;
    const playlistId = playlistSession.playlistId;
    streamingSessions.delete(sessionId);
    
    if (streamingSessions.size === 0 && streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      loggedStreamingDevices.clear();
    }
    
    // Emit both the standard streaming-stopped and a specific playlist-stopped event
    io.emit('streaming-stopped', { sessionId });
    io.emit('playlist-stopped', { sessionId, playlistId });
    
    res.json({ success: true, sessionId, playlistId });
  } catch (error) {
    console.error('Error stopping playlist:', error);
    res.status(500).json({ error: 'Failed to stop playlist' });
  }
});

// Resolve and list all devices currently receiving a stream across active sessions
app.get('/api/stream/active-devices', async (req, res) => {
  try {
    const sessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
    const devices = await storage.loadDevices();
    const groups = await storage.loadGroups();
    const virtuals = await storage.loadVirtuals();
    const activeDeviceIds = new Set<string>();
    
    for (const session of sessions) {
      for (const target of session.targets) {
        if (target.type === 'device') {
          activeDeviceIds.add(target.id);
        } else if (target.type === 'group') {
          const group = groups.find(g => g.id === target.id);
          if (group && group.members) {
            for (const member of group.members) {
              if (member.deviceId) {
                activeDeviceIds.add(member.deviceId);
              }
            }
          }
        } else if (target.type === 'virtual') {
          const virtual = virtuals.find(v => v.id === target.id);
          if (virtual && virtual.ledRanges) {
            for (const range of virtual.ledRanges) {
              if (range.deviceId) {
                activeDeviceIds.add(range.deviceId);
              }
            }
          }
        }
      }
    }
    
    const activeDevices = devices
      .filter(d => activeDeviceIds.has(d.id))
      .map(d => ({ id: d.id, name: d.name, ledCount: d.ledCount }));
    
    res.json({ count: activeDevices.length, devices: activeDevices });
  } catch (error) {
    console.error('Error resolving active devices:', error);
    res.status(500).json({ error: 'Failed to resolve active devices' });
  }
});

// Get active schedule rules (currently running schedules)
app.get('/api/schedules/active', async (req, res) => {
  try {
    const schedules: Schedule[] = await storage.loadSchedules();
    const activeRules: Array<{
      scheduleId: string;
      scheduleName: string;
      ruleId: string;
      ruleName: string;
      endAt: number | null;
      startTime: number;
      targets: StreamTarget[];
      sequence: ScheduleSequenceItem[];
    }> = [];
    
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      for (const rule of schedule.rules) {
        if (!rule.enabled) continue;
        const ruleKey = rule.id;
        const active = activeRuleSessions.get(ruleKey);
        if (active) {
          // Calculate start time from currentSequenceStartTime and sequence items
          let startTime = active.currentSequenceStartTime;
          for (let i = 0; i < active.currentSequenceIndex; i++) {
            const item = active.sequence[i];
            if (item.durationSeconds) {
              startTime += item.durationSeconds * 1000;
            }
          }
          
          activeRules.push({
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            ruleId: rule.id,
            ruleName: rule.name,
            endAt: active.endAt,
            startTime: startTime,
            targets: rule.targets,
            sequence: active.sequence
          });
        }
      }
    }
    
    res.json(activeRules);
  } catch (error) {
    console.error('Error getting active schedules:', error);
    res.status(500).json({ error: 'Failed to get active schedules' });
  }
});

// Active targets summary (devices resolved, plus raw groups and virtuals in sessions)
app.get('/api/stream/active-targets', async (req, res) => {
  try {
    const sessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
    const devices = await storage.loadDevices();
    const groups = await storage.loadGroups();
    const virtuals = await storage.loadVirtuals();

    const deviceIdSet = new Set<string>();
    const groupIdSet = new Set<string>();
    const virtualIdSet = new Set<string>();

    for (const session of sessions) {
      for (const target of session.targets) {
        if (target.type === 'device') {
          deviceIdSet.add(target.id);
        } else if (target.type === 'group') {
          groupIdSet.add(target.id);
          const group = groups.find(g => g.id === target.id);
          if (group?.members) {
            for (const member of group.members) {
              if (member.deviceId) deviceIdSet.add(member.deviceId);
            }
          }
        } else if (target.type === 'virtual') {
          virtualIdSet.add(target.id);
          const virtual = virtuals.find(v => v.id === target.id);
          if (virtual?.ledRanges) {
            for (const range of virtual.ledRanges) {
              if (range.deviceId) deviceIdSet.add(range.deviceId);
            }
          }
        }
      }
    }

    const deviceNames = devices.filter(d => deviceIdSet.has(d.id)).map(d => ({ id: d.id, name: d.name }));
    const groupNames = groups.filter(g => groupIdSet.has(g.id)).map(g => ({ id: g.id, name: g.name }));
    const virtualNames = virtuals.filter(v => virtualIdSet.has(v.id)).map(v => ({ id: v.id, name: v.name }));

    res.json({
      sessions: sessions.map(s => ({ id: s.id, targets: s.targets })),
      counts: {
        sessions: sessions.length,
        devices: deviceNames.length,
        groups: groupNames.length,
        virtuals: virtualNames.length,
      },
      devices: deviceNames,
      groups: groupNames,
      virtuals: virtualNames,
    });
  } catch (error) {
    console.error('Error resolving active targets:', error);
    res.status(500).json({ error: 'Failed to resolve active targets' });
  }
});

// Helper function to resolve targets to device IDs
async function resolveTargetsToDeviceIds(targets: StreamTarget[]): Promise<Set<string>> {
  const deviceIds = new Set<string>();
  const devices = await storage.loadDevices();
  const groups = await storage.loadGroups();
  const virtuals = await storage.loadVirtuals();
  
  for (const target of targets) {
    if (target.type === 'device') {
      deviceIds.add(target.id);
    } else if (target.type === 'group') {
      const group = groups.find(g => g.id === target.id);
      if (group && group.members) {
        for (const member of group.members) {
          if (member.deviceId) {
            deviceIds.add(member.deviceId);
          }
        }
      }
    } else if (target.type === 'virtual') {
      const virtual = virtuals.find(v => v.id === target.id);
      if (virtual && virtual.ledRanges) {
        for (const range of virtual.ledRanges) {
          if (range.deviceId) {
            deviceIds.add(range.deviceId);
          }
        }
      }
    }
  }
  
  return deviceIds;
}

// Check for streaming conflicts
app.post('/api/stream/check-conflicts', async (req, res) => {
  try {
    const { targets } = req.body;
    
    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({ error: 'Targets array is required' });
    }
    
    console.log('[Conflict Check] Checking conflicts for targets:', JSON.stringify(targets));
    
    // Resolve new targets to device IDs
    const newTargetDeviceIds = await resolveTargetsToDeviceIds(targets);
    console.log('[Conflict Check] New target device IDs:', Array.from(newTargetDeviceIds));
    
    // Get all active streaming sessions
    const activeSessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
    console.log('[Conflict Check] Active sessions:', activeSessions.length);
    
    const conflicts: Array<{
      sessionId: string;
      sessionTargets: StreamTarget[];
      conflictingDevices: Array<{ id: string; name: string }>;
      canPartialStop: boolean;
      conflictSourceType: 'device' | 'group' | 'virtual';
    }> = [];
    
    // Check each active session for conflicts
    for (const session of activeSessions) {
      console.log('[Conflict Check] Checking session:', session.id, 'targets:', JSON.stringify(session.targets));
      const sessionDeviceIds = await resolveTargetsToDeviceIds(session.targets);
      console.log('[Conflict Check] Session device IDs:', Array.from(sessionDeviceIds));
      
      // Find overlapping device IDs
      const overlappingDevices = Array.from(newTargetDeviceIds).filter(id => sessionDeviceIds.has(id));
      console.log('[Conflict Check] Overlapping devices:', overlappingDevices);
      
      if (overlappingDevices.length > 0) {
        // Get device names
        const devices = await storage.loadDevices();
        const conflictingDevices = overlappingDevices.map(deviceId => {
          const device = devices.find(d => d.id === deviceId);
          return { id: deviceId, name: device?.name || deviceId };
        });
        
        // Determine if this conflict can be partially resolved (device is in a group/virtual, not direct device stream)
        // Can partial stop if:
        // 1. The conflicting session streams to groups/virtuals (not direct device)
        // 2. We're trying to stream to a single device
        // 3. There's only one conflicting device
        const canPartialStop = session.targets.some(t => 
          t.type === 'group' || t.type === 'virtual'
        ) && newTargetDeviceIds.size === 1 && conflictingDevices.length === 1;
        
        console.log('[Conflict Check] canPartialStop calculation:', {
          hasGroupVirtualTarget: session.targets.some(t => t.type === 'group' || t.type === 'virtual'),
          newTargetDeviceCount: newTargetDeviceIds.size,
          conflictingDeviceCount: conflictingDevices.length,
          canPartialStop
        });
        
        conflicts.push({
          sessionId: session.id,
          sessionTargets: session.targets,
          conflictingDevices,
          canPartialStop: canPartialStop || false,
          conflictSourceType: session.targets.find(t => t.type === 'group' || t.type === 'virtual')?.type || 'device'
        });
        console.log('[Conflict Check] Conflict found with session:', session.id, 'canPartialStop:', canPartialStop);
      }
    }
    
    console.log('[Conflict Check] Total conflicts:', conflicts.length);
    res.json({ 
      hasConflicts: conflicts.length > 0,
      conflicts 
    });
  } catch (error) {
    console.error('Error checking stream conflicts:', error);
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

// Streaming
app.post('/api/stream/start', async (req, res) => {
  try {
    const { targets, effect, layers, fps = 30, blendMode = 'replace', sessionId, selectedTargets, playlistId } = req.body;
    
    let session: StreamingSession;
    
    // Convert legacy effect to layers if needed
    let effectLayers: any[] = [];
    if (layers && Array.isArray(layers) && layers.length > 0) {
      effectLayers = layers;
    } else if (effect) {
      // Legacy support: convert single effect to a single layer
      effectLayers = [{
        id: uuidv4(),
        effect: effect,
        blendMode: blendMode === 'add' || blendMode === 'max' ? blendMode : 'normal',
        opacity: 1.0,
        enabled: true,
        name: effect.name
      }];
    } else {
      return res.status(400).json({ error: 'Either effect or layers must be provided' });
    }
    
    // If sessionId provided, update existing session
    if (sessionId && streamingSessions.has(sessionId)) {
      session = streamingSessions.get(sessionId)!;
      session.targets = targets;
      session.layers = effectLayers;
      session.fps = fps;
      if (selectedTargets !== undefined) {
        session.selectedTargets = selectedTargets;
      }
      // Preserve playlistId if updating, or set it if provided
      if (playlistId !== undefined) {
        session.playlistId = playlistId;
      }
      console.log('Updated streaming session:', session.id);
    } else {
      // Create new session
      session = {
        id: uuidv4(),
        targets,
        layers: effectLayers,
        fps,
        isActive: true,
        startTime: new Date(),
        selectedTargets: selectedTargets || undefined,
        playlistId: playlistId || undefined
      };
      console.log('Starting streaming session:', { targets, layers: effectLayers.length, fps, playlistId });
    }
    
    streamingSessions.set(session.id, session);
    console.log('Active streaming sessions:', streamingSessions.size);
    
    // Reset effect instances and clear state when starting a new session
    // This ensures fresh state when restarting streaming
    if (!sessionId) {
      // This is a new session - reset all effect states
      for (const layer of effectLayers) {
        try {
          effectEngine.resetEffect(layer.effect.type as any);
          // Also clear state for effects that maintain their own state
          const effectInstance = (effectEngine as any).effects?.get(layer.effect.type);
          if (effectInstance && typeof effectInstance.clearState === 'function') {
            effectInstance.clearState();
          }
        } catch (e) {
          // Ignore errors for effects that don't support reset
        }
      }
    }
    
    if (!streamingInterval) {
      console.log('Starting streaming loop');
      loggedStreamingDevices.clear(); // Clear logged devices for new streaming session
      // Reset time when starting fresh
      effectEngine.updateTime(-effectEngine.getTime()); // Reset to 0
      startStreamingLoop();
    }
    
    // Only emit streaming-started for new sessions, not updates
    if (sessionId) {
      // This is an update to an existing session
      io.emit('streaming-session-updated', session);
    } else {
      // This is a new session
      io.emit('streaming-started', session);
    }
    
    res.json(session);
  } catch (error) {
    console.error('Failed to start streaming:', error);
    res.status(500).json({ error: 'Failed to start streaming' });
  }
});

// Stop streaming to a specific target (device/group/virtual)
app.post('/api/stream/stop-target', async (req, res) => {
  try {
    const { target } = req.body as { target: { type: 'device'|'group'|'virtual'; id: string } };
    if (!target || !target.type || !target.id) {
      return res.status(400).json({ error: 'Invalid target' });
    }
    let modified = false;
    for (const session of Array.from(streamingSessions.values())) {
      const prevLen = session.targets.length;
      session.targets = session.targets.filter(t => !(t.type === target.type && t.id === target.id));
      if (session.targets.length !== prevLen) {
        modified = true;
        // If no targets left, mark inactive
        if (session.targets.length === 0) {
          session.isActive = false;
        }
      }
    }
    if (!modified) {
      return res.json({ success: true, message: 'No active sessions for target' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error stopping target:', error);
    return res.status(500).json({ error: 'Failed to stop target' });
  }
});

// Exclude a device from group/virtual streams in a session
app.post('/api/stream/exclude-device', async (req, res) => {
  try {
    const { sessionId, deviceId } = req.body;
    if (!sessionId || !deviceId) {
      return res.status(400).json({ error: 'sessionId and deviceId are required' });
    }
    
    const session = streamingSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.excludedDevices) {
      session.excludedDevices = [];
    }
    
    if (!session.excludedDevices.includes(deviceId)) {
      session.excludedDevices.push(deviceId);
      io.emit('streaming-session-updated', session);
    }
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error excluding device:', error);
    return res.status(500).json({ error: 'Failed to exclude device' });
  }
});

// Exclude a segment/range from group/virtual streams in a session
// For segments, we exclude the entire device (simpler approach)
// Future enhancement: track excluded segments separately
app.post('/api/stream/exclude-segment', async (req, res) => {
  try {
    const { sessionId, deviceId, startLed, endLed } = req.body;
    if (!sessionId || !deviceId || startLed === undefined || endLed === undefined) {
      return res.status(400).json({ error: 'sessionId, deviceId, startLed, and endLed are required' });
    }
    
    const session = streamingSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // For now, exclude the entire device when a segment is stopped
    // This ensures the segment stops streaming
    // Future: Could track excluded segments separately for more granular control
    if (!session.excludedDevices) {
      session.excludedDevices = [];
    }
    
    if (!session.excludedDevices.includes(deviceId)) {
      session.excludedDevices.push(deviceId);
      io.emit('streaming-session-updated', session);
    }
    
    return res.json({ success: true, message: `Excluded device ${deviceId} (segment LEDs ${startLed}-${endLed})` });
  } catch (error) {
    console.error('Error excluding segment:', error);
    return res.status(500).json({ error: 'Failed to exclude segment' });
  }
});

app.post('/api/stream/stop/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    streamingSessions.delete(sessionId);
    
    if (streamingSessions.size === 0 && streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      loggedStreamingDevices.clear(); // Clear logged devices when streaming stops
    }
    
    io.emit('streaming-stopped', sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop streaming' });
  }
});

app.post('/api/stream/pause/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = streamingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.isActive = false;
    
    // Check if any active sessions remain
    const hasActiveSessions = Array.from(streamingSessions.values()).some(s => s.isActive);
    if (!hasActiveSessions && streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      loggedStreamingDevices.clear();
    }
    
    io.emit('streaming-session-updated', session);
    io.emit('streaming-state-changed', {
      isStreaming: hasActiveSessions,
      session: hasActiveSessions ? Array.from(streamingSessions.values()).find(s => s.isActive) || null : null
    });
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Error pausing session:', error);
    res.status(500).json({ error: 'Failed to pause streaming' });
  }
});

app.post('/api/stream/resume/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = streamingSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.isActive = true;
    
    // Start streaming loop if not already running
    if (!streamingInterval) {
      loggedStreamingDevices.clear();
      startStreamingLoop();
    }
    
    io.emit('streaming-session-updated', session);
    io.emit('streaming-state-changed', {
      isStreaming: true,
      session: session
    });
    
    res.json({ success: true, session });
  } catch (error) {
    console.error('Error resuming session:', error);
    res.status(500).json({ error: 'Failed to resume streaming' });
  }
});

app.post('/api/stream/stop-all', (req, res) => {
  try {
    // Get all playlist sessions before clearing
    const playlistSessions = Array.from(streamingSessions.values()).filter(s => s.playlistId);
    
    streamingSessions.clear();
    
    if (streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      loggedStreamingDevices.clear(); // Clear logged devices when streaming stops
    }
    
    // Emit playlist-stopped events for any playlists that were stopped
    playlistSessions.forEach(session => {
      io.emit('playlist-stopped', { sessionId: session.id, playlistId: session.playlistId });
    });
    
    io.emit('streaming-stopped-all');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop all streaming' });
  }
});

// Brightness
app.post('/api/brightness', async (req, res) => {
  try {
    const { targetType, targetId, brightness, sendToDevice } = req.body;
    
    if (targetType === 'device') {
      const devices = await storage.loadDevices();
      const device = devices.find(d => d.id === targetId);
      if (device) {
        device.segments.forEach(segment => segment.brightness = brightness);
        await storage.updateDevice(device);
        ddpSender.updateDevice(device);
        
        // If sendToDevice flag is true, send JSON directly to WLED device
        if (sendToDevice && device.isOnline) {
          try {
            // Convert brightness from 0-1 range to 0-255 for WLED API
            const wledBrightness = Math.round(brightness * 255);
            const url = `http://${device.ip}/json/state`;
            await axios.post(url, { bri: wledBrightness }, {
              timeout: 3000,
              validateStatus: () => true // Accept any status code
            });
            console.log(`Sent brightness ${wledBrightness} (${Math.round(brightness * 100)}%) to WLED device ${device.name} at ${device.ip}`);
          } catch (error) {
            // Only log error details for non-timeout errors to reduce noise
            if (axios.isAxiosError(error)) {
              if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                // Device timeout - just log a simple message
                console.warn(`Brightness update timeout for ${device.name} at ${device.ip} (device may be slow or unreachable)`);
              } else {
                // Other network errors - log with more detail
                console.error(`Failed to send brightness to WLED device ${device.name} at ${device.ip}:`, error.message);
              }
            } else {
              console.error(`Failed to send brightness to WLED device ${device.name} at ${device.ip}:`, error);
            }
            // Don't fail the entire request if WLED device is unreachable
          }
        }
      }
    } else if (targetType === 'group') {
      const groups = await storage.loadGroups();
      const group = groups.find(g => g.id === targetId);
      if (group) {
        group.brightness = brightness;
        await storage.updateGroup(group);
      }
    } else if (targetType === 'virtual') {
      const virtuals = await storage.loadVirtuals();
      const virtual = virtuals.find(v => v.id === targetId);
      if (virtual) {
        virtual.brightness = brightness;
        await storage.updateVirtual(virtual);
      }
    }
    
    io.emit('brightness-updated', { targetType, targetId, brightness });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update brightness' });
  }
});

// Location Settings
app.get('/api/settings/location', async (req, res) => {
  try {
    const settings = await storage.loadLocationSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error loading location settings:', error);
    res.status(500).json({ error: 'Failed to load location settings' });
  }
});

app.post('/api/settings/location', async (req, res) => {
  try {
    const { latitude, longitude, timezone, city, country, autoDetected } = req.body;
    const settings = {
      latitude: latitude !== undefined && latitude !== null ? Number(latitude) : undefined,
      longitude: longitude !== undefined && longitude !== null ? Number(longitude) : undefined,
      timezone: timezone || undefined,
      city: city || undefined,
      country: country || undefined,
      autoDetected: autoDetected !== undefined ? Boolean(autoDetected) : undefined
    };
    await storage.saveLocationSettings(settings);
    res.json(settings);
  } catch (error) {
    console.error('Error saving location settings:', error);
    res.status(500).json({ error: 'Failed to save location settings' });
  }
});

// Helper function to check if IP is private/localhost
function isPrivateIP(ip: string): boolean {
  if (!ip || ip === 'unknown' || ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    return true;
  }
  // Check for private IP ranges
  const parts = ip.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (first === 10 || 
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)) {
      return true;
    }
  }
  return false;
}

// Geolocate client by IP
app.get('/api/settings/geolocate', async (req, res) => {
  try {
    // Get client IP from request
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 
                     req.headers['x-real-ip']?.toString() || 
                     req.socket.remoteAddress || 
                     'unknown';
    
    // Check if IP is private/localhost - if so, try to get public IP first
    if (isPrivateIP(clientIp)) {
      // Try to get public IP using a service that returns just the IP
      try {
        const publicIpResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
        const publicIp = publicIpResponse.data.ip;
        
        if (isPrivateIP(publicIp)) {
          return res.status(400).json({ 
            error: 'Unable to detect location. You appear to be on a private network. Please enter your location manually.' 
          });
        }
        
        // Use the public IP for geolocation
        const geoResponse = await axios.get(`http://ip-api.com/json/${publicIp}`, {
          timeout: 5000,
          params: {
            fields: 'status,message,lat,lon,timezone,city,country,countryCode'
          }
        });
        
        if (geoResponse.data.status === 'success') {
          return res.json({
            latitude: geoResponse.data.lat,
            longitude: geoResponse.data.lon,
            timezone: geoResponse.data.timezone,
            city: geoResponse.data.city,
            country: geoResponse.data.country,
            countryCode: geoResponse.data.countryCode,
            autoDetected: true
          });
        }
      } catch (publicIpError) {
        // Fall through to manual entry message
        return res.status(400).json({ 
          error: 'Unable to detect your public IP. Please enter your location manually in the settings.' 
        });
      }
    }
    
    // Use ip-api.com (free, no API key required for basic usage)
    // Note: Limited to 45 requests per minute from the same IP
    const response = await axios.get(`http://ip-api.com/json/${clientIp}`, {
      timeout: 5000,
      params: {
        fields: 'status,message,lat,lon,timezone,city,country,countryCode'
      }
    });
    
    if (response.data.status === 'success') {
      res.json({
        latitude: response.data.lat,
        longitude: response.data.lon,
        timezone: response.data.timezone,
        city: response.data.city,
        country: response.data.country,
        countryCode: response.data.countryCode,
        autoDetected: true
      });
    } else {
      res.status(400).json({ error: response.data.message || 'Failed to geolocate. Please enter location manually.' });
    }
  } catch (error: any) {
    console.error('Error geolocating:', error);
    if (error.response?.status === 400 && error.response?.data?.message?.includes('reserved')) {
      res.status(400).json({ 
        error: 'Cannot geolocate private IP address. Please enter your location manually or ensure you have a public IP.' 
      });
    } else {
      res.status(500).json({ error: 'Failed to geolocate. Please enter location manually.' });
    }
  }
});

// Presets
app.get('/api/presets', async (req, res) => {
  try {
    // Use the new EffectPreset format from file
    const dataDir = path.join(process.cwd(), 'data');
    const presetsFile = path.join(dataDir, 'presets.json');
    
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const data = await fs.readFile(presetsFile, 'utf8');
      const presets = JSON.parse(data);
      res.json(presets);
    } catch {
      res.json([]);
    }
  } catch (error) {
    console.error('Error loading presets:', error);
    res.status(500).json({ error: 'Failed to load presets' });
  }
});

app.get('/api/presets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dataDir = path.join(process.cwd(), 'data');
    const presetsFile = path.join(dataDir, 'presets.json');
    
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const data = await fs.readFile(presetsFile, 'utf8');
      const presets: EffectPreset[] = JSON.parse(data);
      const preset = presets.find(p => p.id === id);
      
      if (!preset) {
        return res.status(404).json({ error: `Preset not found with ID: ${id}` });
      }
      
      res.json(preset);
    } catch (error) {
      console.error('Error reading presets file:', error);
      res.status(404).json({ error: 'Preset not found' });
    }
  } catch (error) {
    console.error('Error getting preset:', error);
    res.status(500).json({ error: 'Failed to get preset' });
  }
});

app.post('/api/presets', async (req, res) => {
  try {
    // Legacy Preset format - keep for backward compatibility
    // But also support new EffectPreset format
    if (req.body.useLayers !== undefined || req.body.effect) {
      // New EffectPreset format
      const dataDir = path.join(process.cwd(), 'data');
      const presetsFile = path.join(dataDir, 'presets.json');
      
      await fs.mkdir(dataDir, { recursive: true });
      const existingData = await fs.readFile(presetsFile, 'utf8').catch(() => '[]');
      const presets: EffectPreset[] = JSON.parse(existingData);
      
      const newPreset: EffectPreset = {
        id: uuidv4(),
        name: req.body.name,
        description: req.body.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useLayers: req.body.useLayers || false,
        effect: req.body.effect,
        parameters: req.body.parameters,
        layers: req.body.layers,
        layerParameters: req.body.layerParameters
      };
      
      presets.push(newPreset);
      await fs.writeFile(presetsFile, JSON.stringify(presets, null, 2));
      
      io.emit('preset-added', newPreset);
      res.json(newPreset);
    } else {
      // Legacy Preset format
      const preset: Preset = {
        id: uuidv4(),
        name: req.body.name,
        effect: req.body.effect,
        targets: req.body.targets,
        brightness: req.body.brightness || 1.0
      };
      
      await storage.addPreset(preset);
      io.emit('preset-added', preset);
      res.json(preset);
    }
  } catch (error) {
    console.error('Error creating preset:', error);
    res.status(500).json({ error: 'Failed to add preset' });
  }
});

// Streaming loop
function startStreamingLoop() {
  console.log('Streaming loop started');
  streamingInterval = setInterval(async () => {
    const sessions = Array.from(streamingSessions.values());
    
    if (sessions.length === 0) {
      console.log('No active sessions');
      return;
    }
    
    // Get the highest FPS from active sessions to drive the loop
    const maxFPS = sessions.reduce((max, s) => Math.max(max, s.fps), 30);
    
    for (const session of sessions) {
      if (!session.isActive) {
        
        continue;
      }
      
      try {
        for (const target of session.targets) {
          const devices = await storage.loadDevices();
          let ledCount = 0;
          
            if (target.type === 'device') {
              const device = devices.find(d => d.id === target.id);
              if (device) {
                ledCount = device.ledCount;
                
                // Log streaming start only once per device
                if (!loggedStreamingDevices.has(device.id)) {
                  console.log(`Streaming started to device ${device.name} (${ledCount} LEDs)`);
                  loggedStreamingDevices.add(device.id);
                }
                
                const frame = session.layers && session.layers.length > 0
                  ? effectEngine.generateFrameFromLayers(session.layers, ledCount)
                  : session.effect
                    ? effectEngine.generateFrame(session.effect, ledCount)
                    : Buffer.alloc(ledCount * 3);
                await ddpSender.sendToDevice(target.id, frame);
                
                // Emit frame data to clients for preview
                io.emit('frame-data', {
                  targetId: target.id,
                  data: Buffer.from(frame).toString('base64'),
                  ledCount,
                  deviceId: target.id,
                  deviceName: device.name
                });
              } else {
                console.log('Device not found:', target.id);
              }
            } else if (target.type === 'group') {
            const groups = await storage.loadGroups();
            const group = groups.find(g => g.id === target.id);
            if (group && group.members) {
              // Send to individual devices and emit per-device/segment frame data for preview
              for (const member of group.members) {
                // Skip excluded devices
                if (session.excludedDevices && session.excludedDevices.includes(member.deviceId)) {
                  continue;
                }
                
                const device = devices.find(d => d.id === member.deviceId);
                if (device) {
                  // Calculate LED count - use full device or segment
                  if (member.startLed !== undefined && member.endLed !== undefined) {
                    ledCount = member.endLed - member.startLed + 1;
                    
                    // Log streaming start only once per device
                    if (!loggedStreamingDevices.has(device.id)) {
                      console.log(`Streaming started to device ${device.name}, LEDs ${member.startLed}-${member.endLed} (${ledCount} LEDs)`);
                      loggedStreamingDevices.add(device.id);
                    }
                    
                    const frame = session.layers && session.layers.length > 0
                      ? effectEngine.generateFrameFromLayers(session.layers, ledCount)
                      : session.effect
                        ? effectEngine.generateFrame(session.effect, ledCount)
                        : Buffer.alloc(ledCount * 3);
                    
                    // Emit frame data for this device segment with specific target ID
                    const segmentTargetId = `${member.deviceId}:${member.startLed}-${member.endLed}`;
                    io.emit('frame-data', {
                      targetId: segmentTargetId,
                      data: Buffer.from(frame).toString('base64'),
                      ledCount: ledCount,
                      deviceId: member.deviceId,
                      deviceName: device.name,
                      segmentInfo: {
                        startLed: member.startLed,
                        endLed: member.endLed,
                        segmentId: member.segmentId
                      }
                    });
                    
                    // DDP offset is in bytes, so multiply LED index by 3
                    await ddpSender.sendToDevice(member.deviceId, frame, member.startLed * 3);
                  } else {
                    ledCount = device.ledCount;
                    
                    // Log streaming start only once per device
                    if (!loggedStreamingDevices.has(device.id)) {
                      console.log(`Streaming started to device ${device.name} (${ledCount} LEDs)`);
                      loggedStreamingDevices.add(device.id);
                    }
                    
                    const frame = session.layers && session.layers.length > 0
                      ? effectEngine.generateFrameFromLayers(session.layers, ledCount)
                      : session.effect
                        ? effectEngine.generateFrame(session.effect, ledCount)
                        : Buffer.alloc(ledCount * 3);
                    
                    // Emit frame data for this device with device ID as target
                    io.emit('frame-data', {
                      targetId: member.deviceId,
                      data: Buffer.from(frame).toString('base64'),
                      ledCount: ledCount,
                      deviceId: member.deviceId,
                      deviceName: device.name
                    });
                    
                    await ddpSender.sendToDevice(member.deviceId, frame);
                  }
                }
              }
            }
          } else if (target.type === 'virtual') {
            // For virtual devices, calculate total LED count and map effects
            const virtuals = await storage.loadVirtuals();
            const virtual = virtuals.find(v => v.id === target.id);
            if (virtual && virtual.ledRanges) {
              // Calculate total LED count for the virtual device
              const totalVirtualLEDs = virtual.ledRanges.reduce(
                (sum, range) => sum + (range.endLed - range.startLed + 1),
                0
              );
              
              // Log virtual device streaming start only once
              if (!loggedStreamingDevices.has(virtual.id)) {
                console.log(`Streaming started to virtual device ${virtual.name} with ${totalVirtualLEDs} total LEDs`);
                loggedStreamingDevices.add(virtual.id);
              }
              
              // Generate effect frame for the total virtual LED count
              const virtualFrame = session.layers && session.layers.length > 0
                ? effectEngine.generateFrameFromLayers(session.layers, totalVirtualLEDs)
                : session.effect
                  ? effectEngine.generateFrame(session.effect, totalVirtualLEDs)
                  : Buffer.alloc(totalVirtualLEDs * 3);
              
              // Map virtual LED indices to physical device ranges
              let virtualLEDIndex = 0;
              for (const range of virtual.ledRanges) {
                // Skip excluded devices
                if (session.excludedDevices && session.excludedDevices.includes(range.deviceId)) {
                  virtualLEDIndex += range.endLed - range.startLed + 1;
                  continue;
                }
                
                const device = devices.find(d => d.id === range.deviceId);
                if (device) {
                  const rangeLength = range.endLed - range.startLed + 1;
                  // Extract the portion of the virtual frame for this range
                  const rangeFrame = virtualFrame.slice(virtualLEDIndex * 3, (virtualLEDIndex + rangeLength) * 3);
                  
                  // Log streaming start only once per device
                  if (!loggedStreamingDevices.has(device.id)) {
                    console.log(`Streaming started to device ${device.name}, LEDs ${range.startLed}-${range.endLed} (${rangeLength} LEDs)`);
                    loggedStreamingDevices.add(device.id);
                  }
                  
                  // Emit frame data for this device range with specific target ID
                  const rangeTargetId = `${range.deviceId}:${range.startLed}-${range.endLed}`;
                  io.emit('frame-data', {
                    targetId: rangeTargetId,
                    data: Buffer.from(rangeFrame).toString('base64'),
                    ledCount: rangeLength,
                    deviceId: range.deviceId,
                    deviceName: device.name,
                    segmentInfo: {
                      startLed: range.startLed,
                      endLed: range.endLed
                    }
                  });
                  
                  // Send with offset to target the specific LED range
                  // DDP offset is in bytes, so multiply LED index by 3
                  await ddpSender.sendToDevice(device.id, rangeFrame, range.startLed * 3);
                  
                  virtualLEDIndex += rangeLength;
                } else {
                  console.error(`Device ${range.deviceId} not found for LED range`);
                  // Still advance the index to keep mapping correct
                  virtualLEDIndex += range.endLed - range.startLed + 1;
                }
              }
            }
          }
        }
        
        // Update time based on actual elapsed time since last frame
        // Each frame advances by ~33ms at 30 FPS, so divide by 100 to slow down effects
        effectEngine.updateTime(0.016); // ~16ms per frame = more reasonable speed
      } catch (error) {
        console.error('Streaming error:', error);
      }
    }
  }, 1000 / 30); // Fixed 30 FPS for the loop
}

// Initialize and start server
async function startServer() {
  await initializeStorage();
  
  // Start periodic health checks
  startHealthCheckInterval();
  
  // Load custom palettes
  await paletteManager.loadCustomPalettesFromFile();
  console.log(`Loaded ${paletteManager.getCustomPalettes().length} custom palettes`);
  
  // Run initial health check after 5 seconds
  setTimeout(async () => {
    await checkAllDevicesHealth();
  }, 5000);
  
  // Start scheduler
  startScheduler();
  
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);

export default app;

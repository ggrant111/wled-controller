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

function ruleMatchesDate(rule: ScheduleRule, now: Date): boolean {
  const dow = now.getDay();
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dow)) return false;
  if (rule.dates && rule.dates.length > 0) {
    const ymd = now.toISOString().slice(0, 10);
    if (!rule.dates.includes(ymd)) return false;
  }
  const holiday = isHoliday(now, rule.holidayCountry, rule.holidayState);
  if (rule.onHolidaysOnly && !holiday) return false;
  if (rule.skipOnHolidays && holiday) return false;
  return true;
}

// Helper function to stop existing streams to all targets in a rule
function stopStreamsToTargets(targets: StreamTarget[]): void {
  const sessionsToRemove: string[] = [];
  
  for (const target of targets) {
    for (const session of Array.from(streamingSessions.values())) {
      const prevLen = session.targets.length;
      session.targets = session.targets.filter(t => !(t.type === target.type && t.id === target.id));
      
      // If no targets left, mark inactive and queue for removal
      if (session.targets.length === 0 && prevLen > 0) {
        session.isActive = false;
        sessionsToRemove.push(session.id);
      } else if (session.targets.length < prevLen && prevLen > 0) {
        // Target removed but session still has targets - emit update
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
  if (sessionsToRemove.length > 0 || targets.length > 0) {
    const activeSessions = Array.from(streamingSessions.values()).filter(s => s.isActive);
    io.emit('streaming-state-changed', {
      isStreaming: activeSessions.length > 0,
      session: activeSessions.length > 0 ? activeSessions[0] : null
    });
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
  if (rule.targets && rule.targets.length > 0) {
    stopStreamsToTargets(rule.targets);
    console.log(`[Scheduler] Stopped existing streams to ${rule.targets.length} target(s) before starting schedule`);
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

function scheduleEndAtForRule(rule: ScheduleRule, startAt: Date): number | null {
  const now = startAt;
  const end = computeEventTime(
    rule.endType || 'time',
    now,
    {
      time: rule.endTime,
      lat: rule.latitude,
      lon: rule.longitude,
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
        if (!ruleMatchesDate(rule, now)) continue;
        const startAt = computeEventTime(rule.startType, now, { time: rule.startTime, lat: rule.latitude, lon: rule.longitude, offsetMin: rule.startOffsetMinutes });
        if (!startAt) continue;
        // Start within current minute/window
        if (Math.abs(nowTime - startAt.getTime()) <= 30000) {
          let sequence = [...(rule.sequence || [])];
          if (sequence.length === 0) continue;
          if (rule.sequenceShuffle) {
            sequence = sequence.sort(() => Math.random() - 0.5);
          }
          
          const sessionId = await startSequenceForRule(rule);
          if (sessionId) {
            const endAt = scheduleEndAtForRule(rule, now);
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
            console.log(`[Scheduler] Started sequence for rule "${rule.name}" with ${sequence.length} items`);
          }
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
async function checkDeviceHealth(device: WLEDDevice): Promise<boolean> {
  try {
    const url = `http://${device.ip}/json/state`;
    const response = await axios.get(url, {
      timeout: 3000,
      validateStatus: () => true // Accept any status code
    });
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function checkAllDevicesHealth() {
  try {
    const devices = await storage.loadDevices();
    let hasChanges = false;
    
    for (const device of devices) {
      const isOnline = await checkDeviceHealth(device);
      
      if (device.isOnline !== isOnline) {
        device.isOnline = isOnline;
        device.lastSeen = new Date();
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
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load devices' });
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

// List all streaming sessions (summary)
app.get('/api/stream/sessions', (req, res) => {
  try {
    const sessions = Array.from(streamingSessions.values());
    const summaries = sessions.map(s => ({
      id: s.id,
      isActive: s.isActive,
      targets: s.targets,
      fps: s.fps,
      startTime: s.startTime,
    }));
    res.json({ count: summaries.length, sessions: summaries });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
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

// Streaming
app.post('/api/stream/start', async (req, res) => {
  try {
    const { targets, effect, layers, fps = 30, blendMode = 'replace', sessionId, selectedTargets } = req.body;
    
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
        selectedTargets: selectedTargets || undefined
      };
      console.log('Starting streaming session:', { targets, layers: effectLayers.length, fps });
    }
    
    streamingSessions.set(session.id, session);
    console.log('Active streaming sessions:', streamingSessions.size);
    
    if (!streamingInterval) {
      console.log('Starting streaming loop');
      loggedStreamingDevices.clear(); // Clear logged devices for new streaming session
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

app.post('/api/stream/stop-all', (req, res) => {
  try {
    streamingSessions.clear();
    
    if (streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
      loggedStreamingDevices.clear(); // Clear logged devices when streaming stops
    }
    
    io.emit('streaming-stopped-all');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop all streaming' });
  }
});

// Brightness
app.post('/api/brightness', async (req, res) => {
  try {
    const { targetType, targetId, brightness } = req.body;
    
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
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update brightness' });
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
                  ledCount
                });
              } else {
                console.log('Device not found:', target.id);
              }
            } else if (target.type === 'group') {
            const groups = await storage.loadGroups();
            const group = groups.find(g => g.id === target.id);
            if (group && group.members) {
              // Calculate total LED count for the group
              let totalGroupLEDs = 0;
              for (const member of group.members) {
                const device = devices.find(d => d.id === member.deviceId);
                if (device) {
                  if (member.startLed !== undefined && member.endLed !== undefined) {
                    totalGroupLEDs += member.endLed - member.startLed + 1;
                  } else {
                    totalGroupLEDs += device.ledCount;
                  }
                }
              }
              
              // Generate one frame for the entire group
              const groupFrame = session.layers && session.layers.length > 0
                ? effectEngine.generateFrameFromLayers(session.layers, totalGroupLEDs)
                : session.effect
                  ? effectEngine.generateFrame(session.effect, totalGroupLEDs)
                  : Buffer.alloc(totalGroupLEDs * 3);
              
              // Emit frame data for preview (once per group)
              io.emit('frame-data', {
                targetId: target.id,
                data: Buffer.from(groupFrame).toString('base64'),
                ledCount: totalGroupLEDs
              });
              
              // Send to individual devices
              for (const member of group.members) {
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
              
              // Emit frame data for preview
              io.emit('frame-data', {
                targetId: target.id,
                data: Buffer.from(virtualFrame).toString('base64'),
                ledCount: totalVirtualLEDs
              });
              
              // Map virtual LED indices to physical device ranges
              let virtualLEDIndex = 0;
              for (const range of virtual.ledRanges) {
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

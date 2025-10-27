import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import JSONStorage from '../lib/storage';
import DDPSender from '../lib/ddp-sender';
import EffectEngine, { defaultEffects } from '../lib/effects';
import { WLEDDevice, Group, VirtualDevice, Preset, StreamingSession, StreamTarget, Effect } from '../types';

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
    const { sessionId, parameterName, value } = data;
    const session = streamingSessions.get(sessionId);
    
    if (session) {
      const param = session.effect.parameters.find(p => p.name === parameterName);
      if (param) {
        param.value = value;
        streamingSessions.set(sessionId, session);
        io.emit('effect-parameter-updated', { sessionId, parameterName, value });
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

// Streaming
app.post('/api/stream/start', async (req, res) => {
  try {
    const { targets, effect, fps = 30, blendMode = 'overwrite', sessionId, selectedTargets } = req.body;
    
    let session: StreamingSession;
    
    // If sessionId provided, update existing session
    if (sessionId && streamingSessions.has(sessionId)) {
      session = streamingSessions.get(sessionId)!;
      session.targets = targets;
      session.effect = effect;
      session.fps = fps;
      session.blendMode = blendMode;
      if (selectedTargets !== undefined) {
        session.selectedTargets = selectedTargets;
      }
      console.log('Updated streaming session:', session.id);
    } else {
      // Create new session
      session = {
        id: uuidv4(),
        targets,
        effect,
        fps,
        blendMode,
        isActive: true,
        startTime: new Date(),
        selectedTargets: selectedTargets || undefined
      };
      console.log('Starting streaming session:', { targets, effect: effect.name, fps, blendMode });
    }
    
    streamingSessions.set(session.id, session);
    console.log('Active streaming sessions:', streamingSessions.size);
    
    if (!streamingInterval) {
      console.log('Starting streaming loop');
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

app.post('/api/stream/stop/:sessionId', (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    streamingSessions.delete(sessionId);
    
    if (streamingSessions.size === 0 && streamingInterval) {
      clearInterval(streamingInterval);
      streamingInterval = null;
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
    const presets = await storage.loadPresets();
    res.json(presets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load presets' });
  }
});

app.post('/api/presets', async (req, res) => {
  try {
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
  } catch (error) {
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
        console.log('Session inactive:', session.id);
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
                console.log(`Streaming to device ${device.name} (${ledCount} LEDs)`);
                const frame = effectEngine.generateFrame(session.effect, ledCount);
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
              const groupFrame = effectEngine.generateFrame(session.effect, totalGroupLEDs);
              
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
                    console.log(`Streaming to device ${device.name}, LEDs ${member.startLed}-${member.endLed} (${ledCount} LEDs)`);
                    const frame = effectEngine.generateFrame(session.effect, ledCount);
                    // DDP offset is in bytes, so multiply LED index by 3
                    await ddpSender.sendToDevice(member.deviceId, frame, member.startLed * 3);
                  } else {
                    ledCount = device.ledCount;
                    console.log(`Streaming to device ${device.name} (${ledCount} LEDs)`);
                    const frame = effectEngine.generateFrame(session.effect, ledCount);
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
              
              console.log(`Streaming to virtual device ${virtual.name} with ${totalVirtualLEDs} total LEDs`);
              
              // Generate effect frame for the total virtual LED count
              const virtualFrame = effectEngine.generateFrame(session.effect, totalVirtualLEDs);
              
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
                  
                  console.log(`Streaming to device ${device.name}, LEDs ${range.startLed}-${range.endLed} (${rangeLength} LEDs)`);
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
  
  // Run initial health check after 5 seconds
  setTimeout(async () => {
    await checkAllDevicesHealth();
  }, 5000);
  
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);

export default app;

'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Play, Pause, Settings, Monitor, Eye, Save, Zap } from 'lucide-react';
import { VirtualDevice, Effect, EffectPreset } from '../types';
import LEDPreviewCanvas from './LEDPreviewCanvas';
import StreamConflictModal from './StreamConflictModal';
import { useToast } from './ToastProvider';
import { useStreamIndicator } from '../hooks/useStreamIndicator';

interface VirtualCardProps {
  virtual: VirtualDevice;
  onEdit: () => void;
  onDelete: () => void;
  delay?: number;
}

export default function VirtualCard({ virtual, onEdit, onDelete, delay = 0 }: VirtualCardProps) {
  const { showToast } = useToast();
  const isReceiving = useStreamIndicator(virtual.id);
  const [showStreamControls, setShowStreamControls] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [mode, setMode] = useState<'preset' | 'effect'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [selectedEffectId, setSelectedEffectId] = useState<string>('');
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingStreamConfig, setPendingStreamConfig] = useState<{ requestBody: any; targets: any[] } | null>(null);
  const [conflictData, setConflictData] = useState<any>(null);
  const [devicesList, setDevicesList] = useState<Array<{ id: string; name: string }>>([]);
  const [groupsList, setGroupsList] = useState<Array<{ id: string; name: string }>>([]);
  const [virtualsList, setVirtualsList] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!showStreamControls) return;
    (async () => {
      try {
        const [effectsRes, presetsRes, devicesRes, groupsRes, virtualsRes] = await Promise.all([
          fetch('/api/effects'),
          fetch('/api/presets'),
          fetch('/api/devices'),
          fetch('/api/groups'),
          fetch('/api/virtuals')
        ]);
        if (effectsRes.ok) setEffects(await effectsRes.json());
        if (presetsRes.ok) setPresets(await presetsRes.json());
        if (devicesRes.ok) {
          const devs = await devicesRes.json();
          setDevicesList(devs.map((d: any) => ({ id: d.id, name: d.name })));
        }
        if (groupsRes.ok) {
          const grps = await groupsRes.json();
          setGroupsList(grps.map((g: any) => ({ id: g.id, name: g.name })));
        }
        if (virtualsRes.ok) {
          const virts = await virtualsRes.json();
          setVirtualsList(virts.map((v: any) => ({ id: v.id, name: v.name })));
        }
      } catch {}
    })();
  }, [showStreamControls]);

  const handlePlay = () => setShowStreamControls(v => !v);

  const handlePause = () => {
    fetch('/api/stream/stop-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { type: 'virtual', id: virtual.id } })
    }).then(res => { if (res.ok) showToast('Stopped streaming to virtual', 'success'); }).catch(() => {});
  };

  const totalLeds = virtual.ledRanges?.reduce((sum, r) => sum + (r.endLed - r.startLed + 1), 0) || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-6 glass-card-hover"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold">{virtual.name}</h3>
          {isReceiving && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-primary-500/20 text-primary-400">Streaming</span>
          )}
          <p className="text-sm text-white/70">{totalLeds} LEDs • {virtual.ledRanges?.length || 0} ranges</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs ${
            virtual.isStreaming ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
          }`}>
            {virtual.isStreaming ? 'Streaming' : 'Idle'}
          </span>
          <button onClick={onEdit} className="btn-secondary text-xs px-3 py-1"><Edit className="h-4 w-4" /></button>
          <button onClick={onDelete} className="btn-secondary text-xs px-3 py-1 text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-2 pt-4 border-t border-white/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={handlePlay} className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors" title="Start streaming">
              <Play className="h-4 w-4 text-green-400" />
            </button>
            <button onClick={handlePause} className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors" title="Stop streaming">
              <Pause className="h-4 w-4 text-red-400" />
            </button>
            <button onClick={() => setShowPreview(v => !v)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors" title={showPreview ? 'Hide live preview' : 'Show live preview'}>
              <Eye className="h-4 w-4" />
            </button>
          </div>
          <button onClick={onEdit} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors" title="Virtual settings">
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {showStreamControls && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setMode('preset')} className={`px-3 py-1.5 rounded ${mode==='preset'?'bg-primary-500/20 text-primary-400':'bg-white/10 text-white/70'}`}>
                <Save className="w-4 h-4 inline mr-1"/> Preset
              </button>
              <button onClick={() => setMode('effect')} className={`px-3 py-1.5 rounded ${mode==='effect'?'bg-primary-500/20 text-primary-400':'bg-white/10 text-white/70'}`}>
                <Zap className="w-4 h-4 inline mr-1"/> Effect
              </button>
            </div>
            {mode==='preset' ? (
              <div className="flex items-center gap-2">
                <select value={selectedPresetId} onChange={(e)=>setSelectedPresetId(e.target.value)} className="flex-1 bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none">
                  <option value="">Select preset...</option>
                  {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <button
                  onClick={async ()=>{
                    if (!selectedPresetId) { showToast('Select a preset', 'error'); return; }
                    const res = await fetch(`/api/presets/${selectedPresetId}`);
                    if (!res.ok) { showToast('Failed to load preset', 'error'); return; }
                    const preset: EffectPreset = await res.json();
                    const targets = [{ type:'virtual', id: virtual.id }];
                    let body: any;
                    if (preset.useLayers && preset.layers) {
                      body = {
                        targets,
                        layers: preset.layers.map(layer => ({
                          ...layer,
                          effect: {
                            ...layer.effect,
                            parameters: layer.effect.parameters.map(param => ({
                              ...param,
                              value: preset.layerParameters?.[`${layer.id}-${layer.effect.id}`]?.[param.name] ?? param.value
                            }))
                          }
                        })),
                        fps: 30
                      };
                    } else if (preset.effect) {
                      body = {
                        targets,
                        effect: {
                          ...preset.effect,
                          parameters: preset.effect.parameters.map(param => ({
                            ...param,
                            value: preset.parameters?.[param.name] ?? param.value
                          }))
                        },
                        fps: 30,
                        blendMode: 'overwrite'
                      };
                    } else { showToast('Invalid preset', 'error'); return; }
                    
                    // Check for conflicts
                    try {
                      const conflictResponse = await fetch('/api/stream/check-conflicts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targets })
                      });
                      
                      if (conflictResponse.ok) {
                        const conflictCheck = await conflictResponse.json();
                        if (conflictCheck.hasConflicts && conflictCheck.conflicts.length > 0) {
                          setConflictData(conflictCheck);
                          setPendingStreamConfig({ requestBody: body, targets });
                          setConflictModalOpen(true);
                          return;
                        }
                      }
                    } catch (error) {
                      console.error('Error checking conflicts:', error);
                    }
                    
                    const start = await fetch('/api/stream/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
                    if (!start.ok) { showToast('Failed to start stream', 'error'); } else { showToast('Streaming started', 'success'); }
                  }}
                  className="btn-primary"
                >Start</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select value={selectedEffectId} onChange={(e)=>setSelectedEffectId(e.target.value)} className="flex-1 bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none">
                  <option value="">Select effect...</option>
                  {effects.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
                </select>
                <button
                  onClick={async ()=>{
                    const eff = effects.find(e=>e.id===selectedEffectId);
                    if (!eff) { showToast('Select an effect', 'error'); return; }
                    const effectWithDefaults = { ...eff, parameters: eff.parameters.map(p => ({...p})) };
                    const targets = [{ type:'virtual', id: virtual.id }];
                    const body = {
                      targets,
                      effect: effectWithDefaults,
                      fps: 30,
                      blendMode: 'overwrite'
                    };
                    
                    // Check for conflicts
                    try {
                      const conflictResponse = await fetch('/api/stream/check-conflicts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ targets })
                      });
                      
                      if (conflictResponse.ok) {
                        const conflictCheck = await conflictResponse.json();
                        if (conflictCheck.hasConflicts && conflictCheck.conflicts.length > 0) {
                          setConflictData(conflictCheck);
                          setPendingStreamConfig({ requestBody: body, targets });
                          setConflictModalOpen(true);
                          return;
                        }
                      }
                    } catch (error) {
                      console.error('Error checking conflicts:', error);
                    }
                    
                    const start = await fetch('/api/stream/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
                    if (!start.ok) { showToast('Failed to start stream', 'error'); } else { showToast('Streaming started', 'success'); }
                  }}
                  className="btn-primary"
                >Start</button>
              </div>
            )}
          </div>
        )}
        {showPreview && (
          <div className="mt-4">
            <LEDPreviewCanvas height={60} width={400} onlyTargetId={virtual.id} />
          </div>
        )}
      </div>
      
      {/* Stream Conflict Modal */}
      <StreamConflictModal
        isOpen={conflictModalOpen}
        conflicts={conflictData?.conflicts || []}
        devices={devicesList}
        groups={groupsList}
        virtuals={virtualsList}
        onConfirm={async () => {
          if (!pendingStreamConfig) {
            setConflictModalOpen(false);
            return;
          }
          
          try {
            // Stop conflicting sessions
            if (conflictData?.conflicts) {
              for (const conflict of conflictData.conflicts) {
                try {
                  await fetch(`/api/stream/stop/${conflict.sessionId}`, { method: 'POST' });
                } catch (e) {
                  console.error('Error stopping conflicting session:', e);
                }
              }
            }
            
            // Start the new stream
            const response = await fetch('/api/stream/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(pendingStreamConfig.requestBody)
            });
            
            if (!response.ok) {
              showToast('Failed to start stream', 'error');
            } else {
              showToast('Streaming started', 'success');
            }
            
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
          } catch (error) {
            console.error('Error starting streaming after conflict resolution:', error);
            showToast('Failed to start streaming', 'error');
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
          }
        }}
        onCancel={() => {
          setConflictModalOpen(false);
          setPendingStreamConfig(null);
          setConflictData(null);
        }}
      />
    </motion.div>
  );
}



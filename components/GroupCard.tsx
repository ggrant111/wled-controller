'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Play, Pause, Settings, Users, Eye, Save, Zap } from 'lucide-react';
import { Group, Effect, EffectPreset } from '../types';
import LEDPreviewCanvas from './LEDPreviewCanvas';
import { useToast } from './ToastProvider';
import { useStreamIndicator } from '../hooks/useStreamIndicator';

interface GroupCardProps {
  group: Group;
  onEdit: () => void;
  onDelete: () => void;
  delay?: number;
}

export default function GroupCard({ group, onEdit, onDelete, delay = 0 }: GroupCardProps) {
  const { showToast } = useToast();
  const isReceiving = useStreamIndicator(group.id);
  const [showStreamControls, setShowStreamControls] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [mode, setMode] = useState<'preset' | 'effect'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [selectedEffectId, setSelectedEffectId] = useState<string>('');

  useEffect(() => {
    if (!showStreamControls) return;
    (async () => {
      try {
        const [effectsRes, presetsRes] = await Promise.all([
          fetch('/api/effects'),
          fetch('/api/presets')
        ]);
        if (effectsRes.ok) setEffects(await effectsRes.json());
        if (presetsRes.ok) setPresets(await presetsRes.json());
      } catch {}
    })();
  }, [showStreamControls]);

  const handlePlay = () => setShowStreamControls(v => !v);

  const handlePause = () => {
    fetch('/api/stream/stop-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { type: 'group', id: group.id } })
    }).then(res => { if (res.ok) showToast('Stopped streaming to group', 'success'); }).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-6 glass-card-hover"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold">{group.name}</h3>
          {isReceiving && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-primary-500/20 text-primary-400">Streaming</span>
          )}
          <p className="text-sm text-white/70">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs ${
            group.isStreaming ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
          }`}>
            {group.isStreaming ? 'Streaming' : 'Idle'}
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
          <button onClick={onEdit} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors" title="Group settings">
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
                    if (!selectedPresetId) { alert('Select a preset'); return; }
                    const res = await fetch(`/api/presets/${selectedPresetId}`);
                    if (!res.ok) { alert('Failed to load preset'); return; }
                    const preset: EffectPreset = await res.json();
                    let body: any;
                    if (preset.useLayers && preset.layers) {
                      body = {
                        targets: [{ type:'group', id: group.id }],
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
                        targets: [{ type:'group', id: group.id }],
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
                    } else { alert('Invalid preset'); return; }
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
                    if (!eff) { alert('Select an effect'); return; }
                    const effectWithDefaults = { ...eff, parameters: eff.parameters.map(p => ({...p})) };
                    const start = await fetch('/api/stream/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
                      targets:[{ type:'group', id: group.id }],
                      effect: effectWithDefaults,
                      fps: 30,
                      blendMode: 'overwrite'
                    }) });
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
            <LEDPreviewCanvas height={60} width={400} onlyTargetId={group.id} />
          </div>
        )}
      </div>
    </motion.div>
  );
}



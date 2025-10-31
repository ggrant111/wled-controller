'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Settings, Palette, Zap, Trash2, Layers, Save, Download } from 'lucide-react';
import { Effect, EffectParameter, EffectLayer, EffectPreset } from '../types';
import { useStreaming } from '../contexts/StreamingContext';
import { useSocket } from '../hooks/useSocket';
import { useToast } from './ToastProvider';
import { useModal } from './ModalProvider';
import LEDPreviewCanvas from './LEDPreviewCanvas';
import PaletteSelector from './PaletteSelector';
import LayerPanel from './LayerPanel';
import StreamConflictModal from './StreamConflictModal';
import { v4 as uuidv4 } from 'uuid';

interface EffectPanelProps {
  effects: Effect[];
  selectedEffect: Effect | null;
  onEffectSelect: (effect: Effect) => void;
  devices: any[];
  groups: any[];
  virtuals: any[];
  editingPresetId?: string;
  editingPreset?: EffectPreset | null;
}

export default function EffectPanel({ effects, selectedEffect, onEffectSelect, devices, groups, virtuals, editingPresetId, editingPreset }: EffectPanelProps) {
  const { isStreaming, setIsStreaming, streamingSessionId, setStreamingSessionId, lastStreamConfig, setLastStreamConfig, selectedTargets, setSelectedTargets } = useStreaming();
  const { emit } = useSocket();
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const [effectParameters, setEffectParameters] = useState<Map<string, Map<string, any>>>(new Map());
  const [activeEffect, setActiveEffect] = useState<Effect | null>(null);
  const [useLayers, setUseLayers] = useState(false);
  const [layers, setLayers] = useState<EffectLayer[]>([]);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [currentPresetId, setCurrentPresetId] = useState<string | undefined>(editingPresetId);
  const [presetLoaded, setPresetLoaded] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingStreamConfig, setPendingStreamConfig] = useState<{ targets: any[]; requestBody: any } | null>(null);
  const [conflictData, setConflictData] = useState<any>(null);

  // Load preset data when editing (wait for effects to be available)
  useEffect(() => {
    if (effects.length > 0 && !presetLoaded) {
      if (editingPreset) {
        loadPresetForEdit(editingPreset);
        setPresetLoaded(true);
      } else if (editingPresetId && !currentPresetId) {
        // Fallback: load by ID if preset object not provided
        loadPresetById(editingPresetId);
        setPresetLoaded(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPreset, editingPresetId, effects.length, presetLoaded]);

  const loadPresetById = async (presetId: string) => {
    try {
      const encodedPresetId = encodeURIComponent(presetId);
      const response = await fetch(`/api/presets/${encodedPresetId}`);
      if (!response.ok) throw new Error('Failed to load preset');
      const preset: EffectPreset = await response.json();
      loadPresetForEdit(preset);
    } catch (error) {
      console.error('Error loading preset for edit:', error);
    }
  };

  const loadPresetForEdit = (preset: EffectPreset) => {
    setCurrentPresetId(preset.id);
    setPresetName(preset.name);
    setPresetDescription(preset.description || '');
    
    if (preset.useLayers && preset.layers && preset.layers.length > 0) {
      // Load layered preset
      setUseLayers(true);
      
      // Load layers - need to match effects from available effects list
      const loadedLayers: EffectLayer[] = preset.layers.map(layer => {
        // Find matching effect from available effects
        const matchingEffect = effects.find(e => e.id === layer.effect.id);
        if (matchingEffect) {
          // Get saved parameters for this layer
          const layerParamKey = `${layer.id}-${layer.effect.id}`;
          const savedParams = preset.layerParameters?.[layerParamKey] || preset.layerParameters?.[layer.effect.id] || {};
          
          return {
            ...layer,
            effect: {
              ...matchingEffect,
              // Use saved parameter values from preset, fallback to layer's effect params, then defaults
              parameters: matchingEffect.parameters.map(param => ({
                ...param,
                value: savedParams[param.name] ?? layer.effect.parameters.find(p => p.name === param.name)?.value ?? param.value
              }))
            }
          };
        }
        // If effect not found, use the layer's effect as-is
        return layer;
      });
      
      setLayers(loadedLayers);
      
      // Load layer parameters into Map structure
      const newEffectParams = new Map(effectParameters);
      if (preset.layerParameters) {
        Object.entries(preset.layerParameters).forEach(([key, params]) => {
          const paramMap = new Map(Object.entries(params));
          newEffectParams.set(key, paramMap);
        });
      }
      
      // Also initialize parameters for layers that might not have saved params yet
      loadedLayers.forEach(layer => {
        const paramKey = `${layer.id}-${layer.effect.id}`;
        if (!newEffectParams.has(paramKey)) {
          // Initialize with default values from effect
          const layerParams = new Map();
          layer.effect.parameters.forEach(param => {
            layerParams.set(param.name, param.value);
          });
          newEffectParams.set(paramKey, layerParams);
        }
      });
      
      setEffectParameters(newEffectParams);
    } else if (preset.effect) {
      // Load single effect preset
      setUseLayers(false);
      const matchingEffect = effects.find(e => e.id === preset.effect?.id);
      if (matchingEffect) {
        const effectWithParams = {
          ...matchingEffect,
          parameters: matchingEffect.parameters.map(param => ({
            ...param,
            value: preset.parameters?.[param.name] ?? param.value
          }))
        };
        onEffectSelect(effectWithParams);
        
        // Load parameters into Map
        if (preset.parameters) {
          const paramMap = new Map(Object.entries(preset.parameters));
          const newEffectParams = new Map(effectParameters);
          newEffectParams.set(matchingEffect.id, paramMap);
          setEffectParameters(newEffectParams);
        }
      }
    }
  };
  // Debounce timers per parameter (single and layers)
  const paramDebounceTimers = useRef<Map<string, any>>(new Map());

  const clearDebounce = (key: string) => {
    const t = paramDebounceTimers.current.get(key);
    if (t) {
      clearTimeout(t);
      paramDebounceTimers.current.delete(key);
    }
  };

  const scheduleEmitParam = (key: string, payload: any, delayMs: number = 300) => {
    clearDebounce(key);
    const t = setTimeout(() => {
      emit('update-effect-parameter', payload);
      paramDebounceTimers.current.delete(key);
    }, delayMs);
    paramDebounceTimers.current.set(key, t);
  };

  // Get parameters for the current effect
  const parameters = selectedEffect ? (effectParameters.get(selectedEffect.id) || new Map()) : new Map();

  useEffect(() => {
    if (selectedEffect) {
      // Check if we already have parameters for this effect
      const existingParams = effectParameters.get(selectedEffect.id);
      
      if (!existingParams) {
        // Initialize with defaults
        const paramMap = new Map();
        selectedEffect.parameters.forEach(param => {
          paramMap.set(param.name, param.value);
        });
        const newEffectParams = new Map(effectParameters);
        newEffectParams.set(selectedEffect.id, paramMap);
        setEffectParameters(newEffectParams);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEffect]);

  const handleParameterChange = (paramName: string, value: any) => {
    if (!selectedEffect) return;
    
    const newParams = new Map(parameters);
    newParams.set(paramName, value);
    
    // Update the effect parameters map
    const newEffectParams = new Map(effectParameters);
    newEffectParams.set(selectedEffect.id, newParams);
    setEffectParameters(newEffectParams);
    
    // If streaming is active, emit with debounce for sliders/colors/palettes
    if (isStreaming && streamingSessionId) {
      // Detect parameter type from selectedEffect definition
      const def = selectedEffect.parameters.find(p => p.name === paramName);
      const type = def?.type;
      const debouncedTypes = new Set(['range', 'number', 'color', 'array', 'palette']);
      const key = `${selectedEffect.id}:${paramName}`;
      const payload = {
        sessionId: streamingSessionId,
        parameterName: paramName,
        value: value
      };
      if (debouncedTypes.has(type as string)) {
        scheduleEmitParam(key, payload, 300);
      } else {
        clearDebounce(key);
        emit('update-effect-parameter', payload);
      }
    }
    
    console.log('Parameter updated:', paramName, value);
  };

  // Initialize layers when useLayers is enabled (but not if we're loading a preset)
  useEffect(() => {
    if (useLayers && layers.length === 0 && selectedEffect && !currentPresetId) {
      // Only auto-initialize if we're not editing a preset
      const layerId = uuidv4();
      const initialLayer: EffectLayer = {
        id: layerId,
        effect: { ...selectedEffect },
        blendMode: 'normal',
        opacity: 1.0,
        enabled: true,
        name: `${selectedEffect.name} Layer`
      };
      setLayers([initialLayer]);
      
      // Initialize parameters for the first layer
      const layerParams = new Map();
      selectedEffect.parameters.forEach(param => {
        layerParams.set(param.name, param.value);
      });
      const newEffectParams = new Map(effectParameters);
      newEffectParams.set(`${layerId}-${selectedEffect.id}`, layerParams);
      setEffectParameters(newEffectParams);
    }
  }, [useLayers, selectedEffect, currentPresetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartStreaming = async () => {
    if (!selectedEffect && (!useLayers || layers.length === 0)) return;
    
    try {
      setIsStreaming(true);
      
      if (selectedTargets.length === 0) {
        showToast('Please select at least one device to stream to.', 'error');
        setIsStreaming(false);
        return;
      }
      
      // Create targets array from selected targets (devices, groups, virtuals)
      const targets = selectedTargets.map(targetId => {
        if (targetId.startsWith('group-')) {
          return {
            type: 'group',
            id: targetId.replace('group-', '')
          };
        } else if (targetId.startsWith('virtual-')) {
          return {
            type: 'virtual',
            id: targetId.replace('virtual-', '')
          };
        } else {
          return {
            type: 'device',
            id: targetId
          };
        }
      });
      
      // Check for conflicts before starting stream
      let hasConflicts = false;
      let conflictCheck: any = null;
      
      try {
        const conflictResponse = await fetch('/api/stream/check-conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets })
        });
        
        if (conflictResponse.ok) {
          conflictCheck = await conflictResponse.json();
          console.log('Conflict check result:', conflictCheck);
          hasConflicts = conflictCheck.hasConflicts && conflictCheck.conflicts && conflictCheck.conflicts.length > 0;
        } else {
          console.warn('Conflict check failed:', conflictResponse.status, conflictResponse.statusText);
        }
      } catch (error) {
        console.error('Error checking conflicts:', error);
        // Continue without conflict check if it fails
      }
      
      let requestBody: any;
      if (useLayers && layers.length > 0) {
        // Use layers mode
        requestBody = {
          targets,
          layers: layers.map(layer => ({
            ...layer,
            effect: {
              ...layer.effect,
              parameters: layer.effect.parameters.map(param => {
                const layerParams = effectParameters.get(`${layer.id}-${layer.effect.id}`) || new Map();
                return {
                  ...param,
                  value: layerParams.get(param.name) ?? param.value
                };
              })
            }
          })),
          fps: 30,
          selectedTargets
        };
      } else if (selectedEffect) {
        // Legacy single effect mode
        const effectWithParams = {
          ...selectedEffect,
          parameters: selectedEffect.parameters.map(param => ({
            ...param,
            value: parameters.get(param.name) ?? param.value
          }))
        };
        requestBody = {
          targets,
          effect: effectWithParams,
          fps: 30,
          blendMode: 'overwrite',
          selectedTargets
        };
      } else {
        setIsStreaming(false);
        return;
      }
      
      if (hasConflicts) {
        // Show conflict modal
        console.log('Showing conflict modal with conflicts:', conflictCheck.conflicts);
        setConflictData(conflictCheck);
        setPendingStreamConfig({ targets, requestBody });
        setConflictModalOpen(true);
        setIsStreaming(false);
        return;
      }
      
      const response = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error('Failed to start streaming');
      }
      
      const session = await response.json();
      console.log('Streaming started:', session);
      
      // Store session info for parameter updates
      setStreamingSessionId(session.id);
      
      // Store last streaming configuration for restart from navbar
      setLastStreamConfig({
        targets,
        effect: useLayers ? undefined : requestBody.effect,
        layers: useLayers ? layers : undefined,
        fps: 30,
        blendMode: 'overwrite'
      });
    } catch (error) {
      console.error('Error starting streaming:', error);
      setIsStreaming(false);
      showToast('Failed to start streaming. Please try again.', 'error');
    }
  };

  const handleStopStreaming = async () => {
    try {
      setIsStreaming(false);
      setStreamingSessionId(null);
      setActiveEffect(null);
      
      // TODO: Send actual session ID
      await fetch('/api/stream/stop-all', {
        method: 'POST'
      });
      
      console.log('Streaming stopped');
    } catch (error) {
      console.error('Error stopping streaming:', error);
    }
  };

  const renderParameterControl = (param: EffectParameter) => {
    switch (param.type) {
      case 'color':
        return (
          <div key={param.name} className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-200">{param.name}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={parameters.get(param.name) || param.value}
                onChange={(e) => handleParameterChange(param.name, e.target.value)}
                className="w-10 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={parameters.get(param.name) || param.value}
                onChange={(e) => handleParameterChange(param.name, e.target.value)}
                className="input-field flex-1 font-mono text-sm"
              />
            </div>
          </div>
        );

      case 'range':
        return (
          <div key={param.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-200">{param.name}</label>
              <span className="text-sm text-primary-400 font-mono min-w-[60px] text-right">
                {parameters.get(param.name) ?? param.value}
              </span>
            </div>
            <input
              type="range"
              min={param.min || 0}
              max={param.max || 100}
              step={param.step || 1}
              value={parameters.get(param.name) ?? param.value}
              onChange={(e) => handleParameterChange(param.name, parseFloat(e.target.value))}
              onMouseUp={(e) => {
                // Emit immediately on release
                if (isStreaming && streamingSessionId) {
                  const key = `${selectedEffect?.id}:${param.name}`;
                  const payload = {
                    sessionId: streamingSessionId,
                    parameterName: param.name,
                    value: parseFloat((e.target as HTMLInputElement).value)
                  };
                  clearDebounce(key);
                  emit('update-effect-parameter', payload);
                }
              }}
              onTouchEnd={(e) => {
                if (isStreaming && streamingSessionId) {
                  const key = `${selectedEffect?.id}:${param.name}`;
                  const input = e.target as HTMLInputElement;
                  const payload = {
                    sessionId: streamingSessionId,
                    parameterName: param.name,
                    value: parseFloat(input.value)
                  };
                  clearDebounce(key);
                  emit('update-effect-parameter', payload);
                }
              }}
              className="slider w-full"
            />
          </div>
        );

      case 'number':
        return (
          <div key={param.name} className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-200">{param.name}</label>
            <input
              type="number"
              min={param.min}
              max={param.max}
              step={param.step}
              value={(() => {
                const v = parameters.has(param.name) ? parameters.get(param.name) : param.value;
                return v === undefined || v === null ? '' : v;
              })()}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  handleParameterChange(param.name, undefined);
                  return;
                }
                const parsed = parseFloat(raw);
                handleParameterChange(param.name, isNaN(parsed) ? undefined : parsed);
              }}
              className="input-field w-full"
            />
          </div>
        );

      case 'boolean':
        return (
          <div key={param.name} className="flex items-center justify-between py-1">
            <label className="text-sm font-medium text-gray-200">{param.name}</label>
            <button
              onClick={() => handleParameterChange(param.name, !(parameters.get(param.name) ?? param.value))}
              className={`w-12 h-6 rounded-full transition-colors ${
                parameters.get(param.name) ?? param.value
                  ? 'bg-primary-500'
                  : 'bg-white/20'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                parameters.get(param.name) ?? param.value
                  ? 'translate-x-6'
                  : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        );

      case 'options':
        return (
          <div key={param.name} className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-200">{param.name}</label>
            <div className="flex gap-2 flex-wrap">
              {param.options?.map((option) => (
                <button
                  key={option}
                  onClick={() => handleParameterChange(param.name, option)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    parameters.get(param.name) === option || (!parameters.has(param.name) && param.value === option)
                      ? 'bg-primary-500 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white/70'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 'array':
        if (param.isColorArray) {
          const colorArray = parameters.get(param.name) || param.value || [];
          return (
            <div key={param.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-200">{param.name}</label>
                <button
                  onClick={() => {
                    const newArray = [...colorArray, '#ff0000'];
                    handleParameterChange(param.name, newArray);
                  }}
                  className="btn-secondary text-xs px-2 py-1"
                >
                  Add Color
                </button>
              </div>
              <div className="space-y-1.5">
                {colorArray.map((color: string, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const newArray = [...colorArray];
                        newArray[index] = e.target.value;
                        handleParameterChange(param.name, newArray);
                      }}
                      className="w-10 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => {
                        const newArray = [...colorArray];
                        newArray[index] = e.target.value;
                        handleParameterChange(param.name, newArray);
                      }}
                      className="input-field flex-1 font-mono text-sm"
                    />
                    <button
                      onClick={() => {
                        const newArray = colorArray.filter((_: any, i: number) => i !== index);
                        handleParameterChange(param.name, newArray);
                      }}
                      className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                      disabled={colorArray.length <= 1}
                      title="Remove color"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return null;

      case 'palette':
        return (
          <div key={param.name} className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-200">{param.name}</label>
            <PaletteSelector
              value={parameters.get(param.name) || param.value || 'rainbow'}
              onChange={(paletteId) => handleParameterChange(param.name, paletteId)}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Effects List - Horizontal Scrollable Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-4 sm:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-bold">Effects</h2>
        </div>

        {/* Horizontal Scrollable Pills */}
        <div className="overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {effects.map((effect, index) => (
              <motion.button
                key={effect.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={async () => {
                  onEffectSelect(effect);
                  
                  // If streaming, update the effect in real-time
                  if (isStreaming && streamingSessionId && selectedTargets.length > 0) {
                    try {
                      // Get parameters for the new effect with current parameter values
                      const effectWithParams = {
                        ...effect,
                        parameters: effect.parameters.map(param => ({
                          ...param,
                          value: parameters.get(param.name) ?? param.value
                        }))
                      };
                      
                      setActiveEffect(effectWithParams);
                      
                      // Update the streaming session with new effect
                      await fetch('/api/stream/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          sessionId: streamingSessionId,
                          targets: lastStreamConfig?.targets || selectedTargets.map(targetId => {
                            if (targetId.startsWith('group-')) {
                              return { type: 'group', id: targetId.replace('group-', '') };
                            } else if (targetId.startsWith('virtual-')) {
                              return { type: 'virtual', id: targetId.replace('virtual-', '') };
                            } else {
                              return { type: 'device', id: targetId };
                            }
                          }),
                          effect: effectWithParams,
                          fps: 30,
                          blendMode: 'overwrite',
                          selectedTargets: selectedTargets
                        })
                      });
                    } catch (error) {
                      console.error('Failed to update effect:', error);
                    }
                  }
                }}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                  selectedEffect?.id === effect.id
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/50'
                    : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white'
                }`}
              >
                <span className="text-sm font-medium">{effect.name}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Target Selection - Horizontal Pills */}
      {(selectedEffect || (useLayers && layers.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary-500" />
            <h3 className="text-lg font-bold">Streaming Targets</h3>
          </div>

          {/* Horizontal Scrollable Pills */}
          <div className="space-y-4">
            {/* Devices */}
            {devices.length > 0 && (
              <div>
                <p className="text-xs text-white/50 uppercase mb-2">Devices</p>
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-2">
                    {devices.map((device, index) => (
                      <button
                        key={device.id}
                        onClick={() => {
                          if (selectedTargets.includes(device.id)) {
                            setSelectedTargets(selectedTargets.filter(id => id !== device.id));
                          } else {
                            setSelectedTargets([...selectedTargets, device.id]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-all ${
                          selectedTargets.includes(device.id)
                            ? 'bg-primary-500 text-white shadow-lg'
                            : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }`}
                      >
                        {device.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Groups */}
            {groups.length > 0 && (
              <div>
                <p className="text-xs text-white/50 uppercase mb-2">Groups</p>
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-2">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          const groupId = `group-${group.id}`;
                          if (selectedTargets.includes(groupId)) {
                            setSelectedTargets(selectedTargets.filter(id => id !== groupId));
                          } else {
                            setSelectedTargets([...selectedTargets, groupId]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-all ${
                          selectedTargets.includes(`group-${group.id}`)
                            ? 'bg-primary-500 text-white shadow-lg'
                            : 'bg-white/10 hover:bg-white/20 text-white/70'
                        }`}
                      >
                        {group.name} ({group.members?.length || 0})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Virtual Devices */}
            {virtuals.length > 0 && (
              <div>
                <p className="text-xs text-white/50 uppercase mb-2">Virtuals</p>
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                  <div className="flex gap-2">
                    {virtuals.map((virtual) => {
                      const virtualId = `virtual-${virtual.id}`;
                      const isSelected = selectedTargets.includes(virtualId);
                      
                      // Check for overlapping LED ranges with other selected virtuals
                      const hasOverlap = selectedTargets.some(targetId => {
                        if (!targetId.startsWith('virtual-') || targetId === virtualId) return false;
                        const otherVirtualId = targetId.replace('virtual-', '');
                        const otherVirtual = virtuals.find(v => v.id === otherVirtualId);
                        if (!otherVirtual?.ledRanges || !virtual.ledRanges) return false;
                        
                        // Check if they share any LED ranges on the same device
                        for (const range1 of virtual.ledRanges) {
                          for (const range2 of otherVirtual.ledRanges) {
                            if (range1.deviceId === range2.deviceId) {
                              // Check if ranges overlap
                              if (!(range1.endLed < range2.startLed || range1.startLed > range2.endLed)) {
                                return true;
                              }
                            }
                          }
                        }
                        return false;
                      });
                      
                      return (
                        <button
                          key={virtual.id}
                          onClick={() => {
                            if (selectedTargets.includes(virtualId)) {
                              setSelectedTargets(selectedTargets.filter(id => id !== virtualId));
                            } else {
                              if (hasOverlap) {
                                showConfirm({
                                  message: 'Warning: This virtual device has overlapping LEDs with another selected virtual device. This may cause flashing/fighting effects. Continue anyway?',
                                  title: 'Virtual Device Overlap',
                                  variant: 'warning',
                                  confirmText: 'Continue',
                                  cancelText: 'Cancel',
                                  onConfirm: () => {
                                    setSelectedTargets([...selectedTargets, virtualId]);
                                  }
                                });
                                return;
                              }
                              setSelectedTargets([...selectedTargets, virtualId]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-all ${
                            isSelected
                              ? hasOverlap 
                                ? 'bg-yellow-500 text-black shadow-lg'
                                : 'bg-primary-500 text-white shadow-lg'
                              : 'bg-white/10 hover:bg-white/20 text-white/70'
                          }`}
                          title={isSelected && hasOverlap ? 'Warning: Overlapping LEDs detected' : ''}
                        >
                          {virtual.name} ({virtual.ledRanges?.length || 0} ranges)
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Save Preset Button & Layers Mode Toggle */}
      {(selectedEffect || (useLayers && layers.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-4 sm:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary-500" />
              <h3 className="text-lg font-bold">Effect Mode</h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSavePresetModal(true)}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                title="Save current effect configuration as preset"
              >
                <Save className="w-4 h-4" />
                Save as Preset
              </button>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-gray-300">Single</span>
                <button
                  onClick={() => setUseLayers(!useLayers)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    useLayers ? 'bg-primary-500' : 'bg-white/20'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    useLayers ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-gray-300">Layers</span>
              </label>
            </div>
          </div>
        </motion.div>
      )}

      {/* Layer Panel */}
      {useLayers && layers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 sm:p-6"
        >
          <LayerPanel
            layers={layers}
            onLayersChange={setLayers}
            availableEffects={effects}
            onLayerEffectSelect={(layerId, effect) => {
              // Initialize parameters for the new effect
              const layerParams = new Map();
              effect.parameters.forEach(param => {
                layerParams.set(param.name, param.value);
              });
              const newEffectParams = new Map(effectParameters);
              newEffectParams.set(`${layerId}-${effect.id}`, layerParams);
              setEffectParameters(newEffectParams);
              
              // Update the layer with the new effect (only if layer exists)
              // When adding a new layer, the layer already has the effect, so this is mainly for effect changes
              const layerExists = layers.some(l => l.id === layerId);
              if (layerExists) {
                const updatedLayers = layers.map(l => 
                  l.id === layerId ? { ...l, effect: { ...effect } } : l
                );
                setLayers(updatedLayers);
              }
            }}
            onLayerParameterChange={(layerId, paramName, value) => {
              const layer = layers.find(l => l.id === layerId);
              if (!layer) return;
              
              // Update parameter map
              const paramKey = `${layerId}-${layer.effect.id}`;
              const layerParams = effectParameters.get(paramKey) || new Map();
              layerParams.set(paramName, value);
              const newEffectParams = new Map(effectParameters);
              newEffectParams.set(paramKey, layerParams);
              setEffectParameters(newEffectParams);
              
              // Update the layer's effect parameters
              const updatedLayers = layers.map(l => 
                l.id === layerId
                  ? {
                      ...l,
                      effect: {
                        ...l.effect,
                        parameters: l.effect.parameters.map(p =>
                          p.name === paramName ? { ...p, value } : p
                        )
                      }
                    }
                  : l
              );
              setLayers(updatedLayers);
              
              // Hot-reload if streaming
              if (isStreaming && streamingSessionId) {
                // Detect param type from layer effect definition
                const def = layer.effect.parameters.find(p => p.name === paramName);
                const type = def?.type;
                const debouncedTypes = new Set(['range', 'number', 'color', 'array', 'palette']);
                const key = `${layerId}:${paramName}`;
                const payload = {
                  sessionId: streamingSessionId,
                  layerId: layerId,
                  parameterName: paramName,
                  value: value
                };
                if (debouncedTypes.has(type as string)) {
                  scheduleEmitParam(key, payload, 300);
                } else {
                  clearDebounce(key);
                  emit('update-effect-parameter', payload);
                }
              }
            }}
            onLayerPropertyChange={(layerId, property, value) => {
              // Hot-reload layer properties during streaming
              if (isStreaming && streamingSessionId) {
                emit('update-layer-property', {
                  sessionId: streamingSessionId,
                  layerId: layerId,
                  property: property,
                  value: value
                });
                console.log(`Hot-reloaded layer ${layerId} ${property} =`, value);
              }
            }}
            layerParameters={effectParameters}
            isStreaming={isStreaming}
            streamingSessionId={streamingSessionId}
          />
        </motion.div>
      )}

      {/* Effect Parameters (Single Effect Mode) */}
      {selectedEffect && !useLayers && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-primary-500" />
            <h3 className="text-lg font-bold">Parameters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedEffect.parameters.map(renderParameterControl)}
          </div>
        </motion.div>
      )}

      {/* Streaming Controls */}
      {(selectedEffect || (useLayers && layers.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-4 sm:p-6 z-index-10"
        >
          <div className="flex items-center gap-3">
            {!isStreaming ? (
              <button
                onClick={handleStartStreaming}
                className="btn-primary flex items-center gap-2 flex-1"
              >
                <Play className="h-4 w-4" />
                Start Streaming
              </button>
            ) : (
              <>
                <button
                  onClick={handleStopStreaming}
                  className="btn-secondary flex items-center gap-2 flex-1"
                >
                  <Pause className="h-4 w-4" />
                  Stop Streaming
                </button>
                <button
                  onClick={handleStartStreaming}
                  className="btn-primary flex items-center gap-2 flex-1"
                  title="Start a new stream with the current selection while keeping existing streams running"
                >
                  <Play className="h-4 w-4" />
                  Start New Stream
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Live Preview */}
      {(selectedEffect || (useLayers && layers.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <h3 className="text-lg font-bold mb-4">Live Preview</h3>
          <LEDPreviewCanvas 
            effect={useLayers ? null : selectedEffect}
            parameters={useLayers ? undefined : parameters}
            layers={useLayers ? layers : undefined}
            layerParameters={useLayers ? effectParameters : undefined}
            ledCount={100}
            width={600}
            height={80}
          />
        </motion.div>
      )}

      {/* Stream Conflict Modal */}
      <StreamConflictModal
        isOpen={conflictModalOpen}
        conflicts={conflictData?.conflicts || []}
        devices={devices.map(d => ({ id: d.id, name: d.name }))}
        groups={groups.map(g => ({ id: g.id, name: g.name }))}
        virtuals={virtuals.map(v => ({ id: v.id, name: v.name }))}
        targetDeviceId={
          pendingStreamConfig?.targets?.length === 1 && 
          pendingStreamConfig.targets[0]?.type === 'device' 
            ? pendingStreamConfig.targets[0].id 
            : undefined
        }
        onPartialStop={async (deviceId) => {
          if (!pendingStreamConfig || !conflictData?.conflicts?.[0]) {
            setConflictModalOpen(false);
            return;
          }
          
          try {
            // Exclude this device from the conflicting group/virtual stream
            const conflict = conflictData.conflicts[0];
            await fetch('/api/stream/exclude-device', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                sessionId: conflict.sessionId,
                deviceId: deviceId
              })
            });
            
            // Start the new stream
            const response = await fetch('/api/stream/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(pendingStreamConfig.requestBody)
            });
            
            if (!response.ok) {
              throw new Error('Failed to start streaming');
            }
            
            const session = await response.json();
            console.log('Streaming started:', session);
            
            setStreamingSessionId(session.id);
            setLastStreamConfig({
              targets: pendingStreamConfig.targets,
              effect: useLayers ? undefined : pendingStreamConfig.requestBody.effect,
              layers: useLayers ? layers : undefined,
              fps: 30,
              blendMode: 'overwrite'
            });
            
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
          } catch (error) {
            console.error('Error starting streaming after partial stop:', error);
            setIsStreaming(false);
            showToast('Failed to start streaming. Please try again.', 'error');
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
          }
        }}
        onConfirm={async () => {
          if (!pendingStreamConfig) {
            setConflictModalOpen(false);
            return;
          }
          
          try {
            setIsStreaming(true);
            
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
              throw new Error('Failed to start streaming');
            }
            
            const session = await response.json();
            console.log('Streaming started:', session);
            
            setStreamingSessionId(session.id);
            setLastStreamConfig({
              targets: pendingStreamConfig.targets,
              effect: useLayers ? undefined : pendingStreamConfig.requestBody.effect,
              layers: useLayers ? layers : undefined,
              fps: 30,
              blendMode: 'overwrite'
            });
            
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
          } catch (error) {
            console.error('Error starting streaming after conflict resolution:', error);
            setIsStreaming(false);
            showToast('Failed to start streaming. Please try again.', 'error');
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

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold mb-4">
              {currentPresetId ? 'Update Effect Preset' : 'Save Effect Preset'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Preset Name *</label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Enter preset name"
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowSavePresetModal(false);
                    setPresetName('');
                    setPresetDescription('');
                    setCurrentPresetId(undefined);
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!presetName.trim()) {
                      showToast('Please enter a preset name', 'error');
                      return;
                    }

                    try {
                      // Prepare preset data
                      const presetData: any = {
                        name: presetName.trim(),
                        description: presetDescription.trim() || '',
                        useLayers: useLayers
                      };

                      if (useLayers && layers.length > 0) {
                        presetData.layers = layers;
                        // Convert layerParameters Map to plain object
                        const layerParamsObj: Record<string, Record<string, any>> = {};
                        effectParameters.forEach((params, key) => {
                          layerParamsObj[key] = Object.fromEntries(params);
                        });
                        presetData.layerParameters = layerParamsObj;
                      } else if (selectedEffect) {
                        presetData.effect = selectedEffect;
                        presetData.parameters = Object.fromEntries(parameters);
                      }

                      const url = currentPresetId 
                        ? `/api/presets/${encodeURIComponent(currentPresetId)}`
                        : '/api/presets';
                      const method = currentPresetId ? 'PUT' : 'POST';

                      const response = await fetch(url, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(presetData)
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || `Failed to ${currentPresetId ? 'update' : 'save'} preset`);
                      }

                      const savedPreset = await response.json();
                      showToast(`Preset "${savedPreset.name}" ${currentPresetId ? 'updated' : 'saved'} successfully!`, 'success');
                      setShowSavePresetModal(false);
                      setPresetName('');
                      setPresetDescription('');
                      setCurrentPresetId(undefined);
                      
                      // If updating, reload the page or navigate back to presets
                      if (currentPresetId) {
                        window.location.href = '/presets';
                      }
                    } catch (error: any) {
                      console.error(`Error ${currentPresetId ? 'updating' : 'saving'} preset:`, error);
                      showToast(error.message || `Failed to ${currentPresetId ? 'update' : 'save'} preset`, 'error');
                    }
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  {currentPresetId ? 'Update Preset' : 'Save Preset'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

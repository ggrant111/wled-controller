'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  ChevronUp, 
  ChevronDown,
  GripVertical,
  Info,
  Layers,
  Settings
} from 'lucide-react';
import { Effect, EffectLayer, BLEND_MODES, EffectParameter } from '../types';
import { v4 as uuidv4 } from 'uuid';
import PaletteSelector from './PaletteSelector';

interface LayerPanelProps {
  layers: EffectLayer[];
  onLayersChange: (layers: EffectLayer[]) => void;
  availableEffects: Effect[];
  onLayerEffectSelect: (layerId: string, effect: Effect) => void;
  onLayerParameterChange?: (layerId: string, paramName: string, value: any) => void;
  onLayerPropertyChange?: (layerId: string, property: 'blendMode' | 'opacity' | 'enabled', value: any) => void;
  layerParameters?: Map<string, Map<string, any>>; // Map<layerId-effectId, Map<paramName, value>>
  isStreaming?: boolean;
  streamingSessionId?: string | null;
}

export default function LayerPanel({
  layers,
  onLayersChange,
  availableEffects,
  onLayerEffectSelect,
  onLayerParameterChange,
  onLayerPropertyChange,
  layerParameters = new Map(),
  isStreaming = false,
  streamingSessionId = null
}: LayerPanelProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(layers.length > 0 ? layers[0].id : null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(layers.length > 0 ? layers[0].id : null);

  // Sync expandedLayer when layers change
  useEffect(() => {
    if (layers.length > 0 && !expandedLayer) {
      setExpandedLayer(layers[0].id);
      setSelectedLayerId(layers[0].id);
    } else if (layers.length === 0) {
      setExpandedLayer(null);
      setSelectedLayerId(null);
    }
  }, [layers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLayer = () => {
    console.log('addLayer called', { availableEffectsLength: availableEffects.length, layersLength: layers.length });
    
    if (availableEffects.length === 0) {
      console.warn('No effects available to add as layer');
      return;
    }
    
    const defaultEffect = availableEffects[0];
    const layerId = uuidv4();
    const newLayer: EffectLayer = {
      id: layerId,
      effect: { ...defaultEffect },
      blendMode: 'normal',
      opacity: 1.0,
      enabled: true,
      name: `${defaultEffect.name} Layer`
    };
    
    const newLayers = [...layers, newLayer];
    console.log('Adding layer', { layerId, newLayersLength: newLayers.length, effectName: defaultEffect.name });
    
    // Call the parent's onLayersChange to update state
    onLayersChange(newLayers);
    
    // Update local UI state
    setExpandedLayer(newLayer.id);
    setSelectedLayerId(newLayer.id);
    
    // Initialize parameters for the new layer
    // Use setTimeout to ensure parent state is updated first
    setTimeout(() => {
      onLayerEffectSelect?.(layerId, defaultEffect);
    }, 0);
  };

  const removeLayer = (layerId: string) => {
    const newLayers = layers.filter(l => l.id !== layerId);
    onLayersChange(newLayers);
    if (selectedLayerId === layerId) {
      setSelectedLayerId(newLayers.length > 0 ? newLayers[0].id : null);
    }
  };

  const updateLayer = (layerId: string, updates: Partial<EffectLayer>) => {
    const newLayers = layers.map(l => 
      l.id === layerId ? { ...l, ...updates } : l
    );
    onLayersChange(newLayers);
    
    // Hot-reload layer properties during streaming
    if (isStreaming && streamingSessionId) {
      // Check if this is a hot-reloadable property
      if (updates.blendMode !== undefined || updates.opacity !== undefined || updates.enabled !== undefined) {
        // Emit layer property update via callback (will be handled by EffectPanel)
        const property = updates.blendMode !== undefined ? 'blendMode' :
                         updates.opacity !== undefined ? 'opacity' : 'enabled';
        const value = updates[property as keyof EffectLayer];
        onLayerPropertyChange?.(layerId, property, value);
      }
    }
  };

  const moveLayer = (layerId: string, direction: 'up' | 'down') => {
    const index = layers.findIndex(l => l.id === layerId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= layers.length) return;
    
    const newLayers = [...layers];
    [newLayers[index], newLayers[newIndex]] = [newLayers[newIndex], newLayers[index]];
    onLayersChange(newLayers);
  };

  const toggleLayerExpanded = (layerId: string) => {
    setExpandedLayer(expandedLayer === layerId ? null : layerId);
  };

  const getEffectForLayer = (layer: EffectLayer): Effect | undefined => {
    return availableEffects.find(e => e.type === layer.effect.type);
  };

  const getLayerParameters = (layer: EffectLayer): Map<string, any> => {
    const paramKey = `${layer.id}-${layer.effect.id}`;
    return layerParameters.get(paramKey) || new Map();
  };

  const handleLayerParameterChange = (layerId: string, paramName: string, value: any) => {
    onLayerParameterChange?.(layerId, paramName, value);
  };

  const renderParameterControl = (layer: EffectLayer, param: EffectParameter) => {
    const layerParams = getLayerParameters(layer);
    const paramValue = layerParams.get(param.name) ?? param.value;

    switch (param.type) {
      case 'color':
        return (
          <div key={param.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{param.name}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={paramValue}
                onChange={(e) => handleLayerParameterChange(layer.id, param.name, e.target.value)}
                className="w-12 h-8 rounded border border-gray-600 bg-gray-700"
              />
              <input
                type="text"
                value={paramValue}
                onChange={(e) => handleLayerParameterChange(layer.id, param.name, e.target.value)}
                className="bg-gray-700 text-gray-200 px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none flex-1 font-mono text-sm"
              />
            </div>
          </div>
        );

      case 'range':
        return (
          <div key={param.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              {param.name}: {paramValue}
            </label>
            <input
              type="range"
              min={param.min || 0}
              max={param.max || 100}
              step={param.step || 1}
              value={paramValue}
              onChange={(e) => handleLayerParameterChange(layer.id, param.name, parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        );

      case 'number':
        return (
          <div key={param.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{param.name}</label>
            <input
              type="number"
              min={param.min}
              max={param.max}
              step={param.step}
              value={paramValue}
              onChange={(e) => handleLayerParameterChange(layer.id, param.name, parseFloat(e.target.value))}
              className="bg-gray-700 text-gray-200 px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none w-full"
            />
          </div>
        );

      case 'boolean':
        return (
          <div key={param.name} className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">{param.name}</label>
            <button
              onClick={() => handleLayerParameterChange(layer.id, param.name, !paramValue)}
              className={`w-12 h-6 rounded-full transition-colors ${
                paramValue ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                paramValue ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        );

      case 'options':
        return (
          <div key={param.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{param.name}</label>
            <div className="flex gap-2 flex-wrap">
              {param.options?.map((option) => (
                <button
                  key={option}
                  onClick={() => handleLayerParameterChange(layer.id, param.name, option)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    paramValue === option || (!layerParams.has(param.name) && param.value === option)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
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
          const colorArray = Array.isArray(paramValue) ? paramValue : param.value || [];
          return (
            <div key={param.name} className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-300">{param.name}</label>
                <button
                  onClick={() => {
                    const newArray = [...colorArray, '#ff0000'];
                    handleLayerParameterChange(layer.id, param.name, newArray);
                  }}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  Add Color
                </button>
              </div>
              <div className="space-y-2">
                {colorArray.map((color: string, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const newArray = [...colorArray];
                        newArray[index] = e.target.value;
                        handleLayerParameterChange(layer.id, param.name, newArray);
                      }}
                      className="w-12 h-8 rounded border border-gray-600 bg-gray-700"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => {
                        const newArray = [...colorArray];
                        newArray[index] = e.target.value;
                        handleLayerParameterChange(layer.id, param.name, newArray);
                      }}
                      className="bg-gray-700 text-gray-200 px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none flex-1 font-mono text-sm"
                    />
                    <button
                      onClick={() => {
                        const newArray = colorArray.filter((_: any, i: number) => i !== index);
                        handleLayerParameterChange(layer.id, param.name, newArray);
                      }}
                      className="p-1.5 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                      disabled={colorArray.length <= 1}
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
          <div key={param.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{param.name}</label>
            <PaletteSelector
              value={paramValue || param.value || 'rainbow'}
              onChange={(paletteId) => handleLayerParameterChange(layer.id, param.name, paletteId)}
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (layers.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
        <Layers className="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-300 mb-2">No Layers</h3>
        <p className="text-gray-400 mb-4">Add layers to create complex blended effects</p>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addLayer();
          }}
          type="button"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 inline mr-2" />
          Add First Layer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-200">Effect Layers</h3>
          <span className="text-sm text-gray-400">({layers.length})</span>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            addLayer();
          }}
          type="button"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Layer
        </button>
      </div>

      <div className="space-y-2">
        {layers.map((layer, index) => {
          const effect = getEffectForLayer(layer);
          const isExpanded = expandedLayer === layer.id;
          
          return (
            <motion.div
              key={layer.id}
              initial={false}
              className={`bg-gray-800 rounded-lg border ${
                selectedLayerId === layer.id 
                  ? 'border-blue-500 ring-2 ring-blue-500/20' 
                  : 'border-gray-700'
              } transition-all`}
            >
              {/* Layer Header */}
              <div 
                className="p-4 cursor-pointer"
                onClick={() => {
                  setSelectedLayerId(layer.id);
                  toggleLayerExpanded(layer.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <GripVertical className="w-5 h-5 text-gray-500" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded">
                        Layer {index + 1}
                      </span>
                      <input
                        type="text"
                        value={layer.name || `${effect?.name || 'Effect'} Layer`}
                        onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-700 text-gray-200 px-2 py-1 rounded text-sm flex-1 max-w-xs border border-gray-600 focus:border-blue-500 focus:outline-none"
                        placeholder="Layer name..."
                      />
                    </div>
                    <span className="text-sm text-gray-400">
                      {effect?.name || 'Unknown Effect'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Layer Controls */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(layer.id, { enabled: !layer.enabled });
                      }}
                      className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${
                        layer.enabled ? 'text-green-400' : 'text-gray-500'
                      }`}
                      title={layer.enabled ? 'Disable layer' : 'Enable layer'}
                    >
                      {layer.enabled ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, 'up');
                      }}
                      disabled={index === 0}
                      className="p-1.5 rounded hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayer(layer.id, 'down');
                      }}
                      disabled={index === layers.length - 1}
                      className="p-1.5 rounded hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-gray-400"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Remove this layer?')) {
                          removeLayer(layer.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-red-900/30 text-red-400 transition-colors"
                      title="Remove layer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerExpanded(layer.id);
                      }}
                      className="p-1.5 rounded hover:bg-gray-700 transition-colors text-gray-400"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Layer Details (Expanded) */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-700 mt-2 pt-4">
                      {/* Blend Mode Selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                          Blend Mode
                          <div className="group relative">
                            <Info className="w-4 h-4 text-gray-400 cursor-help" />
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg z-10">
                              The blend mode determines how this layer combines with layers below it.
                            </div>
                          </div>
                        </label>
                        <select
                          value={layer.blendMode}
                          onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as any })}
                          className="w-full bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                        >
                          {BLEND_MODES.map(mode => (
                            <option key={mode.value} value={mode.value}>
                              {mode.name} - {mode.description}
                            </option>
                          ))}
                        </select>
                        {BLEND_MODES.find(m => m.value === layer.blendMode) && (
                          <p className="text-xs text-gray-400 mt-1">
                            {BLEND_MODES.find(m => m.value === layer.blendMode)?.description}
                          </p>
                        )}
                      </div>

                      {/* Opacity Slider */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Opacity: {Math.round(layer.opacity * 100)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={layer.opacity * 100}
                          onChange={(e) => updateLayer(layer.id, { opacity: parseFloat(e.target.value) / 100 })}
                          className="w-full"
                        />
                      </div>

                      {/* Effect Selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Effect
                        </label>
                        <select
                          value={layer.effect.type}
                          onChange={(e) => {
                            const newEffect = availableEffects.find(ef => ef.type === e.target.value);
                            if (newEffect) {
                              updateLayer(layer.id, { 
                                effect: { ...newEffect },
                                name: `${newEffect.name} Layer`
                              });
                              onLayerEffectSelect?.(layer.id, newEffect);
                            }
                          }}
                          className="w-full bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                        >
                          {availableEffects.map(effect => (
                            <option key={effect.id} value={effect.type}>
                              {effect.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Effect Parameters */}
                      {effect && effect.parameters && effect.parameters.length > 0 && (
                        <div className="border-t border-gray-700 pt-4 mt-4">
                          <h4 className="text-sm font-semibold text-gray-300 mb-3">Effect Parameters</h4>
                          <div className="space-y-4">
                            {effect.parameters.map(param => renderParameterControl(layer, param))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400 border border-gray-700 mt-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-300 mb-1">About Layers</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Layers are blended from bottom to top (first to last)</li>
              <li>Use blend modes to control how layers combine</li>
              <li>Adjust opacity to fine-tune each layer's intensity</li>
              <li>Reorder layers by moving them up or down</li>
              <li>Disable layers temporarily without removing them</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


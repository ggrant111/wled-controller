'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Play, Pause } from 'lucide-react';
import EffectPanel from '../../components/EffectPanel';
import { useStreaming } from '../../contexts/StreamingContext';
import { useToast } from '../../components/ToastProvider';
import { Effect, WLEDDevice, Group, VirtualDevice, EffectPreset } from '../../types';
import { useSearchParams } from 'next/navigation';

export default function EffectsPage() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [effects, setEffects] = useState<Effect[]>([]);
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [selectedEffect, setSelectedEffect] = useState<Effect | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPresetId, setEditingPresetId] = useState<string | undefined>(undefined);
  const [editingPreset, setEditingPreset] = useState<EffectPreset | null>(null);
  
  const { currentSession, isStreaming } = useStreaming();

  useEffect(() => {
    loadData();
  }, []);

  // Load preset from URL query param
  useEffect(() => {
    const presetId = searchParams?.get('preset');
    const isEdit = searchParams?.get('edit') === 'true';
    
    if (presetId && effects.length > 0) {
      console.log('Loading preset with ID:', presetId, 'edit mode:', isEdit);
      setEditingPresetId(isEdit ? presetId : undefined);
      loadPreset(presetId, isEdit);
    }
  }, [searchParams, effects]);

  const loadPreset = async (presetId: string, isEdit: boolean = false) => {
    try {
      // URL encode the preset ID in case it has special characters
      const encodedPresetId = encodeURIComponent(presetId);
      const url = `/api/presets/${encodedPresetId}`;
      console.log('Fetching preset:', url);
      console.log('Original preset ID:', presetId);
      
      const response = await fetch(url);
      
      console.log('Response status:', response.status, response.statusText);
      console.log('Response URL:', response.url);
      
      if (!response.ok) {
        let errorMessage = 'Unknown error';
        try {
          const errorText = await response.text();
          console.log('Error response body:', errorText);
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        console.error('Failed to load preset:', errorMessage);
        showToast(`Failed to load preset: ${errorMessage}`, 'error');
        return;
      }

      const preset: EffectPreset = await response.json();
      console.log('Loaded preset:', preset);
      
      // Store preset for EffectPanel to load
      if (isEdit) {
        setEditingPreset(preset);
      }
      
      // Convert plain objects back to Maps for component state
      if (preset.useLayers && preset.layers) {
        // Load layers mode - EffectPanel will handle loading the layers
        console.log('Loading preset with layers:', preset);
        // Don't show alert anymore - we'll support it now
      } else if (preset.effect) {
        // Load single effect mode
        const matchingEffect = effects.find(e => e.id === preset.effect?.id);
        if (matchingEffect) {
          // Update effect with preset parameters
          const effectWithParams = {
            ...matchingEffect,
            parameters: matchingEffect.parameters.map(param => ({
              ...param,
              value: preset.parameters?.[param.name] ?? param.value
            }))
          };
          setSelectedEffect(effectWithParams);
        } else {
          console.error('Effect not found for preset:', preset.effect.id);
          showToast('Effect not found. The preset may reference a removed effect.', 'error');
        }
      } else {
        console.error('Invalid preset: no effect or layers');
        showToast('Invalid preset format', 'error');
      }
    } catch (error: any) {
      console.error('Error loading preset:', error);
      showToast(`Error loading preset: ${error.message || 'Unknown error'}`, 'error');
    }
  };

  // Sync selected effect with active streaming session
  useEffect(() => {
    if (currentSession && currentSession.effect) {
      const sessionEffect = effects.find(e => e.id === currentSession.effect.id);
      if (sessionEffect) {
        setSelectedEffect({
          ...sessionEffect,
          parameters: currentSession.effect.parameters
        });
      }
    }
  }, [currentSession, effects, isStreaming]);

  const loadData = async () => {
    try {
      const [effectsRes, devicesRes, groupsRes, virtualsRes] = await Promise.all([
        fetch('/api/effects'),
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals')
      ]);

      setEffects(await effectsRes.json());
      setDevices(await devicesRes.json());
      setGroups(await groupsRes.json());
      setVirtuals(await virtualsRes.json());
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading effects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold mb-2">Effects</h1>
          <p className="text-white/70">Control your LED effects in real-time</p>
        </div>
      </motion.div>

      {/* Effects Panel */}
      <EffectPanel
        effects={effects}
        selectedEffect={selectedEffect}
        onEffectSelect={setSelectedEffect}
        devices={devices}
        groups={groups}
        virtuals={virtuals}
        editingPresetId={editingPresetId}
        editingPreset={editingPreset}
      />
    </div>
  );
}


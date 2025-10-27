'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Play, Pause } from 'lucide-react';
import EffectPanel from '../../components/EffectPanel';
import { useStreaming } from '../../contexts/StreamingContext';
import { Effect, WLEDDevice, Group, VirtualDevice } from '../../types';

export default function EffectsPage() {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [selectedEffect, setSelectedEffect] = useState<Effect | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { currentSession, isStreaming } = useStreaming();

  useEffect(() => {
    loadData();
  }, []);

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
      />
    </div>
  );
}


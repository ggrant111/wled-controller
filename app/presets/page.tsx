'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Trash2, Play, Edit3, Layers, Zap } from 'lucide-react';
import { EffectPreset, WLEDDevice, Group, VirtualDevice } from '../../types';
import { useRouter } from 'next/navigation';
import PresetStreamModal from '../../components/PresetStreamModal';

export default function PresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<EffectPreset | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showStreamModal, setShowStreamModal] = useState(false);

  useEffect(() => {
    loadPresets();
    // Load targets (devices, groups, virtuals) for streaming
    (async () => {
      try {
        const [devicesRes, groupsRes, virtualsRes] = await Promise.all([
          fetch('/api/devices'),
          fetch('/api/groups'),
          fetch('/api/virtuals')
        ]);
        if (devicesRes.ok) setDevices(await devicesRes.json());
        if (groupsRes.ok) setGroups(await groupsRes.json());
        if (virtualsRes.ok) setVirtuals(await virtualsRes.json());
      } catch (e) {
        console.error('Failed to load targets:', e);
      }
    })();
  }, []);

  const loadPresets = async () => {
    try {
      const response = await fetch('/api/presets');
      if (!response.ok) throw new Error('Failed to load presets');
      const data = await response.json();
      setPresets(data);
    } catch (error) {
      console.error('Error loading presets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    setIsDeleting(presetId);
    try {
      const response = await fetch(`/api/presets/${presetId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete preset');

      setPresets(presets.filter(p => p.id !== presetId));
      if (selectedPreset?.id === presetId) {
        setSelectedPreset(null);
      }
    } catch (error) {
      console.error('Error deleting preset:', error);
      alert('Failed to delete preset');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleStreamPreset = (preset: EffectPreset) => {
    setSelectedPreset(preset);
    setShowStreamModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading presets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Save className="w-8 h-8 text-primary-500" />
            Effect Presets
          </h1>
          <button
            onClick={() => router.push('/effects')}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            Create New Preset
          </button>
        </div>
        <p className="text-gray-400">
          Save and reuse your favorite effect configurations, including layered effects with blend modes.
        </p>
      </div>

      {presets.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Save className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-300 mb-2">No Presets</h3>
          <p className="text-gray-400 mb-6">
            Create your first preset by configuring an effect on the Effects page and clicking "Save as Preset".
          </p>
          <button
            onClick={() => router.push('/effects')}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            Go to Effects
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((preset) => (
            <motion.div
              key={preset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  {preset.useLayers ? (
                    <Layers className="w-5 h-5 text-primary-500" />
                  ) : (
                    <Zap className="w-5 h-5 text-primary-500" />
                  )}
                  <h3 className="text-lg font-semibold text-gray-200">
                    {preset.name}
                  </h3>
                </div>
                <button
                  onClick={() => handleDeletePreset(preset.id)}
                  disabled={isDeleting === preset.id}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-red-400 hover:text-red-300 disabled:opacity-50"
                  title="Delete preset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {preset.description && (
                <p className="text-sm text-gray-400 mb-4">{preset.description}</p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="font-medium">Type:</span>
                  <span>{preset.useLayers ? `${preset.layers?.length || 0} Layers` : 'Single Effect'}</span>
                </div>
                {preset.useLayers && preset.layers && (
                  <div className="text-sm text-gray-400">
                    <span className="font-medium">Layers:</span>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      {preset.layers.map((layer, idx) => (
                        <li key={layer.id} className="text-xs">
                          {layer.name || `${layer.effect.name} (${layer.blendMode})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!preset.useLayers && preset.effect && (
                  <div className="text-sm text-gray-400">
                    <span className="font-medium">Effect:</span> {preset.effect.name}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Updated: {new Date(preset.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <button
                onClick={() => handleStreamPreset(preset)}
                className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Stream Preset
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Preset Stream Modal */}
      {selectedPreset && (
        <PresetStreamModal
          preset={selectedPreset}
          devices={devices}
          groups={groups}
          virtuals={virtuals}
          isOpen={showStreamModal}
          onClose={() => setShowStreamModal(false)}
          onStreamStarted={() => setShowStreamModal(false)}
        />
      )}
    </div>
  );
}


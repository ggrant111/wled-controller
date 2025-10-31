'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Play, Pause, Zap, Layers } from 'lucide-react';
import { EffectPreset, WLEDDevice, Group, VirtualDevice } from '../types';
import TargetSelector from './TargetSelector';
import StreamConflictModal from './StreamConflictModal';
import { useStreaming } from '../contexts/StreamingContext';
import { useToast } from './ToastProvider';

interface PresetStreamModalProps {
  preset: EffectPreset;
  devices: WLEDDevice[];
  groups: Group[];
  virtuals: VirtualDevice[];
  isOpen: boolean;
  onClose: () => void;
  onStreamStarted?: () => void;
}

export default function PresetStreamModal({
  preset,
  devices,
  groups,
  virtuals,
  isOpen,
  onClose,
  onStreamStarted
}: PresetStreamModalProps) {
  const { isStreaming, setIsStreaming, setStreamingSessionId } = useStreaming();
  const { showToast } = useToast();
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingStreamConfig, setPendingStreamConfig] = useState<{ requestBody: any; targets: any[] } | null>(null);
  const [conflictData, setConflictData] = useState<any>(null);

  // Reset selected targets when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTargets([]);
    }
  }, [isOpen]);

  const handleStartStreaming = async () => {
    if (selectedTargets.length === 0) {
      showToast('Please select at least one device, group, or virtual to stream to.', 'error');
      return;
    }

    setIsStarting(true);
    try {
      // Create targets array from selected targets
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
          console.log('Preset conflict check result:', conflictCheck);
          hasConflicts = conflictCheck.hasConflicts && conflictCheck.conflicts && conflictCheck.conflicts.length > 0;
        } else {
          console.warn('Conflict check failed:', conflictResponse.status, conflictResponse.statusText);
        }
      } catch (error) {
        console.error('Error checking conflicts:', error);
        // Continue without conflict check if it fails
      }
      
      let existingSessionId: string | null = null;
      
      // Prepare request body based on preset type
      let requestBody: any;
      if (preset.useLayers && preset.layers) {
        // Layers mode - apply saved layer parameters
        requestBody = {
          targets,
          layers: preset.layers.map(layer => {
            // Get saved parameters for this layer if available
            const layerParamsKey = `${layer.id}-${layer.effect.id}`;
            const savedParams = preset.layerParameters?.[layerParamsKey] || {};
            
            return {
              ...layer,
              effect: {
                ...layer.effect,
                parameters: layer.effect.parameters.map(param => ({
                  ...param,
                  value: savedParams[param.name] ?? param.value
                }))
              }
            };
          }),
          fps: 30,
          selectedTargets,
          sessionId: existingSessionId || undefined
        };
      } else if (preset.effect) {
        // Single effect mode - apply saved parameters
        requestBody = {
          targets,
          effect: {
            ...preset.effect,
            parameters: preset.effect.parameters.map(param => ({
              ...param,
              value: preset.parameters?.[param.name] ?? param.value
            }))
          },
          fps: 30,
          blendMode: 'overwrite',
          selectedTargets,
          sessionId: existingSessionId || undefined
        };
      } else {
        showToast('Invalid preset: no effect or layers found', 'error');
        setIsStarting(false);
        return;
      }
      
      // Check for conflicts
      if (hasConflicts) {
        // Show conflict modal
        console.log('Showing preset conflict modal with conflicts:', conflictCheck.conflicts);
        setConflictData(conflictCheck);
        setPendingStreamConfig({ requestBody, targets });
        setConflictModalOpen(true);
        setIsStarting(false);
        return;
      } else {
        // Check if there's an existing session with same targets (for updating)
        try {
          const stateRes = await fetch('/api/stream/state');
          if (stateRes.ok) {
            const state = await stateRes.json();
            if (state?.hasActiveSession && state?.session?.id) {
              const activeTargets: Array<{ type: string; id: string }> = state.session.targets || [];
              const selectedTargetObjs = targets;
              const overlaps = selectedTargetObjs.some(sel => activeTargets.some((t: any) => t.type === sel.type && t.id === sel.id));
              if (overlaps) {
                existingSessionId = state.session.id as string;
                requestBody.sessionId = existingSessionId;
              }
            }
          }
        } catch (e) {
          console.warn('Could not read stream state:', e);
        }
      }

      const response = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start streaming');
      }

      const session = await response.json();
      console.log('Preset streaming started:', session);

      setIsStreaming(true);
      setStreamingSessionId(session.id);
      showToast('Streaming started', 'success');
      
      if (onStreamStarted) {
        onStreamStarted();
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error starting preset streaming:', error);
      showToast(error.message || 'Failed to start streaming', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Stream Conflict Modal */}
      <StreamConflictModal
        isOpen={conflictModalOpen}
        conflicts={conflictData?.conflicts || []}
        devices={devices.map(d => ({ id: d.id, name: d.name }))}
        groups={groups.map(g => ({ id: g.id, name: g.name }))}
        virtuals={virtuals.map(v => ({ id: v.id, name: v.name }))}
        targetDeviceId={
          (() => {
            if (!pendingStreamConfig?.targets || pendingStreamConfig.targets.length !== 1) {
              console.log('[PresetStreamModal] Not single target:', pendingStreamConfig?.targets);
              return undefined;
            }
            const target = pendingStreamConfig.targets[0];
            if (target.type === 'device') {
              console.log('[PresetStreamModal] Single device target:', target.id);
              return target.id;
            }
            console.log('[PresetStreamModal] Single target but not device:', target);
            return undefined;
          })()
        }
        onPartialStop={async (deviceId) => {
          if (!pendingStreamConfig || !conflictData?.conflicts?.[0]) {
            setConflictModalOpen(false);
            return;
          }
          
          setIsStarting(true);
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
              const error = await response.json();
              throw new Error(error.error || 'Failed to start streaming');
            }

            const session = await response.json();
            console.log('Preset streaming started:', session);

            setIsStreaming(true);
            setStreamingSessionId(session.id);
            showToast('Streaming started', 'success');
            
            if (onStreamStarted) {
              onStreamStarted();
            }
            
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
            onClose();
          } catch (error: any) {
            console.error('Error starting preset streaming after partial stop:', error);
            showToast(error.message || 'Failed to start streaming', 'error');
          } finally {
            setIsStarting(false);
          }
        }}
        onConfirm={async () => {
          if (!pendingStreamConfig) {
            setConflictModalOpen(false);
            return;
          }
          
          setIsStarting(true);
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
              const error = await response.json();
              throw new Error(error.error || 'Failed to start streaming');
            }

            const session = await response.json();
            console.log('Preset streaming started:', session);

            setIsStreaming(true);
            setStreamingSessionId(session.id);
            showToast('Streaming started', 'success');
            
            if (onStreamStarted) {
              onStreamStarted();
            }
            
            setConflictModalOpen(false);
            setPendingStreamConfig(null);
            setConflictData(null);
            onClose();
          } catch (error: any) {
            console.error('Error starting preset streaming:', error);
            showToast(error.message || 'Failed to start streaming', 'error');
          } finally {
            setIsStarting(false);
          }
        }}
        onCancel={() => {
          setConflictModalOpen(false);
          setPendingStreamConfig(null);
          setConflictData(null);
        }}
      />
    
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="glass-card p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {preset.useLayers ? (
              <Layers className="w-6 h-6 text-primary-500" />
            ) : (
              <Zap className="w-6 h-6 text-primary-500" />
            )}
            <div>
              <h2 className="text-xl font-bold">Stream Preset: {preset.name}</h2>
              {preset.description && (
                <p className="text-sm text-gray-400">{preset.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-300 mb-2">Preset Details:</p>
            <div className="space-y-1 text-sm text-gray-400">
              <div>
                <span className="font-medium">Type:</span>{' '}
                {preset.useLayers ? `${preset.layers?.length || 0} Layers` : 'Single Effect'}
              </div>
              {preset.useLayers && preset.layers && (
                <div>
                  <span className="font-medium">Layers:</span>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    {preset.layers.slice(0, 3).map((layer, idx) => (
                      <li key={layer.id} className="text-xs">
                        {layer.name || `${layer.effect.name} (${layer.blendMode})`}
                      </li>
                    ))}
                    {preset.layers.length > 3 && (
                      <li className="text-xs">... and {preset.layers.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {!preset.useLayers && preset.effect && (
                <div>
                  <span className="font-medium">Effect:</span> {preset.effect.name}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Select Streaming Targets</h3>
          <TargetSelector
            devices={devices}
            groups={groups}
            virtuals={virtuals}
            selectedTargets={selectedTargets}
            onTargetsChange={setSelectedTargets}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isStarting}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStartStreaming}
            disabled={isStarting || selectedTargets.length === 0}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStarting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Streaming
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
    </>
  );
}


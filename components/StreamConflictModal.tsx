'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface StreamConflictModalProps {
  isOpen: boolean;
  conflicts: Array<{
    sessionId: string;
    sessionTargets: Array<{ type: string; id: string }>;
    conflictingDevices: Array<{ id: string; name: string }>;
    canPartialStop?: boolean;
    conflictSourceType?: string;
  }>;
  devices: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  virtuals: Array<{ id: string; name: string }>;
  onConfirm: () => void;
  onCancel: () => void;
  onPartialStop?: (deviceId: string) => void;
  targetDeviceId?: string; // The device we're trying to stream to
}

export default function StreamConflictModal({
  isOpen,
  conflicts,
  devices,
  groups,
  virtuals,
  onConfirm,
  onCancel,
  onPartialStop,
  targetDeviceId
}: StreamConflictModalProps) {
  const getTargetName = (target: { type: string; id: string }) => {
    if (target.type === 'device') {
      return devices.find(d => d.id === target.id)?.name || target.id;
    } else if (target.type === 'group') {
      return groups.find(g => g.id === target.id)?.name || target.id;
    } else if (target.type === 'virtual') {
      return virtuals.find(v => v.id === target.id)?.name || target.id;
    }
    return target.id;
  };
  
  // Debug: Check if partial stop should be available
  const hasPartialStopOption = conflicts.some(c => c.canPartialStop) && onPartialStop && targetDeviceId;
  if (isOpen) {
    console.log('[StreamConflictModal] Partial stop check:', {
      conflictsCount: conflicts.length,
      hasCanPartialStop: conflicts.some(c => c.canPartialStop),
      canPartialStopValues: conflicts.map(c => c.canPartialStop),
      hasOnPartialStop: !!onPartialStop,
      hasTargetDeviceId: !!targetDeviceId,
      targetDeviceId,
      conflicts: conflicts.map(c => ({
        canPartialStop: c.canPartialStop,
        conflictSourceType: c.conflictSourceType,
        conflictingDevices: c.conflictingDevices.map(d => d.name)
      })),
      hasPartialStopOption
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass-card p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">Stream Conflict Detected</h3>
                <p className="text-sm text-gray-300 mb-4">
                  The following devices are already receiving a stream. Continuing will stop the existing stream(s).
                </p>
              </div>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
              {conflicts.length > 0 ? (
                conflicts.map((conflict, idx) => (
                  <div key={idx} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <div className="text-sm font-medium text-yellow-400 mb-2">
                      Existing Stream:
                    </div>
                    <div className="text-sm text-gray-300 mb-2">
                      Targets: {conflict.sessionTargets.map(t => getTargetName(t)).join(', ')}
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      Affected Devices: {conflict.conflictingDevices.map(d => d.name).join(', ')}
                    </div>
                    {conflict.canPartialStop && conflict.conflictingDevices.length === 1 && (
                      <div className="text-xs text-blue-400 mt-2 pt-2 border-t border-white/10">
                        This device is part of a {conflict.conflictSourceType} stream. You can remove just this device to continue streaming to the rest.
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-400">No conflicts found.</div>
              )}
            </div>

            <div className="flex gap-3 justify-end flex-wrap">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              {hasPartialStopOption && (
                <button
                  onClick={() => {
                    console.log('[StreamConflictModal] Partial stop clicked for device:', targetDeviceId);
                    if (onPartialStop && targetDeviceId) {
                      onPartialStop(targetDeviceId);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Stop This Device Only
                </button>
              )}
              <button
                onClick={onConfirm}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                Stop All and Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


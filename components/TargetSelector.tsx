'use client';

import React from 'react';
import { WLEDDevice, Group, VirtualDevice } from '../types';
import { useModal } from './ModalProvider';

interface TargetSelectorProps {
  devices: WLEDDevice[];
  groups: Group[];
  virtuals: VirtualDevice[];
  selectedTargets: string[];
  onTargetsChange: (targets: string[]) => void;
  className?: string;
}

export default function TargetSelector({
  devices,
  groups,
  virtuals,
  selectedTargets,
  onTargetsChange,
  className = ''
}: TargetSelectorProps) {
  const toggleDevice = (deviceId: string) => {
    if (selectedTargets.includes(deviceId)) {
      onTargetsChange(selectedTargets.filter(id => id !== deviceId));
    } else {
      onTargetsChange([...selectedTargets, deviceId]);
    }
  };

  const toggleGroup = (group: Group) => {
    const groupId = `group-${group.id}`;
    if (selectedTargets.includes(groupId)) {
      onTargetsChange(selectedTargets.filter(id => id !== groupId));
    } else {
      onTargetsChange([...selectedTargets, groupId]);
    }
  };

  const toggleVirtual = (virtual: VirtualDevice) => {
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
    
    if (isSelected) {
      onTargetsChange(selectedTargets.filter(id => id !== virtualId));
    } else {
      if (hasOverlap) {
        showConfirm({
          message: 'Warning: This virtual device has overlapping LEDs with another selected virtual device. This may cause flashing/fighting effects. Continue anyway?',
          title: 'Virtual Device Overlap',
          variant: 'warning',
          confirmText: 'Continue',
          cancelText: 'Cancel',
          onConfirm: () => {
            onTargetsChange([...selectedTargets, virtualId]);
          }
        });
        return;
      }
      onTargetsChange([...selectedTargets, virtualId]);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Devices */}
      {devices.length > 0 && (
        <div>
          <p className="text-xs text-white/50 uppercase mb-2">Devices</p>
          <div className="overflow-x-auto pb-2 scrollbar-hide">
            <div className="flex gap-2">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-all ${
                    selectedTargets.includes(device.id)
                      ? 'bg-primary-500 text-white shadow-lg'
                      : 'bg-white/10 hover:bg-white/20 text-white/70'
                  }`}
                >
                  {device.name} {device.isOnline ? '🟢' : '🔴'}
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
              {groups.map((group) => {
                const groupId = `group-${group.id}`;
                const isSelected = selectedTargets.includes(groupId);
                return (
                  <button
                    key={group.id}
                    onClick={() => toggleGroup(group)}
                    className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm transition-all ${
                      isSelected
                        ? 'bg-primary-500 text-white shadow-lg'
                        : 'bg-white/10 hover:bg-white/20 text-white/70'
                    }`}
                  >
                    {group.name} ({group.members?.length || 0})
                  </button>
                );
              })}
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
                
                // Check for overlapping LED ranges
                const hasOverlap = selectedTargets.some(targetId => {
                  if (!targetId.startsWith('virtual-') || targetId === virtualId) return false;
                  const otherVirtualId = targetId.replace('virtual-', '');
                  const otherVirtual = virtuals.find(v => v.id === otherVirtualId);
                  if (!otherVirtual?.ledRanges || !virtual.ledRanges) return false;
                  
                  for (const range1 of virtual.ledRanges) {
                    for (const range2 of otherVirtual.ledRanges) {
                      if (range1.deviceId === range2.deviceId) {
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
                    onClick={() => toggleVirtual(virtual)}
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

      {devices.length === 0 && groups.length === 0 && virtuals.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No devices, groups, or virtuals available. Add some in the Devices page.
        </p>
      )}
    </div>
  );
}


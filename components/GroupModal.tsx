'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { WLEDDevice, Group, GroupMember } from '../types';
import { useToast } from './ToastProvider';

interface GroupModalProps {
  devices: WLEDDevice[];
  virtuals: any[];
  group?: Group;
  onSave: (group: Group) => void;
  onClose: () => void;
}

export default function GroupModal({ devices, virtuals, group, onSave, onClose }: GroupModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(group?.name || '');
  const [members, setMembers] = useState<GroupMember[]>(group?.members || []);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

  // Initialize with all devices if creating new group
  useEffect(() => {
    if (!group && members.length === 0) {
      // Don't auto-add devices for new groups
      // User can select what they want
    }
  }, [group, members.length]);

  const handleAddMember = (deviceId: string, includeSegments: boolean = false) => {
    if (members.some(m => m.deviceId === deviceId && !m.segmentId)) {
      return; // Already added as full device
    }

    if (includeSegments) {
      const device = devices.find(d => d.id === deviceId);
      if (device) {
        // Add full device
        setMembers([...members, { deviceId }]);
      }
    } else {
      setMembers([...members, { deviceId }]);
    }
  };

  const handleAddSegment = (deviceId: string, segmentId: string, startLed: number, endLed: number) => {
    setMembers([...members, {
      deviceId,
      segmentId,
      startLed,
      endLed
    }]);
  };

  const handleRemoveMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Please enter a group name', 'error');
      return;
    }

    const newGroup: Group = {
      id: group?.id || crypto.randomUUID(),
      name: name.trim(),
      members,
      isDefault: false,
      brightness: 1.0,
      isStreaming: false
    };

    onSave(newGroup);
  };

  const isDeviceInGroup = (deviceId: string) => {
    return members.some(m => m.deviceId === deviceId);
  };

  const getDeviceMemberType = (deviceId: string): 'none' | 'full' | 'partial' => {
    const deviceMembers = members.filter(m => m.deviceId === deviceId);
    if (deviceMembers.length === 0) return 'none';
    if (deviceMembers.some(m => !m.segmentId && !m.startLed)) return 'full';
    return 'partial';
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="glass-card max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 glass-card p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {group ? 'Edit Group' : 'Create Group'}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Group Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Living Room, All Lights"
                className="input-field w-full"
                required
              />
            </div>

            {/* Members */}
            <div>
              <label className="block text-sm font-medium mb-4">Group Members</label>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {/* Virtual Devices */}
                {virtuals.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-white/70 mb-2">Virtual Devices</h3>
                    <div className="space-y-2">
                      {virtuals.map(virtual => (
                        <div
                          key={virtual.id}
                          className="glass-card p-3 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium">{virtual.name}</div>
                            <div className="text-xs text-white/70">Virtual Device</div>
                          </div>
                          {isDeviceInGroup(virtual.id) ? (
                            <span className="text-xs text-green-400">In Group</span>
                          ) : (
                            <button
                              onClick={() => handleAddMember(virtual.id)}
                              className="btn-secondary text-xs px-3 py-1"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Physical Devices */}
                <div>
                  <h3 className="text-sm font-semibold text-white/70 mb-2">Physical Devices</h3>
                  <div className="space-y-2">
                    {devices.map(device => {
                      const memberType = getDeviceMemberType(device.id);
                      const isExpanded = expandedDeviceId === device.id;

                      return (
                        <div key={device.id} className="glass-card p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{device.name}</div>
                              <div className="text-xs text-white/70">
                                {device.ledCount} LEDs • {device.ip}
                                {memberType === 'full' && ' • Full device in group'}
                                {memberType === 'partial' && ' • Partially in group'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {memberType === 'none' && (
                                <button
                                  onClick={() => handleAddMember(device.id)}
                                  className="btn-secondary text-xs px-3 py-1"
                                >
                                  Add Full
                                </button>
                              )}
                              <button
                                onClick={() => setExpandedDeviceId(isExpanded ? null : device.id)}
                                className="p-1 hover:bg-white/10 rounded transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: Show Segments */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                              {device.segments && device.segments.length > 0 ? (
                                device.segments.map(segment => {
                                  const segmentMember = members.find(
                                    m => m.deviceId === device.id && 
                                    m.startLed === segment.start && 
                                    m.endLed === segment.start + segment.length
                                  );
                                  return (
                                    <div key={segment.id} className="flex items-center justify-between text-sm py-2">
                                      <div>
                                        <span className="font-medium">
                                          {segment.name || `Segment ${segment.start}-${segment.start + segment.length - 1}`}
                                        </span>
                                        <span className="text-white/70 ml-2">({segment.length} LEDs)</span>
                                      </div>
                                      {segmentMember ? (
                                        <span className="text-xs text-green-400">In Group</span>
                                      ) : (
                                        <button
                                          onClick={() => handleAddSegment(
                                            device.id,
                                            segment.id,
                                            segment.start,
                                            segment.start + segment.length - 1
                                          )}
                                          className="btn-secondary text-xs px-2 py-1"
                                        >
                                          Add Segment
                                        </button>
                                      )}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-sm text-white/70">No segments configured for this device</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Members */}
            {members.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">Selected Members ({members.length})</label>
                <div className="glass-card p-3 space-y-2">
                  {members.map((member, index) => {
                    const device = devices.find(d => d.id === member.deviceId);
                    const virtual = virtuals.find(v => v.id === member.deviceId);
                    const name = device?.name || virtual?.name || 'Unknown';
                    
                    // Find matching segment to get its name
                    let segmentName: string | undefined;
                    if (device && (member.segmentId || (member.startLed !== undefined && member.endLed !== undefined))) {
                      const segment = device.segments?.find(s => 
                        member.segmentId 
                          ? s.id === member.segmentId
                          : s.start === member.startLed && s.start + s.length - 1 === member.endLed
                      );
                      segmentName = segment?.name;
                    }
                    
                    return (
                      <div key={index} className="flex items-center justify-between py-2">
                        <div className="text-sm">
                          <span className="font-medium">{name}</span>
                          {segmentName && (
                            <span className="text-white/70 ml-2">
                              {segmentName}
                            </span>
                          )}
                          {!segmentName && member.startLed !== undefined && member.endLed !== undefined && (
                            <span className="text-white/70 ml-2">
                              (LEDs {member.startLed}-{member.endLed})
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveMember(index)}
                          className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 glass-card p-6 border-t border-white/10 flex justify-end gap-3">
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary">
              {group ? 'Update' : 'Create'} Group
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}


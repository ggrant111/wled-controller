'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Settings, Users, Monitor } from 'lucide-react';
import { Group, VirtualDevice } from '../types';

interface GroupsPanelProps {
  groups: Group[];
  virtuals: VirtualDevice[];
  onAddGroup: () => void;
  onAddVirtual: () => void;
}

export default function GroupsPanel({ groups, virtuals, onAddGroup, onAddVirtual }: GroupsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Groups */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-bold">Groups</h2>
          </div>
          <button
            onClick={onAddGroup}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-white/30 mx-auto mb-3" />
            <p className="text-white/70">No groups created yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-card-hover p-4 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                    <p className="text-sm text-white/70">
                      {group.members?.length || 0} device{(group.members?.length || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      group.isStreaming 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {group.isStreaming ? 'Streaming' : 'Idle'}
                    </span>
                    <button className="p-1 hover:bg-white/20 rounded transition-colors">
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Virtual Devices */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-bold">Virtual Devices</h2>
          </div>
          <button
            onClick={onAddVirtual}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Virtual
          </button>
        </div>

        {virtuals.length === 0 ? (
          <div className="text-center py-8">
            <Monitor className="h-12 w-12 text-white/30 mx-auto mb-3" />
            <p className="text-white/70">No virtual devices created yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {virtuals.map((virtual, index) => (
              <motion.div
                key={virtual.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-card-hover p-4 rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{virtual.name}</h3>
                    <p className="text-sm text-white/70">
                      {virtual.ledRanges?.length || 0} range{(virtual.ledRanges?.length || 0) !== 1 ? 's' : ''} • {virtual.ledRanges?.reduce((sum, range) => sum + (range.endLed - range.startLed + 1), 0) || 0} LEDs
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      virtual.isStreaming 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {virtual.isStreaming ? 'Streaming' : 'Idle'}
                    </span>
                    <button className="p-1 hover:bg-white/20 rounded transition-colors">
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

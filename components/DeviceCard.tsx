'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Play, Pause, Settings, Wifi, WifiOff } from 'lucide-react';
import { WLEDDevice } from '../types';

interface DeviceCardProps {
  device: WLEDDevice;
  onEdit: () => void;
  onDelete: () => void;
  delay?: number;
}

export default function DeviceCard({ device, onEdit, onDelete, delay = 0 }: DeviceCardProps) {
  const handlePlay = () => {
    // TODO: Implement device-specific streaming
    console.log('Starting stream for device:', device.id);
  };

  const handlePause = () => {
    // TODO: Implement device-specific streaming stop
    console.log('Stopping stream for device:', device.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card glass-card-hover p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {device.isOnline ? (
            <Wifi className="h-4 w-4 text-green-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-400" />
          )}
          <h3 className="font-semibold truncate">{device.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Edit device"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-500/20 rounded transition-colors"
            title="Delete device"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-white/70">IP Address:</span>
          <span className="font-mono">{device.ip}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/70">Port:</span>
          <span>{device.port}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/70">LEDs:</span>
          <span>{device.ledCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/70">Segments:</span>
          <span>{device.segments.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/70">Status:</span>
          <span className={`px-2 py-1 rounded-full text-xs ${
            device.isOnline 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {device.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlay}
              className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors"
              title="Start streaming"
            >
              <Play className="h-4 w-4 text-green-400" />
            </button>
            <button
              onClick={handlePause}
              className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
              title="Stop streaming"
            >
              <Pause className="h-4 w-4 text-red-400" />
            </button>
          </div>
          <button
            onClick={onEdit}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            title="Device settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

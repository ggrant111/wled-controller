'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { WLEDDevice, LEDSegment } from '../types';

interface DeviceModalProps {
  device?: WLEDDevice | null;
  onSave: (device: WLEDDevice) => void;
  onClose: () => void;
}

export default function DeviceModal({ device, onSave, onClose }: DeviceModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    ip: '',
    port: 4048,
    ledCount: 0,
  });

  const [segments, setSegments] = useState<LEDSegment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name,
        ip: device.ip,
        port: device.port,
        ledCount: device.ledCount,
      });
      setSegments(device.segments);
    } else {
      // Default segment for new devices
      setSegments([{
        id: uuidv4(),
        start: 0,
        length: 0,
        color: '#ffffff',
        brightness: 1.0,
      }]);
    }
  }, [device]);

  const handleInputChange = (field: string, value: any) => {
    // Handle NaN values by converting them to appropriate defaults
    let processedValue = value;
    if (typeof value === 'number' && (isNaN(value) || value === null)) {
      processedValue = field === 'port' ? 4048 : 0;
    }
    setFormData(prev => ({ ...prev, [field]: processedValue }));
  };

  const handleSegmentChange = (index: number, field: string, value: any) => {
    const newSegments = [...segments];
    newSegments[index] = { ...newSegments[index], [field]: value };
    setSegments(newSegments);
  };

  const addSegment = () => {
    const lastSegment = segments[segments.length - 1];
    const newStart = lastSegment ? lastSegment.start + lastSegment.length : 0;
    
    setSegments([...segments, {
      id: uuidv4(),
      start: newStart,
      length: 10,
      color: '#ffffff',
      brightness: 1.0,
    }]);
  };

  const removeSegment = (index: number) => {
    if (segments.length > 1) {
      setSegments(segments.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const deviceData: WLEDDevice = {
        id: device?.id || uuidv4(),
        name: formData.name,
        ip: formData.ip,
        port: formData.port,
        ledCount: formData.ledCount,
        segments: segments.map(segment => ({
          ...segment,
          length: Math.min(segment.length, formData.ledCount - segment.start),
        })),
        isOnline: false,
        lastSeen: new Date(),
      };

      const method = device ? 'PUT' : 'POST';
      const url = device ? `/api/devices/${device.id}` : '/api/devices';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData),
      });

      if (response.ok) {
        const savedDevice = await response.json();
        onSave(savedDevice);
      } else {
        throw new Error('Failed to save device');
      }
    } catch (error) {
      console.error('Error saving device:', error);
      alert('Failed to save device. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {device ? 'Edit Device' : 'Add Device'}
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Device Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="input-field w-full"
                    placeholder="My WLED Device"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IP Address</label>
                  <input
                    type="text"
                    value={formData.ip}
                    onChange={(e) => handleInputChange('ip', e.target.value)}
                    className="input-field w-full"
                    placeholder="192.168.1.100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Port</label>
                  <input
                    type="number"
                    value={formData.port || ''}
                    onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 4048)}
                    className="input-field w-full"
                    min="1"
                    max="65535"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">LED Count</label>
                  <input
                    type="number"
                    value={formData.ledCount || ''}
                    onChange={(e) => handleInputChange('ledCount', parseInt(e.target.value) || 0)}
                    className="input-field w-full"
                    min="1"
                    required
                  />
                </div>
              </div>

              {/* Segments */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">LED Segments</h3>
                  <button
                    type="button"
                    onClick={addSegment}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Segment
                  </button>
                </div>

                <div className="space-y-3">
                  {segments.map((segment, index) => (
                    <div key={segment.id} className="glass-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">Segment {index + 1}</h4>
                        {segments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSegment(index)}
                            className="p-1 hover:bg-red-500/20 rounded transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">Start</label>
                          <input
                            type="number"
                            value={segment.start}
                            onChange={(e) => handleSegmentChange(index, 'start', parseInt(e.target.value))}
                            className="input-field w-full"
                            min="0"
                            max={formData.ledCount - 1}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Length</label>
                          <input
                            type="number"
                            value={segment.length}
                            onChange={(e) => handleSegmentChange(index, 'length', parseInt(e.target.value))}
                            className="input-field w-full"
                            min="1"
                            max={formData.ledCount - segment.start}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Color</label>
                          <input
                            type="color"
                            value={segment.color}
                            onChange={(e) => handleSegmentChange(index, 'color', e.target.value)}
                            className="w-full h-10 rounded-lg border border-white/20 bg-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Brightness</label>
                          <input
                            type="range"
                            value={segment.brightness}
                            onChange={(e) => handleSegmentChange(index, 'brightness', parseFloat(e.target.value))}
                            className="slider"
                            min="0"
                            max="1"
                            step="0.1"
                          />
                          <div className="text-xs text-white/70 mt-1">
                            {Math.round(segment.brightness * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-white/20">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {device ? 'Update' : 'Add'} Device
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

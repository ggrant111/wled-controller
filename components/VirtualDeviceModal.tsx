'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Monitor, Save } from 'lucide-react';
import { VirtualDevice, WLEDDevice, VirtualLEDRange } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from './ToastProvider';

interface VirtualDeviceModalProps {
  devices: WLEDDevice[];
  virtual?: VirtualDevice | null;
  onSave: (virtual: VirtualDevice) => void;
  onClose: () => void;
}

export default function VirtualDeviceModal({ devices, virtual, onSave, onClose }: VirtualDeviceModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [ledRanges, setLedRanges] = useState<VirtualLEDRange[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (virtual) {
      setName(virtual.name);
      setLedRanges(virtual.ledRanges || []);
    } else {
      setName('');
      setLedRanges([]);
    }
  }, [virtual]);

  const addLEDRange = () => {
    if (devices.length === 0) return;
    
    const newRange: VirtualLEDRange = {
      id: uuidv4(),
      deviceId: devices[0].id,
      startLed: 0,
      endLed: Math.min(99, devices[0].ledCount - 1)
    };
    setLedRanges([...ledRanges, newRange]);
  };

  const removeLEDRange = (index: number) => {
    setLedRanges(ledRanges.filter((_, i) => i !== index));
  };

  const updateLEDRange = (index: number, field: string, value: any) => {
    const newRanges = [...ledRanges];
    newRanges[index] = { ...newRanges[index], [field]: value };
    
    // Ensure endLed >= startLed
    if (field === 'startLed' && newRanges[index].endLed < value) {
      newRanges[index].endLed = value;
    }
    if (field === 'endLed' && newRanges[index].startLed > value) {
      newRanges[index].startLed = value;
    }
    
    setLedRanges(newRanges);
  };

  const getDevice = (deviceId: string) => {
    return devices.find(d => d.id === deviceId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      showToast('Please enter a name for the virtual device', 'error');
      return;
    }
    
    if (ledRanges.length === 0) {
      showToast('Please add at least one LED range', 'error');
      return;
    }

    setLoading(true);
    const virtualData: VirtualDevice = {
      id: virtual?.id || uuidv4(),
      name: name.trim(),
      ledRanges,
      brightness: virtual?.brightness || 1.0,
      isStreaming: virtual?.isStreaming || false
    };

    onSave(virtualData);
    setLoading(false);
  };

  const totalLEDCount = ledRanges.reduce((total, range) => total + (range.endLed - range.startLed + 1), 0);

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
                {virtual ? 'Edit Virtual Device' : 'Create Virtual Device'}
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
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Virtual Device Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Living Room Display"
                  className="input-field w-full"
                  required
                />
              </div>

              {/* LED Ranges */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium">LED Ranges</label>
                  <button
                    type="button"
                    onClick={addLEDRange}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add LED Range
                  </button>
                </div>

                {totalLEDCount > 0 && (
                  <div className="mb-4 p-3 bg-primary-500/10 rounded-lg">
                    <p className="text-sm">
                      <strong>Total LEDs:</strong> {totalLEDCount} LEDs in this virtual device
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {ledRanges.map((range, index) => {
                    const device = getDevice(range.deviceId);
                    const maxLEDs = device?.ledCount || 0;

                    return (
                      <div key={range.id} className="glass-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">LED Range {index + 1}</h4>
                          <button
                            type="button"
                            onClick={() => removeLEDRange(index)}
                            className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Device Selection */}
                        <div>
                          <label className="block text-sm font-medium mb-1">Device</label>
                          <select
                            value={range.deviceId}
                            onChange={(e) => updateLEDRange(index, 'deviceId', e.target.value)}
                            className="input-field w-full"
                            required
                          >
                            <option value="">Select a device</option>
                            {devices.map(device => (
                              <option key={device.id} value={device.id}>
                                {device.name} ({device.ledCount} LEDs)
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* LED Range - Dual Slider */}
                        {device && (
                          <div>
                            <label className="block text-sm font-medium mb-3">
                              LED Range: {range.startLed} - {range.endLed} ({range.endLed - range.startLed + 1} LEDs)
                            </label>
                            
                            {/* Dual Slider Track */}
                            <div className="relative h-8 mb-6">
                              {/* Background track */}
                              <div className="absolute top-3 left-0 right-0 h-2 bg-white/10 rounded-full"></div>
                              
                              {/* Selected range highlight */}
                              <div 
                                className="absolute top-3 h-2 bg-primary-500/50 rounded-full pointer-events-none"
                                style={{
                                  left: `${(range.startLed / (device.ledCount - 1)) * 100}%`,
                                  width: `${Math.max(0, ((range.endLed - range.startLed) / (device.ledCount - 1)) * 100)}%`
                                }}
                              />
                              
                              {/* Start handle */}
                              <input
                                type="range"
                                value={range.startLed}
                                onChange={(e) => updateLEDRange(index, 'startLed', parseInt(e.target.value))}
                                className="absolute w-full h-2 top-3 slider pointer-events-auto z-10"
                                style={{
                                  background: 'none',
                                  appearance: 'none',
                                }}
                                min={0}
                                max={device.ledCount - 1}
                              />
                              
                              {/* End handle */}
                              <input
                                type="range"
                                value={range.endLed}
                                onChange={(e) => updateLEDRange(index, 'endLed', parseInt(e.target.value))}
                                className="absolute w-full h-2 top-3 slider pointer-events-auto z-20"
                                style={{
                                  background: 'none',
                                  appearance: 'none',
                                }}
                                min={0}
                                max={device.ledCount - 1}
                              />
                            </div>
                            
                            {/* Min/Max labels */}
                            <div className="flex justify-between text-xs text-white/50">
                              <span>0</span>
                              <span>{Math.floor((device.ledCount - 1) / 2)}</span>
                              <span>{device.ledCount - 1}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {ledRanges.length === 0 && (
                  <div className="text-center py-8 text-white/50">
                    <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Add LED ranges to build your virtual device</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 glass-card p-6 border-t border-white/10 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {virtual ? 'Update' : 'Create'} Virtual Device
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

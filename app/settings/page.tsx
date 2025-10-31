'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Server, Cpu, Palette, MapPin, Loader, Calendar } from 'lucide-react';
import { LocationSettings } from '../../types';
import { useToast } from '../../components/ToastProvider';
import { useRouter } from 'next/navigation';
import Toggle from '../../components/Toggle';

export default function SettingsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [locationSettings, setLocationSettings] = useState<LocationSettings>({});
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocationSettings();
  }, []);

  const loadLocationSettings = async () => {
    try {
      const res = await fetch('/api/settings/location');
      if (res.ok) {
        const data = await res.json();
        setLocationSettings(data || {});
      }
    } catch (error) {
      console.error('Failed to load location settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGeolocate = async () => {
    setLoadingLocation(true);
    try {
      const res = await fetch('/api/settings/geolocate');
      if (res.ok) {
        const data = await res.json();
        setLocationSettings(data);
        showToast('Location detected successfully', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || 'Failed to detect location', 'error');
      }
    } catch (error) {
      showToast('Failed to detect location', 'error');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleSaveLocation = async () => {
    setSavingLocation(true);
    try {
      const res = await fetch('/api/settings/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locationSettings)
      });
      if (res.ok) {
        showToast('Location settings saved', 'success');
      } else {
        showToast('Failed to save location settings', 'error');
      }
    } catch (error) {
      showToast('Failed to save location settings', 'error');
    } finally {
      setSavingLocation(false);
    }
  };

  const updateLocationField = (field: keyof LocationSettings, value: any) => {
    setLocationSettings(prev => ({ ...prev, [field]: value }));
  };
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl font-bold mb-2">Settings</h1>
        <p className="text-white/70">Configure your WLED controller</p>
      </motion.div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Backend Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Server className="h-6 w-6 text-primary-500" />
            <h2 className="text-xl font-bold">Backend Server</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Server Port</label>
              <input
                type="number"
                defaultValue={3001}
                className="input-field w-full"
                disabled
              />
              <p className="text-xs text-white/50 mt-1">UDP/DDP streaming server port</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Health Check Interval</label>
              <input
                type="number"
                defaultValue={30000}
                className="input-field w-full"
                disabled
              />
              <p className="text-xs text-white/50 mt-1">Device health check interval in milliseconds</p>
            </div>
          </div>
        </motion.div>

        {/* Location Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="h-6 w-6 text-primary-500" />
            <h2 className="text-xl font-bold">Location Settings</h2>
          </div>
          <p className="text-sm text-white/70 mb-4">
            Set your location for accurate sunrise/sunset calculations in schedules. 
            This will be used as the default location if schedule rules don't specify their own coordinates.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleGeolocate}
                disabled={loadingLocation}
                className="btn-secondary flex items-center gap-2"
              >
                {loadingLocation ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                Auto-detect Location
              </button>
              {locationSettings.autoDetected && (
                <span className="text-xs text-green-400">✓ Auto-detected</span>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={locationSettings.latitude ?? ''}
                  onChange={(e) => updateLocationField('latitude', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder="e.g., 37.7749"
                  className="input-field w-full"
                />
                <p className="text-xs text-white/50 mt-1">Decimal degrees (-90 to 90)</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={locationSettings.longitude ?? ''}
                  onChange={(e) => updateLocationField('longitude', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  placeholder="e.g., -122.4194"
                  className="input-field w-full"
                />
                <p className="text-xs text-white/50 mt-1">Decimal degrees (-180 to 180)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Timezone</label>
              <input
                type="text"
                value={locationSettings.timezone ?? ''}
                onChange={(e) => updateLocationField('timezone', e.target.value || undefined)}
                placeholder="e.g., America/Los_Angeles"
                className="input-field w-full"
              />
              <p className="text-xs text-white/50 mt-1">IANA timezone identifier</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">City</label>
                <input
                  type="text"
                  value={locationSettings.city ?? ''}
                  onChange={(e) => updateLocationField('city', e.target.value || undefined)}
                  placeholder="e.g., San Francisco"
                  className="input-field w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Country</label>
                <input
                  type="text"
                  value={locationSettings.country ?? ''}
                  onChange={(e) => updateLocationField('country', e.target.value || undefined)}
                  placeholder="e.g., United States"
                  className="input-field w-full"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveLocation}
                disabled={savingLocation}
                className="btn-primary flex items-center gap-2"
              >
                {savingLocation ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Location'
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Holidays Management */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-6 w-6 text-primary-500" />
            <h2 className="text-xl font-bold">Holidays</h2>
          </div>
          <p className="text-sm text-white/70 mb-4">
            Manage holidays for schedule triggers. Create custom holidays or use the built-in US national holidays.
          </p>
          <button
            onClick={() => router.push('/holidays')}
            className="btn-primary flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Manage Holidays
          </button>
        </motion.div>

        {/* Display Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Palette className="h-6 w-6 text-primary-500" />
            <h2 className="text-xl font-bold">Display Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Theme</label>
              <select className="input-field w-full" disabled>
                <option>Dark (Default)</option>
              </select>
            </div>
            <div>
              <Toggle 
                checked={true} 
                onChange={() => {}} 
                label="Enable animations"
                size="sm"
              />
            </div>
          </div>
        </motion.div>

        {/* About */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <SettingsIcon className="h-6 w-6 text-primary-500" />
            <h2 className="text-xl font-bold">About</h2>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-white/70">
              <strong>Version:</strong> 1.0.0
            </p>
            <p className="text-sm text-white/70">
              <strong>Protocol:</strong> DDP (UDP 4048)
            </p>
            <p className="text-sm text-white/70">
              <strong>Framework:</strong> Next.js 16 + React 19
            </p>
            <p className="text-sm text-white/70">
              <strong>Backend:</strong> Node.js + Express + Socket.IO
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}


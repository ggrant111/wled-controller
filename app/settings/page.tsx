'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Server, Cpu, Palette } from 'lucide-react';

export default function SettingsPage() {
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

        {/* Display Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
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
              <label className="flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4" defaultChecked />
                <span className="text-sm">Enable animations</span>
              </label>
            </div>
          </div>
        </motion.div>

        {/* About */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
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


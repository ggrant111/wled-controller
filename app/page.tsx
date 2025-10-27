'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Users, Monitor, Zap, Wifi, WifiOff } from 'lucide-react';

export default function Dashboard() {
  const [devices, setDevices] = useState(0);
  const [groups, setGroups] = useState(0);
  const [virtuals, setVirtuals] = useState(0);
  const [effects, setEffects] = useState(14);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [devicesRes, groupsRes, virtualsRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals')
      ]);

      const devicesData = await devicesRes.json();
      const groupsData = await groupsRes.json();
      const virtualsData = await virtualsRes.json();

      setDevices(devicesData.length);
      setGroups(groupsData.length);
      setVirtuals(virtualsData.length);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
        <p className="text-white/70">Overview of your WLED system</p>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Devices</p>
              <p className="text-3xl font-bold">{devices}</p>
            </div>
            <Cpu className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Total WLED devices</p>
        </div>
        
        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Groups</p>
              <p className="text-3xl font-bold">{groups}</p>
            </div>
            <Users className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Device groups</p>
        </div>
        
        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Virtuals</p>
              <p className="text-3xl font-bold">{virtuals}</p>
            </div>
            <Monitor className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Virtual layouts</p>
        </div>
        
        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Effects</p>
              <p className="text-3xl font-bold">{effects}</p>
            </div>
            <Zap className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Available effects</p>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <a href="/devices" className="block btn-primary text-center">
              Manage Devices
            </a>
            <a href="/effects" className="block btn-secondary text-center">
              Browse Effects
            </a>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-xl font-bold mb-4">System Status</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Backend Server</span>
              <span className="flex items-center gap-2 text-green-400">
                <Wifi className="h-4 w-4" />
                Online
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">DDP Streaming</span>
              <span className="flex items-center gap-2 text-green-400">
                <Wifi className="h-4 w-4" />
                Ready
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Active Streams</span>
              <span className="text-primary-500">0</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RefreshCw, Zap, Clock, Target, Music } from 'lucide-react';
import { StreamingSession, WLEDDevice, Group, VirtualDevice, StreamTarget } from '../../types';
import { useToast } from '../../components/ToastProvider';
import { useModal } from '../../components/ModalProvider';
import StreamSessionExpandedTargets from '../../components/StreamSessionExpandedTargets';

export default function StreamsPage() {
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const [sessions, setSessions] = useState<StreamingSession[]>([]);
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlaylistSessionId, setActivePlaylistSessionId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const checkActivePlaylist = async () => {
    try {
      const response = await fetch('/api/playlists/active');
      if (response.ok) {
        const data = await response.json();
        if (data.activePlaylist) {
          setActivePlaylistSessionId(data.activePlaylist.sessionId);
          setActivePlaylistId(data.activePlaylist.playlistId);
        } else {
          setActivePlaylistSessionId(null);
          setActivePlaylistId(null);
        }
      }
    } catch (error) {
      console.error('Error checking active playlist:', error);
    }
  };

  useEffect(() => {
    loadData();
    checkActivePlaylist();
    // Auto-refresh every 2 seconds
    const interval = setInterval(() => {
      loadData();
      checkActivePlaylist();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [sessionsRes, devicesRes, groupsRes, virtualsRes] = await Promise.all([
        fetch('/api/stream/sessions'),
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals')
      ]);

      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions || []);
      }
      if (devicesRes.ok) setDevices(await devicesRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (virtualsRes.ok) setVirtuals(await virtualsRes.json());
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveTargetName = (target: StreamTarget): string => {
    if (target.type === 'device') {
      const device = devices.find(d => d.id === target.id);
      return device?.name || target.id;
    } else if (target.type === 'group') {
      const group = groups.find(g => g.id === target.id);
      return group?.name || target.id;
    } else if (target.type === 'virtual') {
      const virtual = virtuals.find(v => v.id === target.id);
      return virtual?.name || target.id;
    }
    return target.id;
  };

  const getTargetTypeLabel = (target: StreamTarget): string => {
    return target.type.charAt(0).toUpperCase() + target.type.slice(1);
  };

  const formatUptime = (startTime: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(startTime).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handlePause = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/stream/pause/${sessionId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Stream paused', 'success');
        loadData();
      } else {
        showToast('Failed to pause stream', 'error');
      }
    } catch (error) {
      showToast('Failed to pause stream', 'error');
    }
  };

  const handleResume = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/stream/resume/${sessionId}`, { method: 'POST' });
      if (res.ok) {
        showToast('Stream resumed', 'success');
        loadData();
      } else {
        showToast('Failed to resume stream', 'error');
      }
    } catch (error) {
      showToast('Failed to resume stream', 'error');
    }
  };

  const handleStop = async (sessionId: string) => {
    showConfirm({
      message: 'Are you sure you want to stop this stream?',
      title: 'Stop Stream',
      variant: 'warning',
      confirmText: 'Stop',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/stream/stop/${sessionId}`, { method: 'POST' });
          if (res.ok) {
            showToast('Stream stopped', 'success');
            loadData();
          } else {
            showToast('Failed to stop stream', 'error');
          }
        } catch (error) {
          showToast('Failed to stop stream', 'error');
        }
      }
    });
  };

  const handleStopPlaylist = async () => {
    if (!activePlaylistSessionId) return;
    
    try {
      // Stop the playlist via API
      const res = await fetch('/api/playlists/stop', { method: 'POST' });
      if (res.ok) {
        setActivePlaylistSessionId(null);
        setActivePlaylistId(null);
        showToast('Playlist stopped', 'success');
        loadData();
        checkActivePlaylist();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || 'Failed to stop playlist', 'error');
      }
    } catch (error) {
      console.error('Error stopping playlist:', error);
      showToast('Failed to stop playlist', 'error');
    }
  };

  const getEffectNames = (session: StreamingSession): string => {
    if (session.layers && session.layers.length > 0) {
      return session.layers
        .filter(layer => layer.enabled)
        .map(layer => layer.effect?.name || 'Unknown')
        .join(', ');
    } else if (session.effect) {
      return session.effect.name || 'Unknown';
    }
    return 'No effect';
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading streams...</p>
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
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-4xl font-bold mb-2">Active Streams</h1>
          <p className="text-white/70">Manage your active LED effect streams</p>
        </div>
        <div className="flex items-center gap-2">
          {activePlaylistSessionId && (
            <button
              onClick={handleStopPlaylist}
              className="btn-secondary flex items-center gap-2 text-purple-400 hover:bg-purple-500/20"
              title="Stop Playlist"
            >
              <Music className="h-4 w-4" />
              <span className="hidden sm:inline">Stop Playlist</span>
            </button>
          )}
          <button
            onClick={loadData}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Streams List */}
      {sessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-12 text-center"
        >
          <Zap className="h-16 w-16 text-white/30 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Active Streams</h2>
          <p className="text-white/70">Start streaming from the Effects page to see active streams here.</p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">Stream Session</h3>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      session.isActive
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {session.isActive ? 'Active' : 'Paused'}
                    </span>
                    <span className="text-sm text-white/50">ID: {session.id.slice(0, 8)}...</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Effects */}
                    <div className="flex items-start gap-2">
                      <Zap className="h-5 w-5 text-primary-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-white/70 mb-1">Effects</p>
                        <p className="text-white font-medium">{getEffectNames(session)}</p>
                      </div>
                    </div>

                    {/* FPS */}
                    <div className="flex items-start gap-2">
                      <Clock className="h-5 w-5 text-primary-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-white/70 mb-1">Frame Rate</p>
                        <p className="text-white font-medium">{session.fps} FPS</p>
                      </div>
                    </div>

                    {/* Targets */}
                    <div className="flex items-start gap-2 md:col-span-2">
                      <Target className="h-5 w-5 text-primary-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-white/70 mb-2">Targets ({session.targets.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {session.targets.map((target, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded bg-white/10 text-xs text-white/80"
                            >
                              {getTargetTypeLabel(target)}: {resolveTargetName(target)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Targets with Individual Controls */}
                    <div className="md:col-span-2">
                      <StreamSessionExpandedTargets
                        session={session}
                        devices={devices}
                        groups={groups}
                        virtuals={virtuals}
                        onRefresh={loadData}
                      />
                    </div>

                    {/* Uptime */}
                    <div className="flex items-start gap-2 md:col-span-2">
                      <Clock className="h-5 w-5 text-primary-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-white/70 mb-1">Uptime</p>
                        <p className="text-white font-medium">{formatUptime(session.startTime)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 ml-4">
                  {session.isActive ? (
                    <button
                      onClick={() => handlePause(session.id)}
                      className="btn-secondary flex items-center gap-2"
                      title="Pause stream"
                    >
                      <Pause className="h-4 w-4" />
                      <span className="hidden sm:inline">Pause</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResume(session.id)}
                      className="btn-primary flex items-center gap-2"
                      title="Resume stream"
                    >
                      <Play className="h-4 w-4" />
                      <span className="hidden sm:inline">Resume</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleStop(session.id)}
                    className="btn-secondary flex items-center gap-2 text-red-400 hover:bg-red-500/20"
                    title="Stop stream"
                  >
                    <Square className="h-4 w-4" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}


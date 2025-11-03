'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Play, Pause, Trash2, Edit3, Music, Shuffle, Repeat, Clock, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Playlist, EffectPreset, WLEDDevice, Group, VirtualDevice, PlaylistItem, StreamTarget } from '../../types';
import { useToast } from '../../components/ToastProvider';
import { useModal } from '../../components/ModalProvider';
import TargetSelector from '../../components/TargetSelector';
import { useSocket } from '../../hooks/useSocket';

export default function PlaylistsPage() {
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const { on, off, socket } = useSocket();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);
  const [playlistTimeout, setPlaylistTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentStreamSessionId, setCurrentStreamSessionId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formItems, setFormItems] = useState<PlaylistItem[]>([]);
  const [formShuffle, setFormShuffle] = useState(false);
  const [formLoop, setFormLoop] = useState(false);
  const [formTargets, setFormTargets] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentPresetSelect, setCurrentPresetSelect] = useState<number | null>(null);

  // Use refs to avoid re-creating effects when these values change
  const playlistTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentStreamSessionIdRef = useRef<string | null>(null);
  const playingPlaylistIdRef = useRef<string | null>(null);

  // Update refs when state changes
  useEffect(() => {
    playlistTimeoutRef.current = playlistTimeout;
    currentStreamSessionIdRef.current = currentStreamSessionId;
    playingPlaylistIdRef.current = playingPlaylistId;
  }, [playlistTimeout, currentStreamSessionId, playingPlaylistId]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Poll for active playlist state
  useEffect(() => {
    const checkActivePlaylist = async () => {
      try {
        const response = await fetch('/api/playlists/active');
        if (response.ok) {
          const data = await response.json();
          if (data.activePlaylist && data.activePlaylist.playlistId) {
            // There's an active playlist on the server, sync our state
            if (playingPlaylistIdRef.current !== data.activePlaylist.playlistId) {
              setPlayingPlaylistId(data.activePlaylist.playlistId);
              setCurrentStreamSessionId(data.activePlaylist.sessionId);
            }
          } else if (!data.activePlaylist && playingPlaylistIdRef.current) {
            // No active playlist on server but we think we're playing - clear state
            if (playlistTimeoutRef.current) {
              clearTimeout(playlistTimeoutRef.current);
              setPlaylistTimeout(null);
            }
            setPlayingPlaylistId(null);
            setCurrentStreamSessionId(null);
          }
        }
      } catch (error) {
        console.error('Error checking active playlist:', error);
      }
    };
    
    checkActivePlaylist();
    const interval = setInterval(checkActivePlaylist, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, []); // Empty deps - only run once

  // Listen for Socket.IO events - use refs to avoid dependency issues
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    if (!socket) return;

    const handlePlaylistStopped = (data: { sessionId: string; playlistId: string }) => {
      console.log('Playlist stopped event received:', data);
      // Clear timeout immediately when playlist is stopped
      if (playlistTimeoutRef.current) {
        clearTimeout(playlistTimeoutRef.current);
        setPlaylistTimeout(null);
        playlistTimeoutRef.current = null;
      }
      setPlayingPlaylistId(null);
      setCurrentStreamSessionId(null);
      showToastRef.current('Playlist stopped', 'info');
    };
    
    const handleStreamingStopped = (data: { sessionId: string } | string) => {
      const sessionId = typeof data === 'string' ? data : data?.sessionId;
      if (sessionId === currentStreamSessionIdRef.current) {
        // Our session was stopped, clear the timeout
        console.log('Playlist session stopped:', sessionId);
        if (playlistTimeoutRef.current) {
          clearTimeout(playlistTimeoutRef.current);
          setPlaylistTimeout(null);
          playlistTimeoutRef.current = null;
        }
        setPlayingPlaylistId(null);
        setCurrentStreamSessionId(null);
      }
    };
    
    on('playlist-stopped', handlePlaylistStopped);
    on('streaming-stopped', handleStreamingStopped);
    
    return () => {
      off('playlist-stopped', handlePlaylistStopped);
      off('streaming-stopped', handleStreamingStopped);
    };
  }, [socket, on, off]); // Socket changes when connection is established

  const loadData = async () => {
    try {
      const [playlistsRes, presetsRes, devicesRes, groupsRes, virtualsRes] = await Promise.all([
        fetch('/api/playlists'),
        fetch('/api/presets'),
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals')
      ]);

      if (playlistsRes.ok) setPlaylists(await playlistsRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
      if (devicesRes.ok) setDevices(await devicesRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (virtualsRes.ok) setVirtuals(await virtualsRes.json());
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('Failed to load playlists', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlaylist = () => {
    setEditingPlaylist(null);
    setFormName('');
    setFormDescription('');
    setFormItems([]);
    setFormShuffle(false);
    setFormLoop(false);
    setFormTargets([]);
    setShowModal(true);
  };

  const handleEditPlaylist = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setFormName(playlist.name);
    setFormDescription(playlist.description || '');
    setFormItems([...playlist.items]);
    setFormShuffle(playlist.shuffle);
    setFormLoop(playlist.loop);
    setFormTargets(playlist.targets.map(t => {
      if (t.type === 'group') return `group-${t.id}`;
      if (t.type === 'virtual') return `virtual-${t.id}`;
      return t.id;
    }));
    setShowModal(true);
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    showConfirm({
      message: 'Are you sure you want to delete this playlist?',
      title: 'Delete Playlist',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setIsDeleting(playlistId);
        try {
          const response = await fetch(`/api/playlists/${playlistId}`, {
            method: 'DELETE'
          });

          if (!response.ok) throw new Error('Failed to delete playlist');

          setPlaylists(playlists.filter(p => p.id !== playlistId));
          showToast('Playlist deleted', 'success');
        } catch (error) {
          console.error('Error deleting playlist:', error);
          showToast('Failed to delete playlist', 'error');
        } finally {
          setIsDeleting(null);
        }
      }
    });
  };

  const handleAddItem = () => {
    if (presets.length === 0) {
      showToast('No presets available. Please create a preset first.', 'error');
      return;
    }
    const newItem: PlaylistItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      presetId: '',
      duration: 30,
      order: formItems.length
    };
    setFormItems([...formItems, newItem]);
  };

  const handleRemoveItem = (itemId: string) => {
    setFormItems(formItems.filter(item => item.id !== itemId).map((item, index) => ({
      ...item,
      order: index
    })));
  };

  const handleUpdateItem = (itemId: string, updates: Partial<PlaylistItem>) => {
    setFormItems(formItems.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formItems.length) return;
    
    const newItems = [...formItems];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    setFormItems(newItems.map((item, i) => ({ ...item, order: i })));
  };

  const handleSavePlaylist = async () => {
    if (!formName.trim()) {
      showToast('Playlist name is required', 'error');
      return;
    }

    if (formItems.length === 0) {
      showToast('Playlist must have at least one item', 'error');
      return;
    }

    if (formItems.some(item => !item.presetId)) {
      showToast('All playlist items must have a preset selected', 'error');
      return;
    }

    if (formTargets.length === 0) {
      showToast('Please select at least one device, group, or virtual', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const targets: StreamTarget[] = formTargets.map(targetId => {
        if (targetId.startsWith('group-')) {
          return { type: 'group', id: targetId.replace('group-', '') };
        } else if (targetId.startsWith('virtual-')) {
          return { type: 'virtual', id: targetId.replace('virtual-', '') };
        } else {
          return { type: 'device', id: targetId };
        }
      });

      const playlistData = {
        name: formName.trim(),
        description: formDescription.trim(),
        items: formItems,
        shuffle: formShuffle,
        loop: formLoop,
        targets
      };

      const url = editingPlaylist ? `/api/playlists/${editingPlaylist.id}` : '/api/playlists';
      const method = editingPlaylist ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlistData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save playlist');
      }

      await loadData();
      setShowModal(false);
      showToast(editingPlaylist ? 'Playlist updated' : 'Playlist created', 'success');
    } catch (error: any) {
      console.error('Error saving playlist:', error);
      showToast(error.message || 'Failed to save playlist', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayPlaylist = async (playlist: Playlist) => {
    if (playingPlaylistId) {
      // Stop current playback
      if (playlistTimeout) {
        clearTimeout(playlistTimeout);
        setPlaylistTimeout(null);
      }
      try {
        // Stop the current session if we have one
        if (currentStreamSessionId) {
          await fetch(`/api/stream/stop/${currentStreamSessionId}`, { method: 'POST' });
        } else {
          await fetch('/api/stream/stop-all', { method: 'POST' });
        }
      } catch (error) {
        console.error('Error stopping stream:', error);
      }
      setPlayingPlaylistId(null);
      setCurrentStreamSessionId(null);
      showToast('Playback stopped', 'info');
      return;
    }

    // Start playback
    console.log('handlePlayPlaylist called for playlist:', playlist.id, playlist.name);
    
    // Set state first, but use the playlist ID directly in the function call to avoid timing issues
    setPlayingPlaylistId(playlist.id);
    setCurrentStreamSessionId(null); // Reset session ID for new playlist
    
    // Call playNextItem immediately with the playlist ID to avoid state timing issues
    playNextItem(playlist, playlist.id, 0).catch(error => {
      console.error('Error in playNextItem:', error);
      setPlayingPlaylistId(null);
      setCurrentStreamSessionId(null);
      showToast('Failed to start playlist', 'error');
    });
  };

  const playNextItem = async (playlist: Playlist, expectedPlaylistId: string, currentIndex: number) => {
    console.log('playNextItem called:', { playlistId: playlist.id, expectedPlaylistId, currentIndex, currentPlayingId: playingPlaylistId });
    
    // Check if still playing the expected playlist (but allow it on first call even if state hasn't updated)
    if (playingPlaylistId && playingPlaylistId !== expectedPlaylistId) {
      console.log('Playback stopped or playlist changed, aborting');
      return;
    }

    // Get items in order (shuffle if enabled)
    let items = [...playlist.items].sort((a, b) => a.order - b.order);
    if (playlist.shuffle) {
      // Shuffle only the remaining items
      const played = items.slice(0, currentIndex);
      const remaining = items.slice(currentIndex);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      items = [...played, ...remaining];
    }

    if (currentIndex >= items.length) {
      if (playlist.loop) {
        // Loop back to start
        await playNextItem(playlist, expectedPlaylistId, 0);
      } else {
        // End of playlist
        setPlayingPlaylistId(null);
        setCurrentStreamSessionId(null);
        showToast('Playlist finished', 'success');
      }
      return;
    }

    if (items.length === 0) {
      console.error('Playlist has no items');
      showToast('Playlist has no items', 'error');
      setPlayingPlaylistId(null);
      return;
    }

    const item = items[currentIndex];
    
    if (!item || !item.presetId) {
      console.error('Invalid playlist item:', item);
      showToast('Invalid playlist item', 'error');
      setPlayingPlaylistId(null);
      return;
    }

    const preset = presets.find(p => p.id === item.presetId);

    if (!preset) {
      console.error('Preset not found:', item.presetId, 'Available presets:', presets.map(p => p.id));
      showToast(`Preset not found: ${item.presetId}`, 'error');
      setPlayingPlaylistId(null);
      setCurrentStreamSessionId(null);
      return;
    }

    console.log('Preset found:', { id: preset.id, name: preset.name, useLayers: preset.useLayers, hasLayers: !!preset.layers, hasEffect: !!preset.effect });

    // Start streaming the preset
    try {
      console.log('Starting playlist item:', { preset: preset.name, item, targets: playlist.targets });
      
      // Use conflict detection to automatically resolve conflicts (bypass user confirmation for playlists)
      let hasConflicts = false;
      let conflictCheck: any = null;
      
      try {
        const conflictResponse = await fetch('/api/stream/check-conflicts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets: playlist.targets })
        });
        
        if (conflictResponse.ok) {
          conflictCheck = await conflictResponse.json();
          console.log('Playlist conflict check result:', conflictCheck);
          hasConflicts = conflictCheck.hasConflicts && conflictCheck.conflicts && conflictCheck.conflicts.length > 0;
        } else {
          console.warn('Conflict check failed:', conflictResponse.status, conflictResponse.statusText);
        }
      } catch (error) {
        console.error('Error checking conflicts:', error);
        // Continue without conflict check if it fails
      }
      
      // Automatically resolve conflicts for playlists (bypass user confirmation)
      if (hasConflicts && conflictCheck?.conflicts) {
        console.log('Auto-resolving conflicts for playlist:', conflictCheck.conflicts);
        for (const conflict of conflictCheck.conflicts) {
          try {
            await fetch(`/api/stream/stop/${conflict.sessionId}`, { method: 'POST' });
            console.log('Stopped conflicting session:', conflict.sessionId);
          } catch (error) {
            console.error('Error stopping conflicting session:', error);
          }
        }
        // Small delay to ensure streams are stopped
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Also stop our own previous session if we have one (for playlist transitions)
      if (currentStreamSessionId && currentIndex > 0) {
        console.log('Stopping previous playlist session:', currentStreamSessionId);
        try {
          await fetch(`/api/stream/stop/${currentStreamSessionId}`, { method: 'POST' });
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.warn('Error stopping previous playlist session:', error);
        }
      }
      
      const requestBody: any = {
        targets: playlist.targets,
        fps: 30,
        playlistId: playlist.id // Mark this session as a playlist session
      };

      if (preset.useLayers && preset.layers && preset.layers.length > 0) {
        requestBody.layers = preset.layers.map(layer => {
          const layerParamsKey = `${layer.id}-${layer.effect.id}`;
          const savedParams = preset.layerParameters?.[layerParamsKey] || {};
          return {
            ...layer,
            effect: {
              ...layer.effect,
              parameters: layer.effect.parameters.map(param => ({
                ...param,
                value: savedParams[param.name] ?? param.value
              }))
            }
          };
        });
      } else if (preset.effect) {
        requestBody.effect = {
          ...preset.effect,
          parameters: preset.effect.parameters.map(param => ({
            ...param,
            value: preset.parameters?.[param.name] ?? param.value
          }))
        };
        requestBody.blendMode = 'overwrite';
      } else {
        showToast('Invalid preset format', 'error');
        setPlayingPlaylistId(null);
        return;
      }

      console.log('Sending stream start request:', requestBody);

      const response = await fetch('/api/stream/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Stream start failed:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to start stream');
      }

      const session = await response.json();
      console.log('Playlist streaming started:', session);

      // Store the session ID for stopping/updating later
      setCurrentStreamSessionId(session.id);

      showToast(`Playing: ${preset.name} (${item.duration}s)`, 'success');

      // Schedule next item
      const timeout = setTimeout(() => {
        playNextItem(playlist, expectedPlaylistId, currentIndex + 1);
      }, item.duration * 1000);

      setPlaylistTimeout(timeout);
      playlistTimeoutRef.current = timeout; // Also update ref
    } catch (error: any) {
      console.error('Error playing playlist item:', error);
      const errorMessage = error?.message || 'Failed to play preset';
      showToast(errorMessage, 'error');
      setPlayingPlaylistId(null);
      setCurrentStreamSessionId(null);
    }
  };

  const getPresetName = (presetId: string) => {
    return presets.find(p => p.id === presetId)?.name || 'Unknown Preset';
  };

  const getTotalDuration = (items: PlaylistItem[]) => {
    return items.reduce((total, item) => total + item.duration, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-white">Loading playlists...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Music className="w-8 h-8 text-primary-500" />
            <h1 className="text-3xl font-bold text-white">Playlists</h1>
          </div>
          <button
            onClick={handleCreatePlaylist}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Playlist
          </button>
        </div>

        {playlists.length === 0 ? (
          <div className="text-center py-12 glass-card">
            <Music className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-4">No playlists yet</p>
            <button
              onClick={handleCreatePlaylist}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Create Your First Playlist
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {playlists.map((playlist) => (
              <motion.div
                key={playlist.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-200 mb-1">{playlist.name}</h3>
                    {playlist.description && (
                      <p className="text-sm text-gray-400 mb-2">{playlist.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditPlaylist(playlist)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-blue-400 hover:text-blue-300"
                      title="Edit playlist"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePlaylist(playlist.id)}
                      disabled={isDeleting === playlist.id}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-red-400 hover:text-red-300 disabled:opacity-50"
                      title="Delete playlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>{playlist.items.length} items • {Math.round(getTotalDuration(playlist.items) / 60)} min total</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {playlist.shuffle && (
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs flex items-center gap-1">
                        <Shuffle className="w-3 h-3" /> Shuffle
                      </span>
                    )}
                    {playlist.loop && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs flex items-center gap-1">
                        <Repeat className="w-3 h-3" /> Loop
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handlePlayPlaylist(playlist)}
                  className={`w-full px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    playingPlaylistId === playlist.id
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-primary-600 hover:bg-primary-700 text-white'
                  }`}
                >
                  {playingPlaylistId === playlist.id ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Stop Playback
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Play Playlist
                    </>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Playlist Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter playlist name"
                    className="input-field w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                    className="input-field w-full resize-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">Playlist Items *</label>
                    <button
                      onClick={handleAddItem}
                      className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
                    >
                      Add Preset
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {formItems.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">No items yet. Click "Add Preset" to get started.</p>
                    ) : (
                      formItems
                        .sort((a, b) => a.order - b.order)
                        .map((item, index) => (
                          <div key={item.id} className="glass-card p-4 flex items-center gap-3">
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleMoveItem(index, 'up')}
                                disabled={index === 0}
                                className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                              >
                                <ArrowUp className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={() => handleMoveItem(index, 'down')}
                                disabled={index === formItems.length - 1}
                                className="p-1 hover:bg-gray-700 rounded disabled:opacity-30"
                              >
                                <ArrowDown className="w-4 h-4 text-gray-400" />
                              </button>
                            </div>
                            <div className="flex-1">
                              <select
                                value={item.presetId}
                                onChange={(e) => handleUpdateItem(item.id, { presetId: e.target.value })}
                                className="input-field w-full mb-2"
                              >
                                <option value="">Select Preset...</option>
                                {presets.map(preset => (
                                  <option key={preset.id} value={preset.id}>
                                    {preset.name}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-400">Duration (seconds):</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.duration}
                                  onChange={(e) => handleUpdateItem(item.id, { duration: parseInt(e.target.value) || 1 })}
                                  className="input-field w-20 text-sm"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-2 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formShuffle}
                      onChange={(e) => setFormShuffle(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">Shuffle</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formLoop}
                      onChange={(e) => setFormLoop(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">Loop</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Target Devices/Groups/Virtuals *</label>
                  <TargetSelector
                    devices={devices}
                    groups={groups}
                    virtuals={virtuals}
                    selectedTargets={formTargets}
                    onTargetsChange={setFormTargets}
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowModal(false)}
                    disabled={isSaving}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePlaylist}
                    disabled={isSaving || !formName.trim() || formItems.length === 0 || formTargets.length === 0}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
    </div>
  );
}


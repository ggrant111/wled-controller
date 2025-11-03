'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Cpu, Users, Monitor } from 'lucide-react';
import DeviceCard from '../../components/DeviceCard';
import GroupCard from '../../components/GroupCard';
import VirtualCard from '../../components/VirtualCard';
import DeviceModal from '../../components/DeviceModal';
import VirtualDeviceModal from '../../components/VirtualDeviceModal';
import GroupModal from '../../components/GroupModal';
import { useToast } from '../../components/ToastProvider';
import { useModal } from '../../components/ModalProvider';
import { useSocket } from '../../hooks/useSocket';
import { WLEDDevice, Group, VirtualDevice } from '../../types';

type TabType = 'devices' | 'groups' | 'virtuals';

function DevicesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const { on, emit, isConnected } = useSocket();
  const tabParam = searchParams?.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(
    (tabParam && ['devices', 'groups', 'virtuals'].includes(tabParam)) ? tabParam : 'devices'
  );
  const [devices, setDevices] = useState<WLEDDevice[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [virtuals, setVirtuals] = useState<VirtualDevice[]>([]);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isVirtualModalOpen, setIsVirtualModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<WLEDDevice | null>(null);
  const [editingVirtual, setEditingVirtual] = useState<VirtualDevice | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalBrightness, setGlobalBrightness] = useState<number>(100);
  const [dataLoaded, setDataLoaded] = useState(false);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    router.push(`${pathname}?tab=${tab}`);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Trigger immediate health check when socket connects to sync brightness
  useEffect(() => {
    if (isConnected) {
      emit('request-health-check');
    }
  }, [isConnected, emit]);

  // Listen for device updates from health check
  useEffect(() => {
    if (!isConnected || !dataLoaded) return; // Wait until initial data is loaded

    const handleDevicesUpdated = (updatedDevices: WLEDDevice[]) => {
      // Only update devices if we have valid data
      // Merge updates by device ID to preserve existing devices if health check fails for some
      setDevices(prevDevices => {
        // If we have no previous devices, use the updated ones (from health check)
        if (prevDevices.length === 0 && updatedDevices.length > 0) {
          // Update global brightness from first device if available
          if (updatedDevices[0].segments.length > 0) {
            const firstDeviceBrightness = updatedDevices[0].segments[0].brightness || 1.0;
            setGlobalBrightness(Math.round(firstDeviceBrightness * 100));
          }
          return updatedDevices;
        }
        // If we have previous devices, merge the updates
        if (prevDevices.length > 0 && updatedDevices.length > 0) {
          // Create a map of updated devices by ID
          const updatedMap = new Map(updatedDevices.map(d => [d.id, d]));
          // Merge: use updated device if it exists, otherwise keep the previous one
          const merged = prevDevices.map(prevDevice => {
            const updated = updatedMap.get(prevDevice.id);
            return updated || prevDevice;
          });
          
          // Update global brightness from first device if available
          if (merged.length > 0 && merged[0].segments.length > 0) {
            const firstDeviceBrightness = merged[0].segments[0].brightness || 1.0;
            setGlobalBrightness(Math.round(firstDeviceBrightness * 100));
          }
          
          return merged;
        }
        // If updatedDevices is empty, don't clear - keep previous devices
        return prevDevices;
      });
    };

    on('devices-updated', handleDevicesUpdated);

    return () => {
      // Cleanup handled by socket hook
    };
  }, [isConnected, dataLoaded, on]);

  // Sync tab with URL parameter when it changes
  useEffect(() => {
    const tabParam = searchParams?.get('tab') as TabType | null;
    if (tabParam && ['devices', 'groups', 'virtuals'].includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  const loadData = async () => {
    try {
      const [devicesRes, groupsRes, virtualsRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals')
      ]);

      const loadedDevices = await devicesRes.json();
      setDevices(loadedDevices);
      setGroups(await groupsRes.json());
      setVirtuals(await virtualsRes.json());
      
      // Set initial global brightness from first device, or default to 100%
      if (loadedDevices.length > 0 && loadedDevices[0].segments.length > 0) {
        const firstDeviceBrightness = loadedDevices[0].segments[0].brightness || 1.0;
        setGlobalBrightness(Math.round(firstDeviceBrightness * 100));
      }
      
      // Mark data as loaded so we can process health check updates
      setDataLoaded(true);
    } catch (error) {
      console.error('Failed to load data:', error);
      setDataLoaded(true); // Still mark as loaded to prevent blocking
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = () => {
    setEditingDevice(null);
    setIsDeviceModalOpen(true);
  };

  const handleEditDevice = (device: WLEDDevice) => {
    setEditingDevice(device);
    setIsDeviceModalOpen(true);
  };

  const handleDeleteDevice = async (deviceId: string) => {
    showConfirm({
      message: 'Are you sure you want to delete this device?',
      title: 'Delete Device',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
      try {
        await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
        setDevices(devices.filter(d => d.id !== deviceId));
      } catch (error) {
        console.error('Failed to delete device:', error);
        showToast('Failed to delete device', 'error');
      }
      }
    });
  };

  const handleDeviceSaved = (device: WLEDDevice) => {
    if (editingDevice) {
      setDevices(devices.map(d => d.id === device.id ? device : d));
    } else {
      setDevices([...devices, device]);
    }
    setIsDeviceModalOpen(false);
  };

  const handleAddVirtual = () => {
    setEditingVirtual(null);
    setIsVirtualModalOpen(true);
  };

  const handleEditVirtual = (virtual: VirtualDevice) => {
    setEditingVirtual(virtual);
    setIsVirtualModalOpen(true);
  };

  const handleDeleteVirtual = async (virtualId: string) => {
    showConfirm({
      message: 'Are you sure you want to delete this virtual device?',
      title: 'Delete Virtual Device',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
      try {
        await fetch(`/api/virtuals/${virtualId}`, { method: 'DELETE' });
        setVirtuals(virtuals.filter(v => v.id !== virtualId));
      } catch (error) {
        console.error('Failed to delete virtual device:', error);
        showToast('Failed to delete virtual device', 'error');
      }
      }
    });
  };

  const handleVirtualSaved = async (virtual: VirtualDevice) => {
    try {
      const response = editingVirtual
        ? await fetch(`/api/virtuals/${virtual.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(virtual)
          })
        : await fetch('/api/virtuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(virtual)
          });

      if (!response.ok) {
        throw new Error('Failed to save virtual device');
      }

      const savedVirtual = await response.json();
      
      if (editingVirtual) {
        // Update existing virtual
        setVirtuals(prev => prev.map(v => v.id === savedVirtual.id ? savedVirtual : v));
      } else {
        // Add new virtual - check if it already exists to prevent duplicates
        setVirtuals(prev => {
          if (prev.find(v => v.id === savedVirtual.id)) {
            // Already exists, just update it
            return prev.map(v => v.id === savedVirtual.id ? savedVirtual : v);
          } else {
            // Doesn't exist, add it
            return [...prev, savedVirtual];
          }
        });
      }
      setIsVirtualModalOpen(false);
      setEditingVirtual(null);
    } catch (error) {
      console.error('Failed to save virtual device:', error);
      showToast('Failed to save virtual device', 'error');
    }
  };

  const handleAddGroup = () => {
    setEditingGroup(null);
    setIsGroupModalOpen(true);
  };

  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setIsGroupModalOpen(true);
  };

  const handleDeleteGroup = async (groupId: string) => {
    showConfirm({
      message: 'Are you sure you want to delete this group?',
      title: 'Delete Group',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
      try {
        await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
        setGroups(groups.filter(g => g.id !== groupId));
      } catch (error) {
        console.error('Failed to delete group:', error);
        showToast('Failed to delete group', 'error');
      }
      }
    });
  };

  const handleGroupSaved = async (group: Group) => {
    try {
      const response = editingGroup
        ? await fetch(`/api/groups/${group.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(group)
          })
        : await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(group)
          });

      const savedGroup = await response.json();
      
      if (editingGroup) {
        setGroups(prev => prev.map(g => g.id === savedGroup.id ? savedGroup : g));
      } else {
        setGroups(prev => {
          if (prev.find(g => g.id === savedGroup.id)) {
            // Already exists, just update it
            return prev.map(g => g.id === savedGroup.id ? savedGroup : g);
          } else {
            // Doesn't exist, add it
            return [...prev, savedGroup];
          }
        });
      }
      setIsGroupModalOpen(false);
      setEditingGroup(null);
    } catch (error) {
      console.error('Failed to save group:', error);
      showToast('Failed to save group', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading devices...</p>
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
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold mb-2">Devices</h1>
          <p className="text-white/70">Manage devices, groups, and virtual layouts</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-2"
      >
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => handleTabChange('devices')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'devices'
                ? 'bg-primary-500/20 text-primary-500'
                : 'hover:bg-white/10 text-white/70'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span className="font-medium">Devices</span>
            {devices.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">
                {devices.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => handleTabChange('groups')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'groups'
                ? 'bg-primary-500/20 text-primary-500'
                : 'hover:bg-white/10 text-white/70'
            }`}
          >
            <Users className="h-4 w-4" />
            <span className="font-medium">Groups</span>
            {groups.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">
                {groups.length}
              </span>
            )}
          </button>
          
          <button
            onClick={() => handleTabChange('virtuals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'virtuals'
                ? 'bg-primary-500/20 text-primary-500'
                : 'hover:bg-white/10 text-white/70'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span className="font-medium">Virtuals</span>
            {virtuals.length > 0 && (
              <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">
                {virtuals.length}
              </span>
            )}
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Devices Tab */}
        {activeTab === 'devices' && (
          <>
            <div className="flex items-center justify-between gap-4">
              {devices.length > 0 && (
                <div className="flex items-center gap-4 flex-1 max-w-md">
                  <label className="text-sm text-white/70 whitespace-nowrap">Global Brightness:</label>
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={globalBrightness}
                      onChange={(e) => setGlobalBrightness(Number(e.target.value))}
                      onMouseUp={async () => {
                        // Send brightness update directly to all WLED devices and update storage
                        try {
                          const brightnessValue = globalBrightness / 100; // Convert to 0-1 range for storage
                          const wledBrightness = Math.round(globalBrightness * 255 / 100); // Convert to 0-255 for WLED

                          // Send brightness directly to all WLED devices via proxy (in parallel)
                          const devicePromises = devices
                            .filter(device => device.isOnline)
                            .map(device =>
                              fetch(`/api/wled/${encodeURIComponent(device.ip)}/brightness`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ brightness: wledBrightness })
                              }).catch(error => {
                                console.warn(`Failed to update brightness on ${device.name}:`, error);
                                return { ok: false, device: device.name };
                              })
                            );

                          // Update storage for all devices (don't send to device since we already did)
                          const storagePromises = devices.map(device =>
                            fetch('/api/brightness', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                targetType: 'device',
                                targetId: device.id,
                                brightness: brightnessValue,
                                sendToDevice: false // Already sent directly above
                              })
                            })
                          );

                          await Promise.all([...devicePromises, ...storagePromises]);
                          showToast(`Brightness set to ${globalBrightness}% for all devices`, 'success');
                        } catch (error) {
                          console.error('Error updating brightness for all devices:', error);
                          showToast('Failed to update brightness for all devices', 'error');
                        }
                      }}
                      onTouchEnd={async () => {
                        // Handle touch events for mobile devices
                        try {
                          const brightnessValue = globalBrightness / 100; // Convert to 0-1 range for storage
                          const wledBrightness = Math.round(globalBrightness * 255 / 100); // Convert to 0-255 for WLED

                          // Send brightness directly to all WLED devices via proxy (in parallel)
                          const devicePromises = devices
                            .filter(device => device.isOnline)
                            .map(device =>
                              fetch(`/api/wled/${encodeURIComponent(device.ip)}/brightness`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ brightness: wledBrightness })
                              }).catch(error => {
                                console.warn(`Failed to update brightness on ${device.name}:`, error);
                                return { ok: false, device: device.name };
                              })
                            );

                          // Update storage for all devices (don't send to device since we already did)
                          const storagePromises = devices.map(device =>
                            fetch('/api/brightness', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                targetType: 'device',
                                targetId: device.id,
                                brightness: brightnessValue,
                                sendToDevice: false // Already sent directly above
                              })
                            })
                          );

                          await Promise.all([...devicePromises, ...storagePromises]);
                          showToast(`Brightness set to ${globalBrightness}% for all devices`, 'success');
                        } catch (error) {
                          console.error('Error updating brightness for all devices:', error);
                          showToast('Failed to update brightness for all devices', 'error');
                        }
                      }}
                      className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500"
                      style={{
                        background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${globalBrightness}%, rgba(255, 255, 255, 0.1) ${globalBrightness}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                    <span className="font-mono text-sm min-w-[3rem] text-right">{globalBrightness}%</span>
                  </div>
                </div>
              )}
              <button
                onClick={handleAddDevice}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Device
              </button>
            </div>

            {devices.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Cpu className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No devices added</h3>
                <p className="text-white/70 mb-4">Add your first WLED device to get started</p>
                <button onClick={handleAddDevice} className="btn-primary">
                  Add Device
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {devices.map((device, index) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onEdit={() => handleEditDevice(device)}
                    onDelete={() => handleDeleteDevice(device.id)}
                    delay={index * 0.1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <>
            <div className="flex justify-end">
              <button 
                onClick={handleAddGroup}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Group
              </button>
            </div>

            {groups.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Users className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No groups created</h3>
                <p className="text-white/70 mb-4">Create groups to control multiple devices together</p>
                <button onClick={handleAddGroup} className="btn-primary">Add Group</button>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group, index) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    onEdit={() => handleEditGroup(group)}
                    onDelete={() => handleDeleteGroup(group.id)}
                    delay={index * 0.1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Virtuals Tab */}
        {activeTab === 'virtuals' && (
          <>
            <div className="flex justify-end">
              <button 
                onClick={handleAddVirtual}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Add Virtual
              </button>
            </div>

            {virtuals.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Monitor className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No virtual devices created</h3>
                <p className="text-white/70 mb-4">Create virtual devices with custom LED layouts</p>
                <button onClick={handleAddVirtual} className="btn-primary">Add Virtual Device</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {virtuals.map((virtual, index) => (
                  <VirtualCard
                    key={virtual.id}
                    virtual={virtual}
                    onEdit={() => handleEditVirtual(virtual)}
                    onDelete={() => handleDeleteVirtual(virtual.id)}
                    delay={index * 0.1}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* Device Modal */}
      {isDeviceModalOpen && (
        <DeviceModal
          device={editingDevice}
          onSave={handleDeviceSaved}
          onClose={() => setIsDeviceModalOpen(false)}
        />
      )}

      {/* Virtual Device Modal */}
      {isVirtualModalOpen && (
        <VirtualDeviceModal
          devices={devices}
          virtual={editingVirtual}
          onSave={handleVirtualSaved}
          onClose={() => setIsVirtualModalOpen(false)}
        />
      )}

      {/* Group Modal */}
      {isGroupModalOpen && (
        <GroupModal
          devices={devices}
          virtuals={virtuals}
          group={editingGroup || undefined}
          onSave={handleGroupSaved}
          onClose={() => setIsGroupModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="glass-card p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <DevicesPageContent />
    </Suspense>
  );
}


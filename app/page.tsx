'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Cpu, Users, Monitor, Zap, Wifi, WifiOff, Save, Calendar } from 'lucide-react';
import type { Schedule, ScheduleRule, WLEDDevice, Group, VirtualDevice, EffectPreset, ScheduleSequenceItem } from '../types';

export default function Dashboard() {
  const router = useRouter();
  const [devices, setDevices] = useState(0);
  const [groups, setGroups] = useState(0);
  const [virtuals, setVirtuals] = useState(0);
  const [effects, setEffects] = useState(14);
  const [presets, setPresets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeStreams, setActiveStreams] = useState(0);
  const [activeDevices, setActiveDevices] = useState<{ id: string; name: string }[]>([]);
  const [activeGroups, setActiveGroups] = useState<{ id: string; name: string }[]>([]);
  const [activeVirtuals, setActiveVirtuals] = useState<{ id: string; name: string }[]>([]);
  const [totalLeds, setTotalLeds] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [devicesList, setDevicesList] = useState<WLEDDevice[]>([]);
  const [groupsList, setGroupsList] = useState<Group[]>([]);
  const [virtualsList, setVirtualsList] = useState<VirtualDevice[]>([]);
  const [presetsList, setPresetsList] = useState<EffectPreset[]>([]);
  const [activeSchedules, setActiveSchedules] = useState<Array<{
    scheduleId: string;
    scheduleName: string;
    ruleId: string;
    ruleName: string;
    endAt: number | null;
    startTime: number;
    targets: any[];
    sequence: ScheduleSequenceItem[];
  }>>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [devicesRes, groupsRes, virtualsRes, presetsRes, sessionsRes, activeTargetsRes, schedulesRes, activeSchedulesRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/groups'),
        fetch('/api/virtuals'),
        fetch('/api/presets'),
        fetch('/api/stream/sessions'),
        fetch('/api/stream/active-targets'),
        fetch('/api/schedules'),
        fetch('/api/schedules/active')
      ]);

      const devicesData = await devicesRes.json();
      const groupsData = await groupsRes.json();
      const virtualsData = await virtualsRes.json();
      const presetsData = await presetsRes.json();
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { count: 0 };
      const activeTargets = activeTargetsRes.ok ? await activeTargetsRes.json() : { devices: [], groups: [], virtuals: [], counts: { sessions: 0 } };
      const schedulesData = schedulesRes.ok ? await schedulesRes.json() : [];
      const activeSchedulesData = activeSchedulesRes.ok ? await activeSchedulesRes.json() : [];

      setDevices(devicesData.length);
      setTotalLeds(Array.isArray(devicesData) ? devicesData.reduce((sum: number, d: any) => sum + (d?.ledCount || 0), 0) : 0);
      setGroups(groupsData.length);
      setVirtuals(virtualsData.length);
      setPresets(presetsData.length);
      setActiveStreams(sessionsData.count || activeTargets.counts?.sessions || 0);
      setActiveDevices(activeTargets.devices || []);
      setActiveGroups(activeTargets.groups || []);
      setActiveVirtuals(activeTargets.virtuals || []);
      setSchedules(schedulesData);
      setDevicesList(devicesData);
      setGroupsList(groupsData);
      setVirtualsList(virtualsData);
      setPresetsList(presetsData);
      setActiveSchedules(activeSchedulesData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Update current time every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      // Refresh active schedules periodically
      fetch('/api/schedules/active')
        .then(res => res.ok ? res.json() : [])
        .then(data => setActiveSchedules(data))
        .catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper function to format duration
  const formatDuration = (ms: number): string => {
    if (ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Helper function to calculate next occurrence time for a rule
  const calculateNextOccurrence = (rule: ScheduleRule, now: Date): Date | null => {
    const today = now.getDay();
    const matchesDay = !rule.daysOfWeek || rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(today);

    if (!matchesDay && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const nextDay = rule.daysOfWeek.find(d => d > today) || rule.daysOfWeek[0];
      if (nextDay === undefined) return null;
      
      const daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + daysUntil);
      
      if (rule.startType === 'time' && rule.startTime) {
        const [hours, minutes] = rule.startTime.split(':').map(Number);
        nextDate.setHours(hours, minutes, 0, 0);
        return nextDate;
      }
      return null;
    }

    if (rule.startType === 'time' && rule.startTime) {
      const [hours, minutes] = rule.startTime.split(':').map(Number);
      const scheduleTime = new Date(now);
      scheduleTime.setHours(hours, minutes, 0, 0);

      if (scheduleTime > now) {
        return scheduleTime;
      } else {
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          const nextDay = rule.daysOfWeek.find(d => d > today) || rule.daysOfWeek[0];
          if (nextDay !== undefined) {
            const daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
            const nextDate = new Date(now);
            nextDate.setDate(nextDate.getDate() + daysUntil);
            nextDate.setHours(hours, minutes, 0, 0);
            return nextDate;
          }
        } else {
          const nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setHours(hours, minutes, 0, 0);
          return nextDate;
        }
      }
    } else if (rule.startType === 'sunrise' || rule.startType === 'sunset') {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Placeholder
    }
    return null;
  };

  // Calculate up to 3 next schedules
  const nextSchedules = useMemo(() => {
    const now = new Date();
    const enabledSchedules = schedules.filter(s => s.enabled);
    if (enabledSchedules.length === 0) return [];

    const allUpcoming: Array<{
      schedule: Schedule;
      rule: ScheduleRule;
      time: Date;
      dayName: string;
      displayTime: string;
      targetNames: string[];
      effectNames: string[];
      isActive: boolean;
      timeRemaining?: number;
    }> = [];

    // First, add currently active schedules
    for (const active of activeSchedules) {
      const schedule = schedules.find(s => s.id === active.scheduleId);
      const rule = schedule?.rules.find(r => r.id === active.ruleId);
      if (!schedule || !rule) continue;

      // Resolve target names
      const targetNames: string[] = [];
      for (const target of active.targets) {
        if (target.type === 'device') {
          const device = devicesList.find(d => d.id === target.id);
          if (device) targetNames.push(device.name);
        } else if (target.type === 'group') {
          const group = groupsList.find(g => g.id === target.id);
          if (group) targetNames.push(`Group: ${group.name}`);
        } else if (target.type === 'virtual') {
          const virtual = virtualsList.find(v => v.id === target.id);
          if (virtual) targetNames.push(`Virtual: ${virtual.name}`);
        }
      }

      // Get effect/preset names from sequence
      const effectNames: string[] = [];
      for (const item of active.sequence) {
        if (item.presetId) {
          const preset = presetsList.find(p => p.id === item.presetId);
          if (preset) effectNames.push(preset.name);
        } else if (item.effect) {
          effectNames.push(item.effect.name || 'Inline Effect');
        }
      }

      const timeRemaining = active.endAt ? active.endAt - currentTime : null;

      allUpcoming.push({
        schedule,
        rule,
        time: new Date(active.startTime),
        dayName: 'Now',
        displayTime: 'Running',
        targetNames,
        effectNames,
        isActive: true,
        timeRemaining: timeRemaining || undefined
      });
    }

    // Then, find upcoming schedules
    for (const schedule of enabledSchedules) {
      // Skip if already in active list
      if (allUpcoming.some(s => s.schedule.id === schedule.id)) continue;

      for (const rule of schedule.rules) {
        if (!rule.enabled) continue;
        
        // Skip if this rule is already active
        if (activeSchedules.some(a => a.ruleId === rule.id)) continue;

        const nextTime = calculateNextOccurrence(rule, now);
        if (!nextTime) continue;

        // Resolve target names
        const targetNames: string[] = [];
        for (const target of rule.targets) {
          if (target.type === 'device') {
            const device = devicesList.find(d => d.id === target.id);
            if (device) targetNames.push(device.name);
          } else if (target.type === 'group') {
            const group = groupsList.find(g => g.id === target.id);
            if (group) targetNames.push(`Group: ${group.name}`);
          } else if (target.type === 'virtual') {
            const virtual = virtualsList.find(v => v.id === target.id);
            if (virtual) targetNames.push(`Virtual: ${virtual.name}`);
          }
        }

        // Get effect/preset names from sequence
        const effectNames: string[] = [];
        for (const item of rule.sequence) {
          if (item.presetId) {
            const preset = presetsList.find(p => p.id === item.presetId);
            if (preset) effectNames.push(preset.name);
          } else if (item.effect) {
            effectNames.push(item.effect.name || 'Inline Effect');
          }
        }

        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = daysOfWeek[nextTime.getDay()];
        let displayTime = nextTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        if (rule.startType === 'sunrise') {
          displayTime = 'Sunrise' + (rule.startOffsetMinutes ? ` ${rule.startOffsetMinutes > 0 ? '+' : ''}${rule.startOffsetMinutes}m` : '');
        } else if (rule.startType === 'sunset') {
          displayTime = 'Sunset' + (rule.startOffsetMinutes ? ` ${rule.startOffsetMinutes > 0 ? '+' : ''}${rule.startOffsetMinutes}m` : '');
        }

        allUpcoming.push({
          schedule,
          rule,
          time: nextTime,
          dayName,
          displayTime,
          targetNames,
          effectNames,
          isActive: false
        });
      }
    }

    // Sort: active first, then by time
    allUpcoming.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.isActive && b.isActive) {
        const aRemaining = a.timeRemaining || 0;
        const bRemaining = b.timeRemaining || 0;
        return aRemaining - bRemaining;
      }
      return a.time.getTime() - b.time.getTime();
    });

    return allUpcoming.slice(0, 3);
  }, [schedules, devicesList, groupsList, virtualsList, presetsList, activeSchedules, currentTime]);

  const enabledSchedulesCount = useMemo(() => {
    return schedules.filter(s => s.enabled).length;
  }, [schedules]);

  // Helper function to get countdown text
  const getCountdownText = (targetTime: Date): string => {
    const diff = targetTime.getTime() - currentTime;
    if (diff <= 0) return 'Now';
    return formatDuration(diff);
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
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/devices')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Devices</p>
              <p className="text-3xl font-bold">{devices}</p>
            </div>
            <Cpu className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Total WLED devices</p>
        </div>
        
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/devices?tab=groups')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Groups</p>
              <p className="text-3xl font-bold">{groups}</p>
            </div>
            <Users className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Device groups</p>
        </div>
        
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/devices?tab=virtuals')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Virtuals</p>
              <p className="text-3xl font-bold">{virtuals}</p>
            </div>
            <Monitor className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Virtual layouts</p>
        </div>
        
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/effects')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Effects</p>
              <p className="text-3xl font-bold">{effects}</p>
            </div>
            <Zap className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Available effects</p>
        </div>
        
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/presets')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Presets</p>
              <p className="text-3xl font-bold">{presets}</p>
            </div>
            <Save className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Saved presets</p>
        </div>

        {/* Active Streams Tile */}
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/streams')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Active Streams</p>
              <p className="text-3xl font-bold">{activeStreams}</p>
            </div>
            <Wifi className="h-10 w-10 text-primary-500" />
          </div>
          <div className="text-xs text-white/50 mt-2 space-y-1">
            <p>
              <span className="text-white/70">Devices:</span> {activeDevices.length > 0 ? activeDevices.map(d => d.name).join(', ') : 'None'}
            </p>
            <p>
              <span className="text-white/70">Groups:</span> {activeGroups.length > 0 ? activeGroups.map(g => g.name).join(', ') : 'None'}
            </p>
            <p>
              <span className="text-white/70">Virtuals:</span> {activeVirtuals.length > 0 ? activeVirtuals.map(v => v.name).join(', ') : 'None'}
            </p>
          </div>
        </div>

        {/* Total LEDs Tile */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm mb-1">Total LEDs</p>
              <p className="text-3xl font-bold">{totalLeds}</p>
            </div>
            <Monitor className="h-10 w-10 text-primary-500" />
          </div>
          <p className="text-xs text-white/50 mt-2">Sum of LEDs across all devices</p>
        </div>
      </motion.div>

      {/* Schedule Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div 
          className="glass-card p-6 cursor-pointer hover:bg-white/10 transition-colors"
          onClick={() => router.push('/schedule')}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary-500" />
              <div>
                <h2 className="text-xl font-bold">Schedules</h2>
                <p className="text-sm text-white/70">{enabledSchedulesCount} enabled schedule{enabledSchedulesCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {nextSchedules.length > 0 ? (
            <div className="space-y-3">
              {nextSchedules.map((scheduleInfo, index) => (
                <div key={`${scheduleInfo.schedule.id}-${scheduleInfo.rule.id}-${index}`}>
                  {index === 0 && scheduleInfo.isActive ? (
                    <p className="text-sm text-white/70 mb-1">Currently Running</p>
                  ) : index === 0 ? (
                    <p className="text-sm text-white/70 mb-1">Next Schedule</p>
                  ) : (
                    <p className="text-sm text-white/70 mb-1">Upcoming</p>
                  )}
                  <div className={`bg-white/5 rounded-lg p-4 space-y-2 ${scheduleInfo.isActive ? 'ring-2 ring-primary-500' : ''}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-lg">{scheduleInfo.schedule.name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white/70">{scheduleInfo.rule.name}</p>
                        {scheduleInfo.isActive && (
                          <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded">Running</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-white/70">Day: </span>
                        <span className="text-white">{scheduleInfo.dayName}</span>
                      </div>
                      <div>
                        <span className="text-white/70">Time: </span>
                        <span className="text-white">{scheduleInfo.displayTime}</span>
                      </div>
                      <div className="ml-auto">
                        {scheduleInfo.isActive && scheduleInfo.timeRemaining ? (
                          <>
                            <span className="text-white/70">Time Remaining: </span>
                            <span className="text-primary-400 font-semibold">{formatDuration(scheduleInfo.timeRemaining)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-white/70">In: </span>
                            <span className="text-primary-400 font-semibold">{getCountdownText(scheduleInfo.time)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {scheduleInfo.targetNames.length > 0 && (
                      <div className="text-sm">
                        <span className="text-white/70">Targets: </span>
                        <span className="text-white">{scheduleInfo.targetNames.join(', ') || 'None'}</span>
                      </div>
                    )}
                    {scheduleInfo.effectNames.length > 0 && (
                      <div className="text-sm">
                        <span className="text-white/70">Effects: </span>
                        <span className="text-white">{scheduleInfo.effectNames.join(', ') || 'None'}</span>
                      </div>
                    )}
                    {scheduleInfo.effectNames.length === 0 && scheduleInfo.rule.sequence.length === 0 && (
                      <div className="text-sm text-white/50">No effects configured</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : enabledSchedulesCount > 0 ? (
            <div className="text-sm text-white/50">No upcoming schedules found</div>
          ) : (
            <div className="text-sm text-white/50">No enabled schedules</div>
          )}
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
            <a href="/presets" className="block btn-secondary text-center">
              View Presets
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
            <div 
              className="flex items-center justify-between cursor-pointer hover:bg-white/5 rounded px-2 py-1 -mx-2 -my-1 transition-colors"
              onClick={() => router.push('/streams')}
            >
              <span className="text-white/70">Active Streams</span>
              <span className="text-primary-500">{activeStreams}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Removed devices receiving stream section; summarized in the tile above */}
    </div>
  );
}

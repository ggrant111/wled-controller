"use client";
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Schedule, ScheduleRule, StreamTarget, EffectPreset, LocationSettings } from '../../types';
import { useToast } from '../../components/ToastProvider';
import { useModal } from '../../components/ModalProvider';
import Toggle from '../../components/Toggle';

export default function SchedulePage() {
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [virtuals, setVirtuals] = useState<Array<{ id: string; name: string }>>([]);
  const [locationSettings, setLocationSettings] = useState<LocationSettings>({});

  useEffect(() => {
    (async () => {
      try {
        const [sRes, pRes, dRes, gRes, vRes, locRes] = await Promise.all([
          fetch('/api/schedules'),
          fetch('/api/presets'),
          fetch('/api/devices'),
          fetch('/api/groups'),
          fetch('/api/virtuals'),
          fetch('/api/settings/location')
        ]);
        if (sRes.ok) setSchedules(await sRes.json());
        if (pRes.ok) setPresets(await pRes.json());
        if (dRes.ok) {
          const d = await dRes.json();
          setDevices(d.map((x: any) => ({ id: x.id, name: x.name })));
        }
        if (gRes.ok) {
          const g = await gRes.json();
          setGroups(g.map((x: any) => ({ id: x.id, name: x.name })));
        }
        if (vRes.ok) {
          const v = await vRes.json();
          setVirtuals(v.map((x: any) => ({ id: x.id, name: x.name })));
        }
        if (locRes.ok) {
          const loc = await locRes.json();
          setLocationSettings(loc || {});
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = () => {
    const newSchedule: Schedule = {
      id: '',
      name: 'New Schedule',
      enabled: true,
      rules: [
        {
          id: uuidv4(),
          name: 'Rule 1',
          enabled: true,
          targets: [],
          daysOfWeek: [1,2,3,4,5],
          startType: 'time',
          startTime: '18:00',
          durationSeconds: 3600,
          rampOnStart: false,
          rampOffEnd: false,
          rampDurationSeconds: 10,
          sequence: [],
          sequenceLoop: false,
          sequenceShuffle: false,
          fps: 30
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditing(newSchedule);
  };

  const saveSchedule = async (sched: Schedule) => {
    setSaving(true);
    try {
      if (sched.id) {
        const res = await fetch(`/api/schedules/${sched.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sched) });
        if (res.ok) {
          const updated = await res.json();
          setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
          setEditing(null);
        }
      } else {
        const res = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sched) });
        if (res.ok) {
          const created = await res.json();
          setSchedules(prev => [...prev, created]);
          setEditing(null);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async (id: string) => {
    showConfirm({
      message: 'Delete schedule?',
      title: 'Delete Schedule',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
    try {
      console.log('Attempting to delete schedule with ID:', id);
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      console.log('Delete response status:', res.status, res.statusText);
      
      if (res.ok) {
        setSchedules(prev => prev.filter(s => s.id !== id));
        showToast('Schedule deleted successfully', 'success');
      } else {
        const contentType = res.headers.get('content-type');
        console.log('Response content-type:', contentType);
        
        let errorMessage = 'Unknown error';
        if (contentType?.includes('application/json')) {
          try {
            const error = await res.json();
            console.error('Failed to delete schedule - error response:', error);
            errorMessage = error.error || error.message || JSON.stringify(error) || 'Unknown error';
          } catch (e) {
            console.error('Failed to parse error response as JSON:', e);
            const text = await res.text().catch(() => '');
            console.error('Response text:', text);
            errorMessage = text || 'Failed to parse error response';
          }
        } else {
          const text = await res.text().catch(() => '');
          console.error('Non-JSON response:', text);
          errorMessage = text || `Server returned ${res.status} ${res.statusText}`;
        }
        
        showToast(`Failed to delete schedule: ${errorMessage}`, 'error');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(`Error deleting schedule: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
      }
    });
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-semibold">Schedules</h2>
        <button onClick={handleCreate} className="btn-primary">New Schedule</button>
      </div>

      {editing ? (
        <ScheduleEditor
          value={editing}
          presets={presets}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={saveSchedule}
          locationSettings={locationSettings}
        />
      ) : (
        <ScheduleList
          items={schedules}
          onEdit={setEditing}
          onDelete={removeSchedule}
          presets={presets}
          devices={devices}
          groups={groups}
          virtuals={virtuals}
        />
      )}
    </div>
  );
}

function ScheduleList({ 
  items, 
  onEdit, 
  onDelete,
  presets,
  devices,
  groups,
  virtuals
}: { 
  items: Schedule[]; 
  onEdit: (s: Schedule)=>void; 
  onDelete: (id: string)=>void;
  presets: EffectPreset[];
  devices: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  virtuals: Array<{ id: string; name: string }>;
}) {
  if (items.length === 0) return <div className="text-gray-400">No schedules yet.</div>;
  
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const getTargetNames = (targets: StreamTarget[]): string[] => {
    return targets.map(t => {
      if (t.type === 'device') {
        const d = devices.find(x => x.id === t.id);
        return d ? d.name : `Device: ${t.id}`;
      } else if (t.type === 'group') {
        const g = groups.find(x => x.id === t.id);
        return g ? `Group: ${g.name}` : `Group: ${t.id}`;
      } else if (t.type === 'virtual') {
        const v = virtuals.find(x => x.id === t.id);
        return v ? `Virtual: ${v.name}` : `Virtual: ${t.id}`;
      }
      return '';
    });
  };
  
  const getEffectNames = (rule: ScheduleRule): string[] => {
    return rule.sequence.map(item => {
      if (item.presetId) {
        const p = presets.find(x => x.id === item.presetId);
        return p ? p.name : `Preset: ${item.presetId}`;
      } else if (item.effect) {
        return item.effect.name || 'Inline Effect';
      } else if (item.layers) {
        return `${item.layers.length} layer(s)`;
      }
      return 'Unknown';
    });
  };
  
  const formatTime = (rule: ScheduleRule): string => {
    if (rule.startType === 'time' && rule.startTime) {
      return rule.startTime;
    } else if (rule.startType === 'sunrise') {
      return `Sunrise${rule.startOffsetMinutes ? ` ${rule.startOffsetMinutes > 0 ? '+' : ''}${rule.startOffsetMinutes}m` : ''}`;
    } else if (rule.startType === 'sunset') {
      return `Sunset${rule.startOffsetMinutes ? ` ${rule.startOffsetMinutes > 0 ? '+' : ''}${rule.startOffsetMinutes}m` : ''}`;
    }
    return 'N/A';
  };
  
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${secs}s`;
  };
  
  return (
    <div className="space-y-4">
      {items.map(s => (
        <div key={s.id} className="glass-card glass-card-hover p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold truncate">{s.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                  s.enabled 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {s.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-sm text-white/70">{s.rules.length} rule{s.rules.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button 
                onClick={()=>onEdit(s)} 
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Edit schedule"
              >
                <Edit className="h-4 w-4" />
              </button>
              <button 
                onClick={()=>onDelete(s.id)} 
                className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                title="Delete schedule"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>
          </div>
          
          <div className="space-y-2 mt-3 pt-3 border-t border-white/10">
            {s.rules.map((rule, idx) => (
              <div key={rule.id || idx} className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-white/90">{rule.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      rule.enabled 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {rule.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {/* Days */}
                  <div className="flex justify-between">
                    <span className="text-white/70">Days:</span>
                    <span className="text-white">
                      {rule.daysOfWeek && rule.daysOfWeek.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {rule.daysOfWeek.map(d => (
                            <span key={d} className="px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300 text-xs">
                              {daysOfWeek[d].substring(0, 3)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-white/50">Every day</span>
                      )}
                    </span>
                  </div>
                  
                  {/* Time */}
                  <div className="flex justify-between">
                    <span className="text-white/70">Start:</span>
                    <span className="text-white font-medium">{formatTime(rule)}</span>
                  </div>
                  
                  {/* Duration/End */}
                  <div className="flex justify-between">
                    <span className="text-white/70">
                      {rule.endType ? 'End:' : 'Duration:'}
                    </span>
                    <span className="text-white">
                      {rule.endType === 'time' && rule.endTime ? rule.endTime :
                       rule.endType === 'sunrise' ? `Sunrise${rule.endOffsetMinutes ? ` ${rule.endOffsetMinutes > 0 ? '+' : ''}${rule.endOffsetMinutes}m` : ''}` :
                       rule.endType === 'sunset' ? `Sunset${rule.endOffsetMinutes ? ` ${rule.endOffsetMinutes > 0 ? '+' : ''}${rule.endOffsetMinutes}m` : ''}` :
                       rule.durationSeconds ? formatDuration(rule.durationSeconds) : 'Indefinite'}
                    </span>
                  </div>
                  
                  {/* FPS */}
                  {rule.fps && (
                    <div className="flex justify-between">
                      <span className="text-white/70">FPS:</span>
                      <span className="text-white">{rule.fps}</span>
                    </div>
                  )}
                  
                  {/* Targets */}
                  <div className="md:col-span-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-white/70">Targets:</span>
                      <span className="text-white text-right flex-1">
                        {rule.targets.length > 0 ? (
                          <span className="inline-flex flex-wrap gap-1 justify-end">
                            {getTargetNames(rule.targets).map((name, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-white/10 text-xs">
                                {name}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-white/50">None</span>
                        )}
                      </span>
                    </div>
                  </div>
                  
                  {/* Sequence */}
                  {rule.sequence.length > 0 && (
                    <div className="md:col-span-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-white/70">Sequence:</span>
                        <div className="flex-1 text-right space-y-0.5">
                          {rule.sequence.map((item, seqIdx) => {
                            const effectName = item.presetId 
                              ? (presets.find(p => p.id === item.presetId)?.name || `Preset: ${item.presetId}`)
                              : item.effect?.name || item.layers ? `${item.layers?.length || 0} layer(s)` : 'Unknown';
                            return (
                              <div key={seqIdx} className="text-white text-xs flex items-center justify-end gap-1">
                                <span>{effectName}</span>
                                {item.durationSeconds && (
                                  <span className="text-white/50">
                                    ({formatDuration(item.durationSeconds)})
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {(rule.sequenceLoop || rule.sequenceShuffle) && (
                            <div className="text-xs text-white/50 mt-1 flex justify-end gap-1">
                              {rule.sequenceLoop && <span>Loop</span>}
                              {rule.sequenceLoop && rule.sequenceShuffle && <span>·</span>}
                              {rule.sequenceShuffle && <span>Shuffle</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Ramp Settings */}
                  {(rule.rampOnStart || rule.rampOffEnd) && (
                    <div className="md:col-span-2 flex justify-between items-center">
                      <span className="text-white/70 text-xs">Ramp:</span>
                      <div className="text-xs text-white/60">
                        {rule.rampOnStart && <span>Up</span>}
                        {rule.rampOnStart && rule.rampOffEnd && <span className="mx-1">/</span>}
                        {rule.rampOffEnd && <span>Down</span>}
                        {rule.rampDurationSeconds && (
                          <span className="ml-1">({rule.rampDurationSeconds}s)</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Holiday Settings */}
                  {(rule.onHolidaysOnly || rule.skipOnHolidays) && (
                    <div className="md:col-span-2 flex justify-between items-center">
                      <span className="text-white/70 text-xs">Holidays:</span>
                      <div className="text-xs text-white/60">
                        {rule.onHolidaysOnly && <span>Only</span>}
                        {rule.onHolidaysOnly && rule.skipOnHolidays && <span className="mx-1">·</span>}
                        {rule.skipOnHolidays && <span>Skip</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleEditor({ value, onCancel, onSave, presets, saving, locationSettings }: { value: Schedule; onCancel: ()=>void; onSave: (s: Schedule)=>void; presets: EffectPreset[]; saving: boolean; locationSettings?: LocationSettings }) {
  const [sched, setSched] = useState<Schedule>(value);
  const [customOffsetMode, setCustomOffsetMode] = useState<Map<string, boolean>>(new Map());
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string }>>([]);
  const update = (patch: Partial<Schedule>) => setSched(prev => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
  
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/holidays');
        if (response.ok) {
          const data = await response.json();
          setHolidays(data.map((h: any) => ({ id: h.id, name: h.name })));
        }
      } catch (e) {
        console.error('Failed to load holidays:', e);
      }
    })();
  }, []);
  const updateRule = (idx: number, patch: Partial<ScheduleRule>) => {
    const rules = [...sched.rules];
    const currentRule = rules[idx];
    const updatedRule = { ...currentRule, ...patch } as ScheduleRule;
    
    // Auto-populate lat/lon from location settings when sunrise/sunset is selected and lat/lon not set
    const isStartSunriseSunset = (patch.startType === 'sunrise' || patch.startType === 'sunset') || 
                                  (currentRule.startType === 'sunrise' || currentRule.startType === 'sunset');
    if (isStartSunriseSunset && 
        locationSettings?.latitude && locationSettings?.longitude &&
        !updatedRule.latitude && !updatedRule.longitude) {
      updatedRule.latitude = locationSettings.latitude;
      updatedRule.longitude = locationSettings.longitude;
    }
    
    // Auto-populate lat/lon for endType sunrise/sunset if not set
    const isEndSunriseSunset = (patch.endType === 'sunrise' || patch.endType === 'sunset') ||
                                (currentRule.endType === 'sunrise' || currentRule.endType === 'sunset');
    if (isEndSunriseSunset && 
        locationSettings?.latitude && locationSettings?.longitude &&
        !updatedRule.latitude && !updatedRule.longitude) {
      updatedRule.latitude = locationSettings.latitude;
      updatedRule.longitude = locationSettings.longitude;
    }
    
    rules[idx] = updatedRule;
    update({ rules });
  };
  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 flex-wrap">
          <input 
            value={sched.name} 
            onChange={(e)=>update({ name: e.target.value })} 
            className="input-field flex-1 min-w-[200px]" 
            placeholder="Schedule name" 
          />
          <Toggle 
            checked={sched.enabled} 
            onChange={(checked)=>update({ enabled: checked })} 
            label="Enabled"
          />
        </div>
      </div>
      <div className="space-y-4">
        {sched.rules.map((r, i) => (
          <div key={r.id} className="glass-card p-6 overflow-x-hidden">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <input 
                value={r.name} 
                onChange={(e)=>updateRule(i, { name: e.target.value })} 
                className="input-field flex-1 min-w-[200px]" 
                placeholder="Rule name" 
              />
              <Toggle 
                checked={r.enabled} 
                onChange={(checked)=>updateRule(i, { enabled: checked })} 
                label="Enabled"
                size="sm"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Days</div>
                <div className="flex flex-wrap gap-2">
                  {[0,1,2,3,4,5,6].map(d => (
                    <button 
                      key={d} 
                      onClick={()=>{
                        const days = new Set(r.daysOfWeek || []);
                        if (days.has(d)) days.delete(d); else days.add(d);
                        updateRule(i, { daysOfWeek: Array.from(days).sort() });
                      }} 
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        r.daysOfWeek?.includes(d) 
                          ? 'bg-primary-500/30 border border-primary-500/50 text-primary-300' 
                          : 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Start</div>
                <div className="flex flex-wrap gap-2">
                  <select 
                    value={r.startType} 
                    onChange={(e)=>updateRule(i, { startType: e.target.value as any })} 
                    className="input-field flex-1 min-w-[100px]"
                  >
                    <option value="time">Time</option>
                    <option value="sunrise">Sunrise</option>
                    <option value="sunset">Sunset</option>
                  </select>
                  {r.startType === 'time' ? (
                    <input 
                      type="time" 
                      value={r.startTime || ''} 
                      onChange={(e)=>updateRule(i, { startTime: e.target.value })} 
                      className="input-field flex-1 min-w-[120px]" 
                    />
                  ) : (
                    <div className="space-y-3 w-full">
                      <div className="space-y-2">
                        <label className="text-xs text-white/70 font-medium">Location for sunrise/sunset calculation</label>
                        <div className="flex flex-wrap gap-2">
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs text-white/60 mb-1">Latitude</label>
                            <input 
                              type="number" 
                              step="any"
                              placeholder={locationSettings?.latitude ? String(locationSettings.latitude) : 'e.g. 37.7749'} 
                              value={r.latitude ?? locationSettings?.latitude ?? ''} 
                              onChange={(e)=>updateRule(i, { latitude: e.target.value === '' ? undefined : Number(e.target.value) })} 
                              className="input-field w-full"
                              title={locationSettings?.latitude ? `Default: ${locationSettings.latitude}` : 'Enter latitude (-90 to 90)'}
                            />
                            {locationSettings?.latitude && !r.latitude && (
                              <p className="text-xs text-white/50 mt-0.5">Using default: {locationSettings.latitude.toFixed(4)}</p>
                            )}
                          </div>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs text-white/60 mb-1">Longitude</label>
                            <input 
                              type="number" 
                              step="any"
                              placeholder={locationSettings?.longitude ? String(locationSettings.longitude) : 'e.g. -122.4194'} 
                              value={r.longitude ?? locationSettings?.longitude ?? ''} 
                              onChange={(e)=>updateRule(i, { longitude: e.target.value === '' ? undefined : Number(e.target.value) })} 
                              className="input-field w-full"
                              title={locationSettings?.longitude ? `Default: ${locationSettings.longitude}` : 'Enter longitude (-180 to 180)'}
                            />
                            {locationSettings?.longitude && !r.longitude && (
                              <p className="text-xs text-white/50 mt-0.5">Using default: {locationSettings.longitude.toFixed(4)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs text-white/70 font-medium mb-1">Time offset (minutes)</label>
                        <div className="flex gap-2">
                          {(() => {
                            const presetOffsets = [-120, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 120];
                            const currentOffset = r.startOffsetMinutes ?? 0;
                            const isPresetValue = presetOffsets.includes(currentOffset);
                            const customKey = `start-${i}`;
                            const isCustomMode = customOffsetMode.get(customKey) || !isPresetValue;
                            const selectedValue = isCustomMode ? 'custom' : String(currentOffset);
                            return (
                              <>
                                <select
                                  value={selectedValue}
                                  onChange={(e)=>{
                                    if (e.target.value === 'custom') {
                                      setCustomOffsetMode(prev => new Map(prev).set(customKey, true));
                                    } else {
                                      setCustomOffsetMode(prev => {
                                        const next = new Map(prev);
                                        next.delete(customKey);
                                        return next;
                                      });
                                      updateRule(i, { startOffsetMinutes: Number(e.target.value) });
                                    }
                                  }}
                                  className="input-field flex-1 min-w-[120px]"
                                >
                                  <option value="-120">-2 hours</option>
                                  <option value="-90">-1.5 hours</option>
                                  <option value="-60">-1 hour</option>
                                  <option value="-45">-45 minutes</option>
                                  <option value="-30">-30 minutes</option>
                                  <option value="-15">-15 minutes</option>
                                  <option value="0">No offset</option>
                                  <option value="15">+15 minutes</option>
                                  <option value="30">+30 minutes</option>
                                  <option value="45">+45 minutes</option>
                                  <option value="60">+1 hour</option>
                                  <option value="90">+1.5 hours</option>
                                  <option value="120">+2 hours</option>
                                  <option value="custom">Custom...</option>
                                </select>
                                {isCustomMode && (
                                  <input
                                    type="number"
                                    placeholder="Custom minutes"
                                    value={currentOffset}
                                    onChange={(e)=>updateRule(i, { startOffsetMinutes: Number(e.target.value) })}
                                    className="input-field w-32"
                                    min="-1440"
                                    max="1440"
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">End/Duration</div>
                <div className="flex flex-wrap gap-2">
                  <select 
                    value={r.endType || ''} 
                    onChange={(e)=>updateRule(i, { endType: (e.target.value || undefined) as any })} 
                    className="input-field flex-1 min-w-[100px]"
                  >
                    <option value="">Use duration</option>
                    <option value="time">Time</option>
                    <option value="sunrise">Sunrise</option>
                    <option value="sunset">Sunset</option>
                  </select>
                  {r.endType === 'time' ? (
                    <input 
                      type="time" 
                      value={r.endTime || ''} 
                      onChange={(e)=>updateRule(i, { endTime: e.target.value })} 
                      className="input-field flex-1 min-w-[120px]" 
                    />
                  ) : r.endType === 'sunrise' || r.endType === 'sunset' ? (
                    <div className="w-full space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs text-white/70 font-medium">Location for sunrise/sunset calculation</label>
                        <div className="flex flex-wrap gap-2">
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs text-white/60 mb-1">Latitude</label>
                            <input 
                              type="number" 
                              step="any"
                              placeholder={locationSettings?.latitude ? String(locationSettings.latitude) : 'e.g. 37.7749'} 
                              value={r.latitude ?? locationSettings?.latitude ?? ''} 
                              onChange={(e)=>updateRule(i, { latitude: e.target.value === '' ? undefined : Number(e.target.value) })} 
                              className="input-field w-full"
                              title={locationSettings?.latitude ? `Default: ${locationSettings.latitude}` : 'Enter latitude (-90 to 90)'}
                            />
                            {locationSettings?.latitude && !r.latitude && (
                              <p className="text-xs text-white/50 mt-0.5">Using default: {locationSettings.latitude.toFixed(4)}</p>
                            )}
                          </div>
                          <div className="flex-1 min-w-[140px]">
                            <label className="block text-xs text-white/60 mb-1">Longitude</label>
                            <input 
                              type="number" 
                              step="any"
                              placeholder={locationSettings?.longitude ? String(locationSettings.longitude) : 'e.g. -122.4194'} 
                              value={r.longitude ?? locationSettings?.longitude ?? ''} 
                              onChange={(e)=>updateRule(i, { longitude: e.target.value === '' ? undefined : Number(e.target.value) })} 
                              className="input-field w-full"
                              title={locationSettings?.longitude ? `Default: ${locationSettings.longitude}` : 'Enter longitude (-180 to 180)'}
                            />
                            {locationSettings?.longitude && !r.longitude && (
                              <p className="text-xs text-white/50 mt-0.5">Using default: {locationSettings.longitude.toFixed(4)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs text-white/70 font-medium mb-1">Time offset (minutes)</label>
                        <div className="flex gap-2">
                          {(() => {
                            const presetOffsets = [-120, -90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90, 120];
                            const currentOffset = r.endOffsetMinutes ?? 0;
                            const isPresetValue = presetOffsets.includes(currentOffset);
                            const customKey = `end-${i}`;
                            const isCustomMode = customOffsetMode.get(customKey) || !isPresetValue;
                            const selectedValue = isCustomMode ? 'custom' : String(currentOffset);
                            return (
                              <>
                                <select
                                  value={selectedValue}
                                  onChange={(e)=>{
                                    if (e.target.value === 'custom') {
                                      setCustomOffsetMode(prev => new Map(prev).set(customKey, true));
                                    } else {
                                      setCustomOffsetMode(prev => {
                                        const next = new Map(prev);
                                        next.delete(customKey);
                                        return next;
                                      });
                                      updateRule(i, { endOffsetMinutes: Number(e.target.value) });
                                    }
                                  }}
                                  className="input-field flex-1 min-w-[120px]"
                                >
                                  <option value="-120">-2 hours</option>
                                  <option value="-90">-1.5 hours</option>
                                  <option value="-60">-1 hour</option>
                                  <option value="-45">-45 minutes</option>
                                  <option value="-30">-30 minutes</option>
                                  <option value="-15">-15 minutes</option>
                                  <option value="0">No offset</option>
                                  <option value="15">+15 minutes</option>
                                  <option value="30">+30 minutes</option>
                                  <option value="45">+45 minutes</option>
                                  <option value="60">+1 hour</option>
                                  <option value="90">+1.5 hours</option>
                                  <option value="120">+2 hours</option>
                                  <option value="custom">Custom...</option>
                                </select>
                                {isCustomMode && (
                                  <input
                                    type="number"
                                    placeholder="Custom minutes"
                                    value={currentOffset}
                                    onChange={(e)=>updateRule(i, { endOffsetMinutes: Number(e.target.value) })}
                                    className="input-field w-32"
                                    min="-1440"
                                    max="1440"
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <input 
                      type="number" 
                      placeholder="Duration (sec)" 
                      value={r.durationSeconds ?? 0} 
                      onChange={(e)=>updateRule(i, { durationSeconds: Number(e.target.value) })} 
                      className="input-field flex-1 min-w-[120px]" 
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/10">
              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Holidays</div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <Toggle 
                    checked={!!r.onHolidaysOnly} 
                    onChange={(checked)=>updateRule(i, { onHolidaysOnly: checked })} 
                    label="Only on holidays"
                    size="sm"
                  />
                  <Toggle 
                    checked={!!r.skipOnHolidays} 
                    onChange={(checked)=>updateRule(i, { skipOnHolidays: checked })} 
                    label="Skip on holidays"
                    size="sm"
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Select Specific Holidays</label>
                    <select
                      multiple
                      className="input-field w-full min-h-[80px]"
                      value={r.selectedHolidayIds || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value);
                        updateRule(i, { selectedHolidayIds: selected.length > 0 ? selected : undefined });
                      }}
                      title="Hold Ctrl/Cmd to select multiple holidays"
                    >
                      {holidays.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-white/50 mt-1">
                      {r.selectedHolidayIds?.length || 0} holiday(s) selected
                    </p>
                  </div>
                  {(r.selectedHolidayIds && r.selectedHolidayIds.length > 0) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Days Before</label>
                        <input
                          type="number"
                          value={r.daysBeforeHoliday ?? 0}
                          onChange={(e)=>updateRule(i, { daysBeforeHoliday: Number(e.target.value) || 0 })}
                          className="input-field w-full"
                          min="0"
                          max="30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Days After</label>
                        <input
                          type="number"
                          value={r.daysAfterHoliday ?? 0}
                          onChange={(e)=>updateRule(i, { daysAfterHoliday: Number(e.target.value) || 0 })}
                          className="input-field w-full"
                          min="0"
                          max="30"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Brightness Ramps</div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <Toggle 
                    checked={!!r.rampOnStart} 
                    onChange={(checked)=>updateRule(i, { rampOnStart: checked })} 
                    label="Ramp up on start"
                    size="sm"
                  />
                  <Toggle 
                    checked={!!r.rampOffEnd} 
                    onChange={(checked)=>updateRule(i, { rampOffEnd: checked })} 
                    label="Ramp down on end"
                    size="sm"
                  />
                </div>
                <input 
                  type="number" 
                  className="input-field w-full" 
                  placeholder="Ramp duration (sec)" 
                  value={r.rampDurationSeconds ?? 10} 
                  onChange={(e)=>updateRule(i, { rampDurationSeconds: Number(e.target.value) })} 
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm text-white/70 font-medium">Targets</div>
                <div className="overflow-x-auto">
                  <TargetPicker value={r.targets} onChange={(targets)=>updateRule(i, { targets })} />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-white/70 font-medium">Sequence (presets)</div>
                <button 
                  className="btn-secondary text-sm" 
                  onClick={()=>{
                    const rules = [...sched.rules];
                    rules[i] = { ...rules[i], sequence: [...(rules[i].sequence||[]), { presetId: presets[0]?.id, durationSeconds: 60 }] } as any;
                    update({ rules });
                  }}
                >
                  Add Preset
                </button>
              </div>
              <div className="space-y-2">
                {(r.sequence || []).map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center flex-wrap">
                    <select 
                      className="input-field flex-1 min-w-[200px]" 
                      value={item.presetId || ''} 
                      onChange={(e)=>{
                        const rules = [...sched.rules];
                        const seq = [...(rules[i].sequence||[])];
                        seq[idx] = { ...seq[idx], presetId: e.target.value };
                        rules[i] = { ...rules[i], sequence: seq } as any;
                        update({ rules });
                      }}
                    >
                      <option value="">Select preset…</option>
                      {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                    <input 
                      className="input-field w-24" 
                      type="number" 
                      placeholder="Duration"
                      value={item.durationSeconds ?? 60} 
                      onChange={(e)=>{
                        const rules = [...sched.rules];
                        const seq = [...(rules[i].sequence||[])];
                        seq[idx] = { ...seq[idx], durationSeconds: Number(e.target.value) };
                        rules[i] = { ...rules[i], sequence: seq } as any;
                        update({ rules });
                      }} 
                    />
                    <button 
                      className="btn-secondary text-sm px-3 py-1.5 text-red-400 hover:bg-red-500/20" 
                      onClick={()=>{
                        const rules = [...sched.rules];
                        const seq = [...(rules[i].sequence||[])];
                        seq.splice(idx, 1);
                        rules[i] = { ...rules[i], sequence: seq } as any;
                        update({ rules });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Toggle 
                  checked={!!r.sequenceLoop} 
                  onChange={(checked)=>updateRule(i, { sequenceLoop: checked })} 
                  label="Loop"
                  size="sm"
                />
                <Toggle 
                  checked={!!r.sequenceShuffle} 
                  onChange={(checked)=>updateRule(i, { sequenceShuffle: checked })} 
                  label="Shuffle"
                  size="sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-end pt-4">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={()=>onSave(sched)}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function TargetPicker({ value, onChange }: { value: StreamTarget[]; onChange: (v: StreamTarget[])=>void }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [virtuals, setVirtuals] = useState<any[]>([]);
  useEffect(()=>{ (async()=>{
    const [d,g,v] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/groups'),
      fetch('/api/virtuals')
    ]);
    if (d.ok) setDevices(await d.json());
    if (g.ok) setGroups(await g.json());
    if (v.ok) setVirtuals(await v.json());
  })(); },[]);

  const add = (t: StreamTarget) => onChange([...(value||[]), t]);
  const remove = (idx: number) => onChange(value.filter((_,i)=>i!==idx));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <select className="input-field flex-1 min-w-[120px]" onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'device', id}); e.target.value=''; }}>
          <option value="">Add device…</option>
          {devices.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <select className="input-field flex-1 min-w-[120px]" onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'group', id}); e.target.value=''; }}>
          <option value="">Add group…</option>
          {groups.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <select className="input-field flex-1 min-w-[120px]" onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'virtual', id}); e.target.value=''; }}>
          <option value="">Add virtual…</option>
          {virtuals.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </div>
      <div className="space-y-1">
        {value?.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between bg-white/10 border border-white/20 rounded-lg px-3 py-2">
            <div className="text-sm text-white/90">
              <span className="uppercase text-white/60 mr-2 text-xs font-medium">{t.type}</span>
              <span>{t.id}</span>
            </div>
            <button className="btn-secondary text-sm px-3 py-1 text-red-400 hover:bg-red-500/20" onClick={()=>remove(idx)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}



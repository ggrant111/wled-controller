"use client";
import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Schedule, ScheduleRule, StreamTarget, EffectPreset } from '../../types';
import { useToast } from '../../components/ToastProvider';

export default function SchedulePage() {
  const { showToast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [virtuals, setVirtuals] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, pRes, dRes, gRes, vRes] = await Promise.all([
          fetch('/api/schedules'),
          fetch('/api/presets'),
          fetch('/api/devices'),
          fetch('/api/groups'),
          fetch('/api/virtuals')
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
    if (!confirm('Delete schedule?')) return;
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
        
        alert(`Failed to delete schedule: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert(`Error deleting schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
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
        <div key={s.id} className="rounded border border-gray-700 p-4 bg-gray-800/50">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-medium text-lg">{s.name}</div>
              <div className="text-sm text-gray-400 mt-1">
                {s.enabled ? (
                  <span className="text-green-400">● Enabled</span>
                ) : (
                  <span className="text-gray-500">○ Disabled</span>
                )}
                {' · '}
                {s.rules.length} rule{s.rules.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>onEdit(s)} className="btn-secondary">Edit</button>
              <button onClick={()=>onDelete(s.id)} className="btn-danger">Delete</button>
            </div>
          </div>
          
          <div className="space-y-3 mt-4">
            {s.rules.map((rule, idx) => (
              <div key={rule.id || idx} className="bg-gray-900/50 rounded p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-base">{rule.name}</div>
                  <div className="text-xs text-gray-400">
                    {rule.enabled ? (
                      <span className="text-green-400">Enabled</span>
                    ) : (
                      <span className="text-gray-500">Disabled</span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {/* Days */}
                  <div>
                    <span className="text-gray-400">Days: </span>
                    <span className="text-white">
                      {rule.daysOfWeek && rule.daysOfWeek.length > 0 ? (
                        rule.daysOfWeek.map(d => daysOfWeek[d]).join(', ')
                      ) : (
                        'Every day'
                      )}
                    </span>
                  </div>
                  
                  {/* Time */}
                  <div>
                    <span className="text-gray-400">Start Time: </span>
                    <span className="text-white">{formatTime(rule)}</span>
                  </div>
                  
                  {/* Duration/End */}
                  <div>
                    <span className="text-gray-400">
                      {rule.endType ? 'End Time' : 'Duration'}: 
                    </span>
                    <span className="text-white ml-1">
                      {rule.endType === 'time' && rule.endTime ? rule.endTime :
                       rule.endType === 'sunrise' ? `Sunrise${rule.endOffsetMinutes ? ` ${rule.endOffsetMinutes > 0 ? '+' : ''}${rule.endOffsetMinutes}m` : ''}` :
                       rule.endType === 'sunset' ? `Sunset${rule.endOffsetMinutes ? ` ${rule.endOffsetMinutes > 0 ? '+' : ''}${rule.endOffsetMinutes}m` : ''}` :
                       rule.durationSeconds ? formatDuration(rule.durationSeconds) : 'Indefinite'}
                    </span>
                  </div>
                  
                  {/* FPS */}
                  {rule.fps && (
                    <div>
                      <span className="text-gray-400">FPS: </span>
                      <span className="text-white">{rule.fps}</span>
                    </div>
                  )}
                  
                  {/* Targets */}
                  <div className="md:col-span-2">
                    <span className="text-gray-400">Targets: </span>
                    <span className="text-white">
                      {rule.targets.length > 0 ? (
                        getTargetNames(rule.targets).join(', ')
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </span>
                  </div>
                  
                  {/* Sequence */}
                  <div className="md:col-span-2">
                    <span className="text-gray-400">Effects/Presets: </span>
                    <div className="mt-1 space-y-1">
                      {rule.sequence.length > 0 ? (
                        rule.sequence.map((item, seqIdx) => {
                          const effectName = item.presetId 
                            ? (presets.find(p => p.id === item.presetId)?.name || `Preset: ${item.presetId}`)
                            : item.effect?.name || item.layers ? `${item.layers?.length || 0} layer(s)` : 'Unknown';
                          return (
                            <div key={seqIdx} className="text-white flex items-center gap-2">
                              <span className="text-gray-500">•</span>
                              <span>{effectName}</span>
                              {item.durationSeconds && (
                                <span className="text-gray-400 text-xs">
                                  ({formatDuration(item.durationSeconds)})
                                </span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                      {(rule.sequenceLoop || rule.sequenceShuffle) && (
                        <div className="text-xs text-gray-400 mt-1">
                          {rule.sequenceLoop && <span>Loop</span>}
                          {rule.sequenceLoop && rule.sequenceShuffle && <span> · </span>}
                          {rule.sequenceShuffle && <span>Shuffle</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Ramp Settings */}
                  {(rule.rampOnStart || rule.rampOffEnd) && (
                    <div className="md:col-span-2 text-xs text-gray-400">
                      {rule.rampOnStart && <span>Ramp up on start</span>}
                      {rule.rampOnStart && rule.rampOffEnd && <span> · </span>}
                      {rule.rampOffEnd && <span>Ramp down on end</span>}
                      {rule.rampDurationSeconds && (
                        <span> ({rule.rampDurationSeconds}s)</span>
                      )}
                    </div>
                  )}
                  
                  {/* Holiday Settings */}
                  {(rule.onHolidaysOnly || rule.skipOnHolidays) && (
                    <div className="md:col-span-2 text-xs text-gray-400">
                      {rule.onHolidaysOnly && <span>Only on holidays</span>}
                      {rule.onHolidaysOnly && rule.skipOnHolidays && <span> · </span>}
                      {rule.skipOnHolidays && <span>Skip on holidays</span>}
                      {(rule.holidayCountry || rule.holidayState) && (
                        <span> ({rule.holidayCountry || ''}{rule.holidayCountry && rule.holidayState ? ', ' : ''}{rule.holidayState || ''})</span>
                      )}
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

function ScheduleEditor({ value, onCancel, onSave, presets, saving }: { value: Schedule; onCancel: ()=>void; onSave: (s: Schedule)=>void; presets: EffectPreset[]; saving: boolean; }) {
  const [sched, setSched] = useState<Schedule>(value);
  const update = (patch: Partial<Schedule>) => setSched(prev => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
  const updateRule = (idx: number, patch: Partial<ScheduleRule>) => {
    const rules = [...sched.rules];
    rules[idx] = { ...rules[idx], ...patch } as ScheduleRule;
    update({ rules });
  };
  const inputClass = "bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input value={sched.name} onChange={(e)=>update({ name: e.target.value })} className={inputClass} placeholder="Schedule name" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sched.enabled} onChange={(e)=>update({ enabled: e.target.checked })} /><span>Enabled</span></label>
      </div>
      <div className="space-y-3">
        {sched.rules.map((r, i) => (
          <div key={r.id} className="rounded border border-gray-700 p-4 bg-gray-900">
            <div className="flex items-center gap-2 mb-3">
              <input value={r.name} onChange={(e)=>updateRule(i, { name: e.target.value })} className={inputClass} placeholder="Rule name" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e)=>updateRule(i, { enabled: e.target.checked })} /><span>Enabled</span></label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Days</div>
                <div className="flex flex-wrap gap-2">
                  {[0,1,2,3,4,5,6].map(d => (
                    <button key={d} onClick={()=>{
                      const days = new Set(r.daysOfWeek || []);
                      if (days.has(d)) days.delete(d); else days.add(d);
                      updateRule(i, { daysOfWeek: Array.from(days).sort() });
                    }} className={`px-2 py-1 rounded border ${r.daysOfWeek?.includes(d) ? 'bg-blue-600 border-blue-500' : 'border-gray-700'}`}>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Start</div>
                <div className="flex gap-2">
                  <select value={r.startType} onChange={(e)=>updateRule(i, { startType: e.target.value as any })} className={inputClass}>
                    <option value="time">Time</option>
                    <option value="sunrise">Sunrise</option>
                    <option value="sunset">Sunset</option>
                  </select>
                  {r.startType === 'time' ? (
                    <input type="time" value={r.startTime || ''} onChange={(e)=>updateRule(i, { startTime: e.target.value })} className={inputClass} />
                  ) : (
                    <>
                      <input type="number" placeholder="Lat" value={r.latitude ?? ''} onChange={(e)=>updateRule(i, { latitude: e.target.value === '' ? undefined : Number(e.target.value) })} className={inputClass} />
                      <input type="number" placeholder="Lon" value={r.longitude ?? ''} onChange={(e)=>updateRule(i, { longitude: e.target.value === '' ? undefined : Number(e.target.value) })} className={inputClass} />
                      <input type="number" placeholder="Offset (min)" value={r.startOffsetMinutes ?? 0} onChange={(e)=>updateRule(i, { startOffsetMinutes: Number(e.target.value) })} className={inputClass} />
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-gray-400">End/Duration</div>
                <div className="flex gap-2">
                  <select value={r.endType || ''} onChange={(e)=>updateRule(i, { endType: (e.target.value || undefined) as any })} className={inputClass}>
                    <option value="">Use duration</option>
                    <option value="time">Time</option>
                    <option value="sunrise">Sunrise</option>
                    <option value="sunset">Sunset</option>
                  </select>
                  {r.endType === 'time' ? (
                    <input type="time" value={r.endTime || ''} onChange={(e)=>updateRule(i, { endTime: e.target.value })} className={inputClass} />
                  ) : r.endType === 'sunrise' || r.endType === 'sunset' ? (
                    <input type="number" placeholder="Offset (min)" value={r.endOffsetMinutes ?? 0} onChange={(e)=>updateRule(i, { endOffsetMinutes: Number(e.target.value) })} className={inputClass} />
                  ) : (
                    <input type="number" placeholder="Duration (sec)" value={r.durationSeconds ?? 0} onChange={(e)=>updateRule(i, { durationSeconds: Number(e.target.value) })} className={inputClass} />
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div className="space-y-2">
                <div className="text-sm text-gray-400">Holidays</div>
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.onHolidaysOnly} onChange={(e)=>updateRule(i, { onHolidaysOnly: e.target.checked })} />Only on holidays</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.skipOnHolidays} onChange={(e)=>updateRule(i, { skipOnHolidays: e.target.checked })} />Skip on holidays</label>
                </div>
                <div className="flex gap-2">
                  <input className="input" placeholder="Country (e.g. US)" value={r.holidayCountry || ''} onChange={(e)=>updateRule(i, { holidayCountry: e.target.value || undefined })} />
                  <input className="input" placeholder="State (optional)" value={r.holidayState || ''} onChange={(e)=>updateRule(i, { holidayState: e.target.value || undefined })} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-gray-400">Brightness Ramps</div>
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.rampOnStart} onChange={(e)=>updateRule(i, { rampOnStart: e.target.checked })} />Ramp up on start</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.rampOffEnd} onChange={(e)=>updateRule(i, { rampOffEnd: e.target.checked })} />Ramp down on end</label>
                </div>
                <input type="number" className={inputClass} placeholder="Ramp duration (sec)" value={r.rampDurationSeconds ?? 10} onChange={(e)=>updateRule(i, { rampDurationSeconds: Number(e.target.value) })} />
              </div>

              <div className="space-y-2">
                <div className="text-sm text-gray-400">Targets</div>
                <TargetPicker value={r.targets} onChange={(targets)=>updateRule(i, { targets })} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">Sequence (presets)</div>
                <button className="btn-secondary" onClick={()=>{
                  const rules = [...sched.rules];
                  rules[i] = { ...rules[i], sequence: [...(rules[i].sequence||[]), { presetId: presets[0]?.id, durationSeconds: 60 }] } as any;
                  update({ rules });
                }}>Add Preset</button>
              </div>
              <div className="space-y-2">
                {(r.sequence || []).map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select className={inputClass} value={item.presetId || ''} onChange={(e)=>{
                      const rules = [...sched.rules];
                      const seq = [...(rules[i].sequence||[])];
                      seq[idx] = { ...seq[idx], presetId: e.target.value };
                      rules[i] = { ...rules[i], sequence: seq } as any;
                      update({ rules });
                    }}>
                      <option value="">Select preset…</option>
                      {presets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                    <input className={inputClass} type="number" value={item.durationSeconds ?? 60} onChange={(e)=>{
                      const rules = [...sched.rules];
                      const seq = [...(rules[i].sequence||[])];
                      seq[idx] = { ...seq[idx], durationSeconds: Number(e.target.value) };
                      rules[i] = { ...rules[i], sequence: seq } as any;
                      update({ rules });
                    }} />
                    <button className="btn-danger" onClick={()=>{
                      const rules = [...sched.rules];
                      const seq = [...(rules[i].sequence||[])];
                      seq.splice(idx, 1);
                      rules[i] = { ...rules[i], sequence: seq } as any;
                      update({ rules });
                    }}>Remove</button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.sequenceLoop} onChange={(e)=>updateRule(i, { sequenceLoop: e.target.checked })} />Loop</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!r.sequenceShuffle} onChange={(e)=>updateRule(i, { sequenceShuffle: e.target.checked })} />Shuffle</label>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={saving} onClick={()=>onSave(sched)}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function TargetPicker({ value, onChange }: { value: StreamTarget[]; onChange: (v: StreamTarget[])=>void }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [virtuals, setVirtuals] = useState<any[]>([]);
  const inputClass = "bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none";
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
      <div className="flex gap-2">
        <select className={inputClass} onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'device', id}); e.target.value=''; }}>
          <option value="">Add device…</option>
          {devices.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <select className={inputClass} onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'group', id}); e.target.value=''; }}>
          <option value="">Add group…</option>
          {groups.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
        <select className={inputClass} onChange={(e)=>{ const id=e.target.value; if (id) add({ type:'virtual', id}); e.target.value=''; }}>
          <option value="">Add virtual…</option>
          {virtuals.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
        </select>
      </div>
      <div className="space-y-1">
        {value?.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between border border-gray-700 rounded px-2 py-1">
            <div className="text-sm">
              <span className="uppercase text-gray-400 mr-2">{t.type}</span>
              <span>{t.id}</span>
            </div>
            <button className="btn-danger" onClick={()=>remove(idx)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}



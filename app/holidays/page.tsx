"use client";

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, Plus, Save, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Holiday } from '../../types';
import { useToast } from '../../components/ToastProvider';
import { useModal } from '../../components/ModalProvider';

export default function HolidaysPage() {
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    isRecurring: true,
    description: '',
  });
  const [dateType, setDateType] = useState<'fixed' | 'variable'>('fixed');
  const [variableDate, setVariableDate] = useState({
    week: '1ST',
    dayOfWeek: 'MONDAY',
    month: 'JANUARY',
  });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHolidays();
  }, []);

  // Scroll to top when editing a holiday
  useEffect(() => {
    if (editingId && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Also scroll window to top as fallback
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [editingId]);

  const loadHolidays = async () => {
    try {
      const response = await fetch('/api/holidays');
      if (response.ok) {
        const data = await response.json();
        setHolidays(data);
      }
    } catch (error) {
      console.error('Error loading holidays:', error);
      showToast('Failed to load holidays', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Parse date pattern into variable date components
  const parseVariableDate = (date: string): { week: string; dayOfWeek: string; month: string } | null => {
    if (date.includes('_') && !date.includes('-')) {
      const parts = date.split('_');
      if (parts.length === 3) {
        return {
          week: parts[0],
          dayOfWeek: parts[1],
          month: parts[2],
        };
      }
    }
    return null;
  };

  // Check if a date string is a variable pattern
  const isVariableDate = (date: string): boolean => {
    return date.includes('_') && !date.includes('-');
  };

  const handleCreate = () => {
    setEditingId(null);
    setEditing(null);
    setFormData({
      name: '',
      date: '',
      isRecurring: true,
      description: '',
    });
    setDateType('fixed');
    setVariableDate({
      week: '1ST',
      dayOfWeek: 'MONDAY',
      month: 'JANUARY',
    });
  };

  const handleEdit = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setEditing(holiday);
    const parsed = parseVariableDate(holiday.date);
    if (parsed) {
      setDateType('variable');
      setVariableDate(parsed);
      setFormData({
        name: holiday.name,
        date: '',
        isRecurring: holiday.isRecurring,
        description: holiday.description || '',
      });
    } else {
      setDateType('fixed');
      setFormData({
        name: holiday.name,
        date: holiday.date,
        isRecurring: holiday.isRecurring,
        description: holiday.description || '',
      });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditing(null);
    setFormData({
      name: '',
      date: '',
      isRecurring: true,
      description: '',
    });
    setDateType('fixed');
    setVariableDate({
      week: '1ST',
      dayOfWeek: 'MONDAY',
      month: 'JANUARY',
    });
  };

  const handleSave = async () => {
    if (!formData.name) {
      showToast('Name is required', 'error');
      return;
    }

    // Build the date string based on date type
    let dateValue: string;
    if (dateType === 'variable') {
      dateValue = `${variableDate.week}_${variableDate.dayOfWeek}_${variableDate.month}`;
    } else {
      if (!formData.date) {
        showToast('Date is required', 'error');
        return;
      }
      // Validate date format
      const dateRegex = formData.isRecurring ? /^\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formData.date)) {
        showToast(
          formData.isRecurring
            ? 'Date must be in MM-DD format for recurring holidays'
            : 'Date must be in YYYY-MM-DD format for one-time holidays',
          'error'
        );
        return;
      }
      dateValue = formData.date;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update existing
        const response = await fetch(`/api/holidays/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            date: dateValue,
          }),
        });

        if (response.ok) {
          const updated = await response.json();
          setHolidays(holidays.map(h => h.id === editingId ? updated : h));
          showToast('Holiday updated successfully', 'success');
          handleCancel();
        } else {
          const error = await response.json();
          showToast(error.error || 'Failed to update holiday', 'error');
        }
      } else {
        // Create new
        const response = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            date: dateValue,
          }),
        });

        if (response.ok) {
          const created = await response.json();
          setHolidays([...holidays, created]);
          showToast('Holiday created successfully', 'success');
          handleCancel();
        } else {
          const error = await response.json();
          showToast(error.error || 'Failed to create holiday', 'error');
        }
      }
    } catch (error) {
      console.error('Error saving holiday:', error);
      showToast('Failed to save holiday', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    const holiday = holidays.find(h => h.id === id);
    showConfirm({
      message: `Delete "${holiday?.name}"?`,
      title: 'Delete Holiday',
      variant: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/holidays/${id}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            setHolidays(holidays.filter(h => h.id !== id));
            if (editingId === id) {
              handleCancel();
            }
            showToast('Holiday deleted successfully', 'success');
          } else {
            const error = await response.json();
            showToast(error.error || 'Failed to delete holiday', 'error');
          }
        } catch (error) {
          console.error('Error deleting holiday:', error);
          showToast('Failed to delete holiday', 'error');
        }
      },
    });
  };

  const formatDate = (date: string, isRecurring: boolean): string => {
    // Check if it's a variable date pattern
    if (date.includes('_') && !date.includes('-')) {
      // Format: "4TH_THURSDAY_NOVEMBER" -> "4th Thursday in November"
      const parts = date.split('_');
      if (parts.length === 3) {
        const [nth, dayName, monthName] = parts;
        const nthFormatted = nth.toLowerCase();
        const dayFormatted = dayName.charAt(0) + dayName.slice(1).toLowerCase();
        const monthFormatted = monthName.charAt(0) + monthName.slice(1).toLowerCase();
        return `${nthFormatted} ${dayFormatted} in ${monthFormatted}`;
      }
      return date;
    }
    
    if (isRecurring) {
      const [month, day] = date.split('-');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}`;
    }
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) return <div className="p-6">Loading…</div>;

  const isEditing = editingId !== null;

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-semibold">Holidays</h2>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Holiday
        </button>
      </div>

      {/* Create/Edit Form */}
      {isEditing || !editingId ? (
        <div ref={formRef} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {editingId ? 'Edit Holiday' : 'Create New Holiday'}
            </h3>
            {editingId && (
              <button
                onClick={handleCancel}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 font-medium mb-1">
                Holiday Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-field w-full"
                placeholder="e.g., Christmas, New Year's Day"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-white/70 font-medium mb-1">
                  Type
                </label>
                <select
                  value={formData.isRecurring ? 'recurring' : 'onetime'}
                  onChange={(e) =>
                    setFormData({ ...formData, isRecurring: e.target.value === 'recurring' })
                  }
                  className="input-field w-full"
                >
                  <option value="recurring">Recurring (yearly)</option>
                  <option value="onetime">One-time event</option>
                </select>
              </div>

              {formData.isRecurring && (
                <div>
                  <label className="block text-sm text-white/70 font-medium mb-1">
                    Date Type
                  </label>
                  <select
                    value={dateType}
                    onChange={(e) => setDateType(e.target.value as 'fixed' | 'variable')}
                    className="input-field w-full"
                  >
                    <option value="fixed">Fixed Date (same day each year)</option>
                    <option value="variable">Variable Date (e.g., 3rd Monday)</option>
                  </select>
                </div>
              )}
            </div>

            {formData.isRecurring && dateType === 'variable' ? (
              <div className="space-y-4">
                <div className="text-sm text-white/70 font-medium">Variable Date Selection</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-white/70 font-medium mb-1">
                      Week *
                    </label>
                    <select
                      value={variableDate.week}
                      onChange={(e) => setVariableDate({ ...variableDate, week: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="1ST">1st</option>
                      <option value="2ND">2nd</option>
                      <option value="3RD">3rd</option>
                      <option value="4TH">4th</option>
                      <option value="5TH">5th</option>
                      <option value="LAST">Last</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/70 font-medium mb-1">
                      Day of Week *
                    </label>
                    <select
                      value={variableDate.dayOfWeek}
                      onChange={(e) => setVariableDate({ ...variableDate, dayOfWeek: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="SUNDAY">Sunday</option>
                      <option value="MONDAY">Monday</option>
                      <option value="TUESDAY">Tuesday</option>
                      <option value="WEDNESDAY">Wednesday</option>
                      <option value="THURSDAY">Thursday</option>
                      <option value="FRIDAY">Friday</option>
                      <option value="SATURDAY">Saturday</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-white/70 font-medium mb-1">
                      Month *
                    </label>
                    <select
                      value={variableDate.month}
                      onChange={(e) => setVariableDate({ ...variableDate, month: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="JANUARY">January</option>
                      <option value="FEBRUARY">February</option>
                      <option value="MARCH">March</option>
                      <option value="APRIL">April</option>
                      <option value="MAY">May</option>
                      <option value="JUNE">June</option>
                      <option value="JULY">July</option>
                      <option value="AUGUST">August</option>
                      <option value="SEPTEMBER">September</option>
                      <option value="OCTOBER">October</option>
                      <option value="NOVEMBER">November</option>
                      <option value="DECEMBER">December</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-white/50">
                  Example: {variableDate.week.toLowerCase()} {variableDate.dayOfWeek.toLowerCase()} in {variableDate.month.toLowerCase()}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-white/70 font-medium mb-1">
                  Date *
                </label>
                <input
                  type="text"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="input-field w-full"
                  placeholder={formData.isRecurring ? "MM-DD (e.g., 12-25)" : "YYYY-MM-DD (e.g., 2024-12-25)"}
                />
                <p className="text-xs text-white/50 mt-1">
                  {formData.isRecurring
                    ? 'Format: MM-DD (e.g., 12-25 for December 25)'
                    : 'Format: YYYY-MM-DD for specific date'}
                </p>
              </div>
            )}


            <div>
              <label className="block text-sm text-white/70 font-medium mb-1">
                Description (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input-field w-full"
                rows={3}
                placeholder="Add a description for this holiday"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button className="btn-secondary" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Holidays List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {holidays.length === 0 ? (
          <div className="col-span-full text-gray-400 text-center py-8">
            No holidays yet. Create your first holiday above.
          </div>
        ) : (
          holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="glass-card glass-card-hover p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold truncate">{holiday.name}</h3>
                    {!holiday.isCustom && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400 flex-shrink-0">
                        Built-in
                      </span>
                    )}
                    {holiday.isCustom && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 flex-shrink-0">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white/70 space-y-1">
                    <div>
                      <span className="font-medium">Date:</span>{' '}
                      {formatDate(holiday.date, holiday.isRecurring)}
                      {holiday.isRecurring && ' (yearly)'}
                    </div>
                    {holiday.description && (
                      <div>
                        <span className="font-medium">Description:</span> {holiday.description}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button
                    onClick={() => handleEdit(holiday)}
                    className="p-1.5 hover:bg-white/20 rounded transition-colors"
                    title="Edit holiday"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {holiday.isCustom && (
                    <button
                      onClick={() => handleDelete(holiday.id)}
                      className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


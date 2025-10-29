'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Palette, Plus, Trash2, Copy, Edit3, Save, X, Shuffle } from 'lucide-react';
import { Palette as PaletteType } from '../types';
import { paletteManager } from '../lib/palettes';

interface PaletteSelectorProps {
  value: string;
  onChange: (paletteId: string) => void;
  className?: string;
}

interface PaletteEditorProps {
  palette: PaletteType | null;
  onSave: (palette: PaletteType) => void;
  onCancel: () => void;
}

export default function PaletteSelector({ value, onChange, className = '' }: PaletteSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPalette, setEditingPalette] = useState<PaletteType | null>(null);
  const [allPalettes, setAllPalettes] = useState<PaletteType[]>([]);
  const [selectedPalette, setSelectedPalette] = useState<PaletteType | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPalettes = async () => {
      await paletteManager.loadCustomPalettes();
      setAllPalettes(paletteManager.getAllPalettes());
      setSelectedPalette(paletteManager.getPaletteById(value));
    };
    loadPalettes();
  }, [value]);

  const handlePaletteSelect = (paletteId: string) => {
    onChange(paletteId);
    setIsOpen(false);
  };

  const handleCreateNew = () => {
    const newPalette: PaletteType = {
      id: '',
      name: 'New Palette',
      colors: ['#ff0000', '#00ff00', '#0000ff'],
      isCustom: true,
      description: 'Custom palette'
    };
    setEditingPalette(newPalette);
    setIsEditing(true);
  };

  const handleEditPalette = (palette: PaletteType) => {
    setEditingPalette({ ...palette });
    setIsEditing(true);
  };

  const handleDuplicatePalette = async (palette: PaletteType) => {
    const duplicated = await paletteManager.duplicatePalette(palette.id);
    if (duplicated) {
      await paletteManager.loadCustomPalettes();
      setAllPalettes(paletteManager.getAllPalettes());
      setEditingPalette(duplicated);
      setIsEditing(true);
    }
  };

  const handleDeletePalette = async (paletteId: string) => {
    if (paletteId.startsWith('custom-') && confirm('Are you sure you want to delete this custom palette?')) {
      const success = await paletteManager.deleteCustomPalette(paletteId);
      if (success) {
        await paletteManager.loadCustomPalettes();
        setAllPalettes(paletteManager.getAllPalettes());
        if (value === paletteId) {
          onChange('rainbow'); // Fallback to default
        }
      }
    }
  };

  const handleGenerateRandom = async () => {
    const randomPalette = await paletteManager.generateRandomPalette();
    if (randomPalette) {
      await paletteManager.loadCustomPalettes();
      setAllPalettes(paletteManager.getAllPalettes());
      setEditingPalette(randomPalette);
      setIsEditing(true);
    }
  };

  const handleSavePalette = async (palette: PaletteType) => {
    let success = false;
    
    if (palette.id) {
      // Update existing
      success = await paletteManager.updateCustomPalette(palette.id, palette);
    } else {
      // Create new
      const newPalette = await paletteManager.createCustomPalette(palette.name, palette.colors, palette.description);
      success = newPalette !== null;
    }
    
    if (success) {
      await paletteManager.loadCustomPalettes();
      setAllPalettes(paletteManager.getAllPalettes());
      setIsEditing(false);
      setEditingPalette(null);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingPalette(null);
  };

  return (
    <div className={`relative z-[100] ${className}`}>
      {/* Palette Selector Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-all flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Palette className="h-4 w-4 text-primary-500" />
          <span className="text-sm font-medium">
            {selectedPalette?.name || 'Select Palette'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Color preview */}
          <div className="flex gap-1">
            {selectedPalette?.colors.slice(0, 4).map((color, index) => (
              <div
                key={index}
                className="w-3 h-3 rounded-full border border-white/20"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="text-white/50">▼</div>
        </div>
      </button>

      {/* Palette Selection Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99998]"
              onClick={() => setIsOpen(false)}
            />
            {/* Modal */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg shadow-xl z-[99999] max-h-[80vh] overflow-y-auto"
              style={{ 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '500px',
                maxWidth: '90vw'
              }}
            >
              {/* Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Select Palette</h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Action Buttons */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    New Palette
                  </button>
                  <button
                    onClick={handleGenerateRandom}
                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
                  >
                    <Shuffle className="h-4 w-4" />
                    Random
                  </button>
                </div>

                {/* Preset Palettes */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-white/70 mb-3">PRESET PALETTES</h4>
                  <div className="space-y-2">
                    {allPalettes.filter(p => !p.isCustom).map((palette) => (
                      <button
                        key={palette.id}
                        onClick={() => handlePaletteSelect(palette.id)}
                        className={`w-full p-3 rounded-lg transition-all flex items-center justify-between mb-1 border ${
                          value === palette.id
                            ? 'bg-primary-500/20 border-primary-500/50'
                            : 'bg-white/5 hover:bg-white/10 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {palette.colors.slice(0, 4).map((color, index) => (
                              <div
                                key={index}
                                className="w-3 h-3 rounded-full border border-white/20"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                            {palette.colors.length > 4 && (
                              <span className="text-xs text-white/50">+{palette.colors.length - 4}</span>
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium">{palette.name}</div>
                            {palette.description && (
                              <div className="text-xs text-white/50">{palette.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicatePalette(palette);
                            }}
                            className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Palettes */}
                {allPalettes.filter(p => p.isCustom).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-white/70 mb-3">CUSTOM PALETTES</h4>
                    <div className="space-y-2">
                      {allPalettes.filter(p => p.isCustom).map((palette) => (
                        <button
                          key={palette.id}
                          onClick={() => handlePaletteSelect(palette.id)}
                          className={`w-full p-3 rounded-lg transition-all flex items-center justify-between mb-1 border ${
                            value === palette.id
                              ? 'bg-primary-500/20 border-primary-500/50'
                              : 'bg-white/5 hover:bg-white/10 border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                              {palette.colors.slice(0, 4).map((color, index) => (
                                <div
                                  key={index}
                                  className="w-3 h-3 rounded-full border border-white/20"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                              {palette.colors.length > 4 && (
                                <span className="text-xs text-white/50">+{palette.colors.length - 4}</span>
                              )}
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-medium">{palette.name}</div>
                              {palette.description && (
                                <div className="text-xs text-white/50">{palette.description}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditPalette(palette);
                              }}
                              className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="h-3 w-3" />
                            </div>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicatePalette(palette);
                              }}
                              className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
                              title="Duplicate"
                            >
                              <Copy className="h-3 w-3" />
                            </div>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePalette(palette.id);
                              }}
                              className="p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Palette Editor Modal */}
      <AnimatePresence>
        {isEditing && editingPalette && (
          <PaletteEditor
            palette={editingPalette}
            onSave={handleSavePalette}
            onCancel={handleCancelEdit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PaletteEditor({ palette, onSave, onCancel }: PaletteEditorProps) {
  const [name, setName] = useState(palette?.name || '');
  const [description, setDescription] = useState(palette?.description || '');
  const [colors, setColors] = useState<string[]>(palette?.colors || ['#ff0000']);

  const addColor = () => {
    setColors([...colors, '#ff0000']);
  };

  const updateColor = (index: number, color: string) => {
    const newColors = [...colors];
    newColors[index] = color;
    setColors(newColors);
  };

  const removeColor = (index: number) => {
    if (colors.length > 1) {
      const newColors = colors.filter((_, i) => i !== index);
      setColors(newColors);
    }
  };

  const handleSave = () => {
    const updatedPalette: PaletteType = {
      ...palette!,
      name,
      description,
      colors: [...colors]
    };
    onSave(updatedPalette);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 border border-white/20 rounded-lg p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Palette</h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 rounded border border-white/20 bg-white/5 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 rounded border border-white/20 bg-white/5 text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Colors</label>
              <button
                onClick={addColor}
                className="btn-secondary text-xs px-3 py-1"
              >
                Add Color
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {colors.map((color, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => updateColor(index, e.target.value)}
                    className="w-12 h-8 rounded border border-white/20 bg-transparent"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => updateColor(index, e.target.value)}
                    className="flex-1 p-2 rounded border border-white/20 bg-white/5 text-white font-mono text-sm"
                  />
                  <button
                    onClick={() => removeColor(index)}
                    className="p-2 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                    disabled={colors.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Palette
            </button>
            <button
              onClick={onCancel}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

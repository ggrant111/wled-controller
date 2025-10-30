import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { EffectPreset } from '../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read presets from file
async function readPresets(): Promise<EffectPreset[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(PRESETS_FILE, 'utf8');
    const presets = JSON.parse(data);
    // Return as-is - API handles Record format for JSON serialization
    return presets;
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Write presets to file
async function writePresets(presets: EffectPreset[]): Promise<void> {
  await ensureDataDir();
  // Presets are already in Record format (plain objects), no conversion needed
  await fs.writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

// Generate unique ID for presets
function generateId(): string {
  return `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET /api/presets - Get all presets
export async function GET() {
  try {
    const presets = await readPresets();
    return NextResponse.json(presets);
  } catch (error) {
    console.error('Error reading presets:', error);
    return NextResponse.json({ error: 'Failed to read presets' }, { status: 500 });
  }
}

// POST /api/presets - Create a new preset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, useLayers, effect, parameters, layers, layerParameters } = body;

    if (!name) {
      return NextResponse.json({ error: 'Preset name is required' }, { status: 400 });
    }

    if (!useLayers && !effect) {
      return NextResponse.json({ error: 'Either effect or layers must be provided' }, { status: 400 });
    }

    if (useLayers && (!layers || layers.length === 0)) {
      return NextResponse.json({ error: 'Layers must be provided when useLayers is true' }, { status: 400 });
    }

    const presets = await readPresets();
    
    // Check if preset name already exists
    if (presets.some(p => p.name === name)) {
      return NextResponse.json({ error: 'Preset name already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const newPreset: EffectPreset = {
      id: generateId(),
      name,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      useLayers: useLayers || false,
      effect: effect ? { ...effect } : undefined,
      parameters: parameters ? { ...parameters } : undefined, // Already a Record
      layers: layers ? layers.map((l: any) => ({ ...l })) : undefined,
      layerParameters: layerParameters ? { ...layerParameters } : undefined // Already a Record
    };

    presets.push(newPreset);
    await writePresets(presets);

    return NextResponse.json(newPreset);
  } catch (error) {
    console.error('Error creating preset:', error);
    return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 });
  }
}


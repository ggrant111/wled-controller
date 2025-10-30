import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { EffectPreset } from '../../../../types';

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
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Write presets to file
async function writePresets(presets: EffectPreset[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

// GET /api/presets/[id] - Get a single preset
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    // Decode the ID in case it was URL encoded
    const id = decodeURIComponent(resolvedParams.id);
    
    console.log('GET /api/presets/[id] called');
    console.log('Request URL:', request.url);
    console.log('Raw ID from params:', resolvedParams.id);
    console.log('Decoded ID:', id);
    
    if (!id) {
      console.error('No ID provided in params');
      return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
    }
    
    const presets = await readPresets();
    console.log('Total presets loaded:', presets.length);
    if (presets.length > 0) {
      console.log('First preset ID:', presets[0].id);
      console.log('Preset IDs:', presets.map(p => p.id));
    }
    
    const preset = presets.find(p => p.id === id);

    if (!preset) {
      console.log('Preset not found with ID:', id);
      console.log('ID type:', typeof id);
      console.log('ID length:', id.length);
      if (presets.length > 0) {
        console.log('Available IDs:', presets.map(p => p.id));
        console.log('ID comparison test:', presets.map(p => ({ id: p.id, matches: p.id === id, lengthMatch: p.id.length === id.length })));
      }
      return NextResponse.json({ error: `Preset not found with ID: ${id}` }, { status: 404 });
    }

    console.log('Found preset:', preset.name);
    return NextResponse.json(preset);
  } catch (error) {
    console.error('Error reading preset:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to read preset: ${errorMessage}` }, { status: 500 });
  }
}

// PUT /api/presets/[id] - Update a preset
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, useLayers, effect, parameters, layers, layerParameters } = body;

    if (!name) {
      return NextResponse.json({ error: 'Preset name is required' }, { status: 400 });
    }

    const presets = await readPresets();
    const index = presets.findIndex(p => p.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    // Check if preset name already exists (excluding current preset)
    if (presets.some(p => p.name === name && p.id !== id)) {
      return NextResponse.json({ error: 'Preset name already exists' }, { status: 409 });
    }

    const updatedPreset: EffectPreset = {
      ...presets[index],
      name,
      description: description || '',
      updatedAt: new Date().toISOString(),
      useLayers: useLayers !== undefined ? useLayers : presets[index].useLayers,
      effect: effect ? { ...effect } : undefined,
      parameters: parameters ? { ...parameters } : undefined, // Already a Record
      layers: layers ? layers.map((l: any) => ({ ...l })) : undefined,
      layerParameters: layerParameters ? { ...layerParameters } : undefined // Already a Record
    };

    presets[index] = updatedPreset;
    await writePresets(presets);

    return NextResponse.json(updatedPreset);
  } catch (error) {
    console.error('Error updating preset:', error);
    return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 });
  }
}

// DELETE /api/presets/[id] - Delete a preset
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const presets = await readPresets();
    const filteredPresets = presets.filter(p => p.id !== id);

    if (filteredPresets.length === presets.length) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    await writePresets(filteredPresets);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting preset:', error);
    return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
  }
}


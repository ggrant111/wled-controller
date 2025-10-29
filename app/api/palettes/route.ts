import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Palette } from '../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PALETTES_FILE = path.join(DATA_DIR, 'palettes.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read palettes from file
async function readPalettes(): Promise<Palette[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(PALETTES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Write palettes to file
async function writePalettes(palettes: Palette[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PALETTES_FILE, JSON.stringify(palettes, null, 2));
}

// Generate unique ID for custom palettes
function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET /api/palettes - Get all custom palettes
export async function GET() {
  try {
    const palettes = await readPalettes();
    return NextResponse.json(palettes);
  } catch (error) {
    console.error('Error reading palettes:', error);
    return NextResponse.json({ error: 'Failed to read palettes' }, { status: 500 });
  }
}

// POST /api/palettes - Create a new custom palette
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, colors, description } = body;

    if (!name || !colors || !Array.isArray(colors)) {
      return NextResponse.json({ error: 'Invalid palette data' }, { status: 400 });
    }

    const palettes = await readPalettes();
    
    // Check if palette name already exists
    if (palettes.some(p => p.name === name)) {
      return NextResponse.json({ error: 'Palette name already exists' }, { status: 409 });
    }

    const newPalette: Palette = {
      id: generateId(),
      name,
      colors: [...colors], // Create a copy
      isCustom: true,
      description: description || ''
    };

    palettes.push(newPalette);
    await writePalettes(palettes);

    return NextResponse.json(newPalette);
  } catch (error) {
    console.error('Error creating palette:', error);
    return NextResponse.json({ error: 'Failed to create palette' }, { status: 500 });
  }
}

// PUT /api/palettes/[id] - Update a custom palette
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, colors, description } = body;

    if (!name || !colors || !Array.isArray(colors)) {
      return NextResponse.json({ error: 'Invalid palette data' }, { status: 400 });
    }

    const palettes = await readPalettes();
    const index = palettes.findIndex(p => p.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Palette not found' }, { status: 404 });
    }

    // Check if palette name already exists (excluding current palette)
    if (palettes.some(p => p.name === name && p.id !== id)) {
      return NextResponse.json({ error: 'Palette name already exists' }, { status: 409 });
    }

    const updatedPalette: Palette = {
      ...palettes[index],
      name,
      colors: [...colors], // Create a copy
      description: description || ''
    };

    palettes[index] = updatedPalette;
    await writePalettes(palettes);

    return NextResponse.json(updatedPalette);
  } catch (error) {
    console.error('Error updating palette:', error);
    return NextResponse.json({ error: 'Failed to update palette' }, { status: 500 });
  }
}

// DELETE /api/palettes/[id] - Delete a custom palette
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const palettes = await readPalettes();
    const index = palettes.findIndex(p => p.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Palette not found' }, { status: 404 });
    }

    palettes.splice(index, 1);
    await writePalettes(palettes);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting palette:', error);
    return NextResponse.json({ error: 'Failed to delete palette' }, { status: 500 });
  }
}

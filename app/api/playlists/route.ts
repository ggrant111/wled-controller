import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Playlist } from '../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read playlists from file
async function readPlaylists(): Promise<Playlist[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(PLAYLISTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Write playlists to file
async function writePlaylists(playlists: Playlist[]): Promise<void> {
  await ensureDataDir();
  const jsonContent = JSON.stringify(playlists, null, 2);
  const tempPath = PLAYLISTS_FILE + '.tmp';
  await fs.writeFile(tempPath, jsonContent + '\n', 'utf-8');
  await fs.rename(tempPath, PLAYLISTS_FILE);
}

// Generate unique ID for playlists
function generateId(): string {
  return `playlist-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// GET /api/playlists - Get all playlists
export async function GET() {
  try {
    const playlists = await readPlaylists();
    return NextResponse.json(playlists);
  } catch (error) {
    console.error('Error reading playlists:', error);
    return NextResponse.json({ error: 'Failed to read playlists' }, { status: 500 });
  }
}

// POST /api/playlists - Create a new playlist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, items, shuffle, loop, targets } = body;

    if (!name) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Playlist must have at least one item' }, { status: 400 });
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'Playlist must have at least one target' }, { status: 400 });
    }

    const playlists = await readPlaylists();
    
    // Check if playlist name already exists
    if (playlists.some(p => p.name === name)) {
      return NextResponse.json({ error: 'Playlist name already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const newPlaylist: Playlist = {
      id: generateId(),
      name,
      description: description || '',
      items: items.map((item: any, index: number) => ({
        id: item.id || `item-${Date.now()}-${index}`,
        presetId: item.presetId,
        duration: item.duration || 30, // Default 30 seconds
        order: index
      })),
      shuffle: shuffle || false,
      loop: loop || false,
      targets: targets,
      createdAt: now,
      updatedAt: now
    };

    playlists.push(newPlaylist);
    await writePlaylists(playlists);

    return NextResponse.json(newPlaylist);
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
}


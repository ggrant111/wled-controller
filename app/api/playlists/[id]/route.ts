import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Playlist } from '../../../../types';

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

// GET /api/playlists/[id] - Get a single playlist
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);
    const playlists = await readPlaylists();
    const playlist = playlists.find(p => p.id === id);

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json(playlist);
  } catch (error) {
    console.error('Error reading playlist:', error);
    return NextResponse.json({ error: 'Failed to read playlist' }, { status: 500 });
  }
}

// PUT /api/playlists/[id] - Update a playlist
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);
    const body = await request.json();
    const { name, description, items, shuffle, loop, targets } = body;

    const playlists = await readPlaylists();
    const playlistIndex = playlists.findIndex(p => p.id === id);

    if (playlistIndex === -1) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Check if name is being changed and if it conflicts with another playlist
    if (name && name !== playlists[playlistIndex].name) {
      if (playlists.some(p => p.id !== id && p.name === name)) {
        return NextResponse.json({ error: 'Playlist name already exists' }, { status: 409 });
      }
    }

    const updatedPlaylist: Playlist = {
      ...playlists[playlistIndex],
      name: name || playlists[playlistIndex].name,
      description: description !== undefined ? description : playlists[playlistIndex].description,
      items: items ? items.map((item: any, index: number) => ({
        id: item.id || `item-${Date.now()}-${index}`,
        presetId: item.presetId,
        duration: item.duration || 30,
        order: index
      })) : playlists[playlistIndex].items,
      shuffle: shuffle !== undefined ? shuffle : playlists[playlistIndex].shuffle,
      loop: loop !== undefined ? loop : playlists[playlistIndex].loop,
      targets: targets || playlists[playlistIndex].targets,
      updatedAt: new Date().toISOString()
    };

    playlists[playlistIndex] = updatedPlaylist;
    await writePlaylists(playlists);

    return NextResponse.json(updatedPlaylist);
  } catch (error) {
    console.error('Error updating playlist:', error);
    return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
  }
}

// DELETE /api/playlists/[id] - Delete a playlist
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);
    const playlists = await readPlaylists();
    const filteredPlaylists = playlists.filter(p => p.id !== id);

    if (filteredPlaylists.length === playlists.length) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    await writePlaylists(filteredPlaylists);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
  }
}


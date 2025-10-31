import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Schedule } from '../../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readSchedules(): Promise<Schedule[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(SCHEDULES_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeSchedules(schedules: Schedule[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);
    
    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }
    
    const updates = await request.json() as Partial<Schedule>;
    const schedules = await readSchedules();
    const index = schedules.findIndex(s => s.id === id);
    
    if (index === -1) {
      return NextResponse.json({ error: `Schedule not found with ID: ${id}` }, { status: 404 });
    }
    
    const updated: Schedule = {
      ...schedules[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    schedules[index] = updated;
    await writeSchedules(schedules);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating schedule:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to update schedule: ${errorMessage}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = decodeURIComponent(resolvedParams.id);
    
    console.log('[DELETE] /api/schedules/[id] - Request received');
    console.log('[DELETE] Request URL:', request.url);
    console.log('[DELETE] Raw ID from params:', resolvedParams.id);
    console.log('[DELETE] Decoded ID:', id);
    
    if (!id || id.trim() === '') {
      console.error('[DELETE] No ID provided');
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }
    
    const schedules = await readSchedules();
    console.log('[DELETE] Total schedules loaded:', schedules.length);
    if (schedules.length > 0) {
      console.log('[DELETE] All schedule IDs:', JSON.stringify(schedules.map(s => s.id)));
    }
    
    const index = schedules.findIndex(s => s.id === id);
    console.log('[DELETE] Found schedule at index:', index);
    
    if (index === -1) {
      console.log('[DELETE] Schedule not found with ID:', id);
      console.log('[DELETE] Available IDs for comparison:', schedules.map(s => ({ id: s.id, matches: s.id === id })));
      return NextResponse.json({ error: `Schedule not found with ID: ${id}` }, { status: 404 });
    }
    
    const deletedSchedule = schedules[index];
    schedules.splice(index, 1);
    await writeSchedules(schedules);
    console.log('[DELETE] Schedule deleted successfully:', deletedSchedule.name);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[DELETE] Error deleting schedule:', error);
    if (error instanceof Error) {
      console.error('[DELETE] Error name:', error.name);
      console.error('[DELETE] Error message:', error.message);
      console.error('[DELETE] Error stack:', error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to delete schedule: ${errorMessage}` }, { status: 500 });
  }
}



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
    const { id } = await params;
    const updates = await request.json() as Partial<Schedule>;
    const schedules = await readSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
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
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const schedules = await readSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    schedules.splice(index, 1);
    await writeSchedules(schedules);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
  }
}



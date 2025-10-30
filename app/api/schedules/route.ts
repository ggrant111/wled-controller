import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Schedule } from '../../../types';

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

function generateId(): string {
  return `sched-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET() {
  try {
    const schedules = await readSchedules();
    return NextResponse.json(schedules);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, enabled = true, rules } = body as Partial<Schedule>;
    if (!name || !Array.isArray(rules)) {
      return NextResponse.json({ error: 'Invalid schedule data' }, { status: 400 });
    }
    const schedules = await readSchedules();
    const now = new Date().toISOString();
    const schedule: Schedule = {
      id: generateId(),
      name,
      enabled,
      rules,
      createdAt: now,
      updatedAt: now
    };
    schedules.push(schedule);
    await writeSchedules(schedules);
    return NextResponse.json(schedule);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}



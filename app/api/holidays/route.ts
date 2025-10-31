import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Holiday } from '../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const HOLIDAYS_FILE = path.join(DATA_DIR, 'holidays.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read holidays from file
async function readHolidays(): Promise<Holiday[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(HOLIDAYS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Write holidays to file
async function writeHolidays(holidays: Holiday[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2));
}

// GET /api/holidays - Get all holidays
export async function GET() {
  try {
    const holidays = await readHolidays();
    return NextResponse.json(holidays);
  } catch (error) {
    console.error('Error reading holidays:', error);
    return NextResponse.json({ error: 'Failed to read holidays' }, { status: 500 });
  }
}

// POST /api/holidays - Create a new holiday
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, date, isRecurring, description } = body;

    // Validation
    if (!name || !date) {
      return NextResponse.json({ error: 'Name and date are required' }, { status: 400 });
    }

    // Validate date format (MM-DD for recurring, YYYY-MM-DD for one-time, or variable pattern like "4TH_THURSDAY_NOVEMBER")
    const isVariablePattern = date.includes('_') && !date.includes('-');
    if (!isVariablePattern) {
      const dateRegex = isRecurring ? /^\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return NextResponse.json(
          { error: 'Invalid date format. Use MM-DD for recurring holidays or YYYY-MM-DD for one-time holidays' },
          { status: 400 }
        );
      }
    } else {
      // Validate variable pattern format: NTH_DAYNAME_MONTHNAME
      const parts = date.split('_');
      if (parts.length !== 3) {
        return NextResponse.json(
          { error: 'Invalid variable date pattern. Use format like "4TH_THURSDAY_NOVEMBER"' },
          { status: 400 }
        );
      }
      const [nth, dayName, monthName] = parts;
      const validNth = ['1ST', '2ND', '3RD', '4TH', '5TH', 'LAST'].includes(nth.toUpperCase());
      const validDays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].includes(dayName.toUpperCase());
      const validMonths = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'].includes(monthName.toUpperCase());
      
      if (!validNth || !validDays || !validMonths) {
        return NextResponse.json(
          { error: 'Invalid variable date pattern. Use format like "4TH_THURSDAY_NOVEMBER"' },
          { status: 400 }
        );
      }
    }

    const holidays = await readHolidays();

    // Check for duplicate name
    if (holidays.some(h => h.name === name && h.id !== body.id)) {
      return NextResponse.json({ error: 'A holiday with this name already exists' }, { status: 409 });
    }

    const newHoliday: Holiday = {
      id: uuidv4(),
      name,
      date,
      isRecurring: isRecurring ?? true,
      description: description || undefined,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    holidays.push(newHoliday);
    await writeHolidays(holidays);

    return NextResponse.json(newHoliday, { status: 201 });
  } catch (error) {
    console.error('Error creating holiday:', error);
    return NextResponse.json({ error: 'Failed to create holiday' }, { status: 500 });
  }
}


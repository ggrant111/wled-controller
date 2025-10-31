import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Holiday } from '../../../../types';

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
    return [];
  }
}

// Write holidays to file
async function writeHolidays(holidays: Holiday[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2));
}

// GET /api/holidays/[id] - Get a specific holiday
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const holidays = await readHolidays();
    const holiday = holidays.find(h => h.id === id);

    if (!holiday) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    }

    return NextResponse.json(holiday);
  } catch (error) {
    console.error('Error reading holiday:', error);
    return NextResponse.json({ error: 'Failed to read holiday' }, { status: 500 });
  }
}

// PUT /api/holidays/[id] - Update a holiday
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const index = holidays.findIndex(h => h.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    }

    // Check for duplicate name (excluding current holiday)
    if (holidays.some(h => h.name === name && h.id !== id)) {
      return NextResponse.json({ error: 'A holiday with this name already exists' }, { status: 409 });
    }

    // Don't allow editing built-in holidays' core properties
    const existingHoliday = holidays[index];
    if (!existingHoliday.isCustom) {
      // Only allow editing description for built-in holidays
      holidays[index] = {
        ...existingHoliday,
        description: description || existingHoliday.description,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Full edit allowed for custom holidays
      holidays[index] = {
        ...existingHoliday,
        name,
        date,
        isRecurring: isRecurring ?? existingHoliday.isRecurring,
        description: description || undefined,
        updatedAt: new Date().toISOString(),
      };
    }

    await writeHolidays(holidays);

    return NextResponse.json(holidays[index]);
  } catch (error) {
    console.error('Error updating holiday:', error);
    return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500 });
  }
}

// DELETE /api/holidays/[id] - Delete a holiday
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const holidays = await readHolidays();
    const index = holidays.findIndex(h => h.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
    }

    // Don't allow deleting built-in holidays
    if (!holidays[index].isCustom) {
      return NextResponse.json({ error: 'Cannot delete built-in holidays' }, { status: 403 });
    }

    holidays.splice(index, 1);
    await writeHolidays(holidays);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// POST /api/wled/[ip]/brightness - Update brightness on WLED device directly
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  try {
    const resolvedParams = await params;
    const ip = decodeURIComponent(resolvedParams.ip);
    const body = await request.json();
    const { brightness } = body; // brightness should be 0-255 range

    if (brightness === undefined || brightness === null) {
      return NextResponse.json(
        { error: 'Brightness value is required' },
        { status: 400 }
      );
    }

    // Validate brightness range (0-255)
    const bri = Math.max(0, Math.min(255, Math.round(brightness)));

    // Forward request to WLED device
    const url = `http://${ip}/json/state`;
    const response = await axios.post(url, { bri }, {
      timeout: 3000,
      validateStatus: () => true, // Accept any status code
    });

    if (response.status === 200) {
      return NextResponse.json({ success: true, brightness: bri });
    } else {
      return NextResponse.json(
        { error: `WLED device returned status ${response.status}` },
        { status: response.status }
      );
    }
  } catch (error: any) {
    // Handle timeout and connection errors gracefully
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Device timeout - device may be slow or unreachable' },
          { status: 408 }
        );
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return NextResponse.json(
          { error: 'Cannot connect to device' },
          { status: 503 }
        );
      }
    }
    
    console.error(`Error updating brightness on WLED device:`, error);
    return NextResponse.json(
      { error: 'Failed to update brightness on device' },
      { status: 500 }
    );
  }
}


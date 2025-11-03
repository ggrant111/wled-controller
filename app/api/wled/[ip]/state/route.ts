import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// GET /api/wled/[ip]/state - Get device state from WLED device directly
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  try {
    const resolvedParams = await params;
    const ip = decodeURIComponent(resolvedParams.ip);

    // Forward request to WLED device
    const url = `http://${ip}/json`;
    const response = await axios.get(url, {
      timeout: 3000,
      validateStatus: () => true, // Accept any status code
    });

    if (response.status === 200) {
      return NextResponse.json(response.data);
    } else {
      return NextResponse.json(
        { error: `WLED device returned status ${response.status}`, online: false },
        { status: response.status }
      );
    }
  } catch (error: any) {
    // Handle timeout and connection errors gracefully
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Device timeout', online: false },
          { status: 408 }
        );
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return NextResponse.json(
          { error: 'Cannot connect to device', online: false },
          { status: 503 }
        );
      }
    }
    
    console.error(`Error getting state from WLED device:`, error);
    return NextResponse.json(
      { error: 'Failed to get device state', online: false },
      { status: 500 }
    );
  }
}


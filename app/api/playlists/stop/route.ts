import { NextRequest, NextResponse } from 'next/server';

// POST /api/playlists/stop - Stop the currently active playlist
// This proxies to the Express server
export async function POST(request: NextRequest) {
  try {
    // Forward the request to Express server
    const response = await fetch('http://localhost:3001/api/playlists/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(errorData, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying playlist stop request:', error);
    return NextResponse.json(
      { error: 'Failed to stop playlist' },
      { status: 500 }
    );
  }
}


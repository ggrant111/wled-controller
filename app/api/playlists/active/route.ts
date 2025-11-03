import { NextRequest, NextResponse } from 'next/server';

// GET /api/playlists/active - Get information about the currently active playlist
// This is proxied to the Express server via next.config.js rewrite
export async function GET() {
  // This route should not be called directly as it's rewritten to Express
  // But we'll provide a fallback that calls the Express server directly
  try {
    const response = await fetch('http://localhost:3001/api/playlists/active', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      return NextResponse.json({ activePlaylist: null });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting active playlist:', error);
    return NextResponse.json({ activePlaylist: null });
  }
}


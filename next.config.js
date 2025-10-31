/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      // Rewrite all API routes except schedules to Express server
      {
        source: "/api/devices/:path*",
        destination: "http://localhost:3001/api/devices/:path*",
      },
      {
        source: "/api/groups/:path*",
        destination: "http://localhost:3001/api/groups/:path*",
      },
      {
        source: "/api/virtuals/:path*",
        destination: "http://localhost:3001/api/virtuals/:path*",
      },
      {
        source: "/api/effects/:path*",
        destination: "http://localhost:3001/api/effects/:path*",
      },
      {
        source: "/api/stream/:path*",
        destination: "http://localhost:3001/api/stream/:path*",
      },
      {
        source: "/api/schedules/active",
        destination: "http://localhost:3001/api/schedules/active",
      },
      {
        source: "/api/settings/:path*",
        destination: "http://localhost:3001/api/settings/:path*",
      },
      {
        source: "/api/brightness",
        destination: "http://localhost:3001/api/brightness",
      },
      // Schedules (except /active), presets, and palettes are handled by Next.js API routes
    ];
  },
  // Add CORS for Socket.IO
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

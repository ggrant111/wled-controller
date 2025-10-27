# WLED Controller

A modern, intuitive web application for controlling WLED devices via DDP (UDP 4048). Features real-time LED effects, device management, and a beautiful glassy UI built with Next.js and TypeScript.

## Features

### 🔌 Device Management

- Add, edit, and remove WLED devices
- Configure IP address, port (default 4048), LED count, and segments
- Real-time device status monitoring
- Segment-based LED control with individual colors and brightness

### 👥 Groups & Virtual Devices

- Organize devices into groups for synchronized control
- Create virtual devices with custom layouts
- Visual layout representation for complex LED setups

### 💡 Real-time Effects

- **Comet**: Animated comet with customizable tail and speed
- **Color Wipe**: Smooth color transitions across LED strips
- **Fire**: Realistic fire effect with adjustable intensity
- **Rainbow**: Colorful rainbow patterns with speed control
- **Twinkle**: Sparkling star-like effects
- **VU Bars**: Audio-reactive bars (simulated)
- **Solid**: Solid color fills
- **Breathing**: Pulsing brightness effects
- **Chase**: Moving light patterns

### 🎛 Streaming & Control

- Real-time DDP packet streaming at 30-120 FPS
- Adjustable frame rates and blend modes
- Per-device, per-group, and per-virtual streaming
- Live parameter adjustment with instant feedback

### 🌈 Brightness Control

- Global brightness control
- Per-device brightness settings
- Per-segment brightness adjustment
- Smooth brightness transitions

### 🧩 Presets & Scenes

- Save effect combinations as presets
- Quick recall of saved configurations
- Export/import preset configurations

### 🖥 Modern UI/UX

- Glassy, card-based design with Tailwind CSS
- Responsive layout for mobile and desktop
- Smooth animations with Framer Motion
- Real-time parameter controls with live preview
- Dark theme optimized for LED control environments

## Tech Stack

### Frontend

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Lucide React** - Icon library

### Backend

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **UDP/DDP** - LED device communication protocol

### Storage

- **JSON files** - Simple file-based storage (no database required)

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd wled-controller
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start development servers**

   ```bash
   npm run dev
   ```

   This will start both the Next.js frontend (port 3000) and Express backend (port 3001) concurrently.

## Usage

### Adding Devices

1. Click the "Add Device" button on the dashboard
2. Enter device details:
   - **Name**: Friendly name for your device
   - **IP Address**: WLED device IP address
   - **Port**: UDP port (default: 4048)
   - **LED Count**: Number of LEDs in your strip
3. Configure LED segments:
   - **Start**: Starting LED index
   - **Length**: Number of LEDs in segment
   - **Color**: Default segment color
   - **Brightness**: Segment brightness (0-100%)

### Creating Effects

1. Select an effect from the Effects panel
2. Adjust parameters in real-time:
   - **Speed**: Animation speed
   - **Color**: Effect colors
   - **Length**: Effect size/duration
   - **Mirror**: Mirror effects across segments
3. Click "Start Streaming" to begin real-time LED control

### Managing Groups

1. Create groups to control multiple devices simultaneously
2. Add devices to groups for synchronized effects
3. Control group brightness and streaming status

### Using Presets

1. Configure your desired effect and parameters
2. Save as a preset with a memorable name
3. Quickly recall presets for instant LED control

## API Endpoints

### Devices

- `GET /api/devices` - List all devices
- `POST /api/devices` - Add new device
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Remove device

### Groups

- `GET /api/groups` - List all groups
- `POST /api/groups` - Create new group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Remove group

### Virtual Devices

- `GET /api/virtuals` - List all virtual devices
- `POST /api/virtuals` - Create virtual device
- `PUT /api/virtuals/:id` - Update virtual device
- `DELETE /api/virtuals/:id` - Remove virtual device

### Streaming

- `POST /api/stream/start` - Start streaming session
- `POST /api/stream/stop/:sessionId` - Stop specific session
- `POST /api/stream/stop-all` - Stop all streaming

### Effects

- `GET /api/effects` - List available effects

### Brightness

- `POST /api/brightness` - Update brightness for device/group/virtual

### Presets

- `GET /api/presets` - List all presets
- `POST /api/presets` - Save new preset
- `PUT /api/presets/:id` - Update preset
- `DELETE /api/presets/:id` - Remove preset

## DDP Protocol

The application uses the DDP (DDP) protocol for LED communication:

### Packet Format

```
Header (10 bytes):
- 0x41: Magic byte
- 0x00: Reserved
- 0x01: Version
- 0x01: Type (RGB)
- Offset (4 bytes, little endian)
- Length (2 bytes, little endian)

Payload:
- RGB data (3 bytes per LED)
```

### Example Usage

```typescript
// Send RGB data to device
await ddpSender.sendToDevice(deviceId, rgbBuffer);

// Send to specific segment
await ddpSender.sendToSegment(deviceId, segmentId, rgbBuffer);
```

## Development

### Project Structure

```
wled-controller/
├── app/                    # Next.js app directory
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Dashboard page
├── components/            # React components
│   ├── DeviceCard.tsx     # Device display card
│   ├── DeviceModal.tsx    # Device configuration modal
│   └── EffectPanel.tsx    # Effect controls panel
├── hooks/                 # Custom React hooks
│   └── useSocket.ts       # Socket.IO client hook
├── lib/                   # Utility libraries
│   ├── ddp-sender.ts      # UDP/DDP communication
│   ├── effects.ts         # Effect engine
│   └── storage.ts         # JSON file storage
├── server/                # Express backend
│   └── index.ts           # Server entry point
├── types/                 # TypeScript definitions
│   └── index.ts           # Type definitions
└── data/                  # JSON storage files
    ├── devices.json
    ├── groups.json
    ├── virtuals.json
    └── presets.json
```

### Available Scripts

- `npm run dev` - Start development servers (client + server)
- `npm run dev:client` - Start Next.js development server only
- `npm run dev:server` - Start Express development server only
- `npm run build` - Build for production
- `npm run start` - Start production servers
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint

### Adding New Effects

1. Define effect parameters in `lib/effects.ts`
2. Implement effect logic in `EffectEngine.generateFrame()`
3. Add effect to `defaultEffects` array
4. Effect will automatically appear in the UI

Example:

```typescript
{
  id: 'my-effect',
  name: 'My Custom Effect',
  type: 'my-effect',
  parameters: [
    { name: 'speed', type: 'range', value: 0.1, min: 0.01, max: 1.0, step: 0.01 },
    { name: 'color', type: 'color', value: '#ff0000' }
  ]
}
```

## Troubleshooting

### Common Issues

1. **Devices not responding**

   - Check IP address and port (default 4048)
   - Ensure WLED device is online and accessible
   - Verify firewall settings allow UDP traffic

2. **Streaming not working**

   - Check device connection status
   - Verify LED count matches device configuration
   - Ensure segments are properly configured

3. **Real-time updates not working**
   - Check Socket.IO connection status
   - Verify server is running on port 3001
   - Check browser console for connection errors

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG=wled-controller npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see LICENSE file for details

## Acknowledgments

- [WLED](https://github.com/Aircoookie/WLED) - Amazing WiFi LED control firmware
- [DDP Protocol](https://www.3waylabs.com/ddp/) - LED communication protocol
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Framer Motion](https://www.framer.com/motion/) - Animation library

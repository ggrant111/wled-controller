import { Palette } from '../types';

// FastLED-inspired preset palettes
export const presetPalettes: Palette[] = [
  {
    id: 'rainbow',
    name: 'Rainbow',
    colors: ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'],
    description: 'Classic rainbow spectrum'
  },
  {
    id: 'rainbow-stripe',
    name: 'Rainbow Stripe',
    colors: ['#ff0000', '#ff0000', '#ff8000', '#ff8000', '#ffff00', '#ffff00', '#80ff00', '#80ff00', '#00ff00', '#00ff00', '#00ff80', '#00ff80', '#00ffff', '#00ffff', '#0080ff', '#0080ff'],
    description: 'Rainbow with color stripes'
  },
  {
    id: 'ocean',
    name: 'Ocean',
    colors: ['#000080', '#0000ff', '#0080ff', '#00ffff', '#80ffff', '#ffffff', '#80ffff', '#00ffff', '#0080ff', '#0000ff', '#000080', '#000040'],
    description: 'Deep ocean blues and cyans'
  },
  {
    id: 'cloud',
    name: 'Cloud',
    colors: ['#404040', '#606060', '#808080', '#a0a0a0', '#c0c0c0', '#e0e0e0', '#ffffff', '#e0e0e0', '#c0c0c0', '#a0a0a0', '#808080', '#606060'],
    description: 'Soft cloud-like grays and whites'
  },
  {
    id: 'lava',
    name: 'Lava',
    colors: ['#000000', '#800000', '#ff0000', '#ff8000', '#ffff00', '#ff8000', '#ff0000', '#800000', '#000000', '#400000', '#800000', '#c00000'],
    description: 'Hot lava reds and oranges'
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: ['#004000', '#008000', '#00ff00', '#80ff00', '#ffff00', '#80ff00', '#00ff00', '#008000', '#004000', '#002000', '#004000', '#006000'],
    description: 'Natural forest greens'
  },
  {
    id: 'party',
    name: 'Party',
    colors: ['#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080'],
    description: 'Bright party colors'
  },
  {
    id: 'red-white-blue',
    name: 'Red White Blue',
    colors: ['#ff0000', '#808080', '#0000ff', '#000000', '#ff0000', '#808080', '#0000ff', '#000000', '#ff0000', '#ff0000', '#808080', '#808080', '#0000ff', '#0000ff', '#000000', '#000000'],
    description: 'Patriotic red, white, and blue'
  },
  {
    id: 'purple-green',
    name: 'Purple Green',
    colors: ['#800080', '#800080', '#000000', '#000000', '#008000', '#008000', '#000000', '#000000', '#800080', '#800080', '#000000', '#000000', '#008000', '#008000', '#000000', '#000000'],
    description: 'Purple and green stripes'
  },
  {
    id: 'black-white-stripe',
    name: 'Black White Stripe',
    colors: ['#ffffff', '#000000', '#000000', '#000000', '#ffffff', '#000000', '#000000', '#000000', '#ffffff', '#000000', '#000000', '#000000', '#ffffff', '#000000', '#000000', '#000000'],
    description: 'Black and white stripes'
  },
  {
    id: 'fairy-light',
    name: 'Fairy Light',
    colors: ['#ffd700', '#ffd700', '#ffd700', '#ffd700', '#ffb000', '#ffb000', '#ffd700', '#ffd700', '#ff8000', '#ff8000', '#ffd700', '#ffd700', '#ffd700', '#ffd700', '#ffd700', '#ffd700'],
    description: 'Warm fairy light colors'
  },
  {
    id: 'ice',
    name: 'Ice',
    colors: ['#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#0c1040', '#182080', '#182080', '#5080c0', '#5080c0'],
    description: 'Cold icy blues'
  },
  {
    id: 'holiday',
    name: 'Holiday',
    colors: ['#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#00580c', '#b00402'],
    description: 'Holiday green with red accents'
  },
  {
    id: 'retro-c9',
    name: 'Retro C9',
    colors: ['#b80400', '#902c02', '#b80400', '#902c02', '#902c02', '#b80400', '#902c02', '#b80400', '#046002', '#046002', '#046002', '#046002', '#070758', '#070758', '#070758', '#606820'],
    description: 'Classic C9 Christmas lights'
  },
  {
    id: 'snow',
    name: 'Snow',
    colors: ['#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#304048', '#e0f0ff'],
    description: 'Soft snow with bright accents'
  }
];

export class PaletteManager {
  private customPalettes: Palette[] = [];

  constructor() {
    // Custom palettes will be loaded via API calls
    this.customPalettes = [];
  }

  getAllPalettes(): Palette[] {
    return [...presetPalettes, ...this.customPalettes];
  }

  getPresetPalettes(): Palette[] {
    return [...presetPalettes];
  }

  getCustomPalettes(): Palette[] {
    return [...this.customPalettes];
  }

  getPaletteById(id: string): Palette | undefined {
    const allPalettes = this.getAllPalettes();
    return allPalettes.find(palette => palette.id === id);
  }

  // Load custom palettes from server
  async loadCustomPalettes(): Promise<void> {
    try {
      const response = await fetch('/api/palettes');
      if (response.ok) {
        this.customPalettes = await response.json();
      }
    } catch (error) {
      console.error('Failed to load custom palettes:', error);
      this.customPalettes = [];
    }
  }

  // Load custom palettes from file (server-side only)
  async loadCustomPalettesFromFile(): Promise<void> {
    // Only run on server side
    if (typeof window !== 'undefined') {
      console.warn('loadCustomPalettesFromFile can only be called on the server side');
      return;
    }
    
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const dataDir = path.join(process.cwd(), 'data');
      const palettesFile = path.join(dataDir, 'palettes.json');
      
      const data = await fs.readFile(palettesFile, 'utf8');
      this.customPalettes = JSON.parse(data);
    } catch (error) {
      console.error('Failed to load custom palettes from file:', error);
      this.customPalettes = [];
    }
  }

  // Create custom palette via API
  async createCustomPalette(name: string, colors: string[], description?: string): Promise<Palette | null> {
    try {
      const response = await fetch('/api/palettes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, colors, description })
      });

      if (response.ok) {
        const palette = await response.json();
        this.customPalettes.push(palette);
        return palette;
      }
    } catch (error) {
      console.error('Failed to create custom palette:', error);
    }
    return null;
  }

  // Update custom palette via API
  async updateCustomPalette(id: string, updates: Partial<Palette>): Promise<boolean> {
    try {
      const response = await fetch(`/api/palettes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const updatedPalette = await response.json();
        const index = this.customPalettes.findIndex(palette => palette.id === id);
        if (index !== -1) {
          this.customPalettes[index] = updatedPalette;
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to update custom palette:', error);
    }
    return false;
  }

  // Delete custom palette via API
  async deleteCustomPalette(id: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/palettes/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const index = this.customPalettes.findIndex(palette => palette.id === id);
        if (index !== -1) {
          this.customPalettes.splice(index, 1);
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to delete custom palette:', error);
    }
    return false;
  }

  // Duplicate palette via API
  async duplicatePalette(id: string, newName?: string): Promise<Palette | null> {
    const palette = this.getPaletteById(id);
    if (!palette) return null;

    const name = newName || `${palette.name} (Copy)`;
    return await this.createCustomPalette(name, palette.colors, palette.description);
  }


  // Utility function to interpolate between colors in a palette
  interpolateColor(palette: Palette, position: number): { r: number; g: number; b: number } {
    const colors = palette.colors;
    if (!colors || colors.length === 0) return { r: 0, g: 0, b: 0 };
    
    // Filter out invalid colors
    const validColors = colors.filter(c => c != null && typeof c === 'string' && c.trim() !== '');
    if (validColors.length === 0) return { r: 0, g: 0, b: 0 };
    if (validColors.length === 1) return this.parseColor(validColors[0]);

    // Normalize position to 0-1 range
    let normalizedPos = position % 1;
    if (normalizedPos < 0) normalizedPos += 1;

    // For seamless looping, we need to handle the transition from last to first color
    const scaledPos = normalizedPos * validColors.length;
    const index1 = Math.floor(scaledPos) % validColors.length;
    const index2 = (index1 + 1) % validColors.length;
    const t = scaledPos - Math.floor(scaledPos);

    const color1 = this.parseColor(validColors[index1]);
    const color2 = this.parseColor(validColors[index2]);

    return {
      r: Math.floor(color1.r + (color2.r - color1.r) * t),
      g: Math.floor(color1.g + (color2.g - color1.g) * t),
      b: Math.floor(color1.b + (color2.b - color1.b) * t)
    };
  }

  // Get color from palette at specific index with blending
  getColorFromPalette(palette: Palette, colorIndex: number, brightness: number = 255, blending: 'linear' | 'none' = 'linear'): { r: number; g: number; b: number } {
    // Validate palette colors
    if (!palette.colors || palette.colors.length === 0) {
      return { r: 0, g: 0, b: 0 };
    }
    
    if (blending === 'none') {
      const index = Math.floor(colorIndex) % palette.colors.length;
      const color = this.parseColor(palette.colors[index]);
      return {
        r: Math.floor(color.r * brightness / 255),
        g: Math.floor(color.g * brightness / 255),
        b: Math.floor(color.b * brightness / 255)
      };
    } else {
      const color = this.interpolateColor(palette, colorIndex / 256);
      return {
        r: Math.floor(color.r * brightness / 255),
        g: Math.floor(color.g * brightness / 255),
        b: Math.floor(color.b * brightness / 255)
      };
    }
  }

  private parseColor(colorStr: string | undefined | null): { r: number; g: number; b: number } {
    // Handle undefined, null, or empty strings
    if (!colorStr || typeof colorStr !== 'string' || colorStr.trim() === '') {
      return { r: 0, g: 0, b: 0 };
    }
    const hex = colorStr.replace('#', '').trim();
    // Validate hex string length
    if (hex.length !== 6 && hex.length !== 3) {
      return { r: 0, g: 0, b: 0 };
    }
    // Handle 3-digit hex (expand to 6)
    const fullHex = hex.length === 3 
      ? hex.split('').map(c => c + c).join('')
      : hex;
    return {
      r: parseInt(fullHex.substr(0, 2), 16) || 0,
      g: parseInt(fullHex.substr(2, 2), 16) || 0,
      b: parseInt(fullHex.substr(4, 2), 16) || 0
    };
  }

  // Generate random palette
  async generateRandomPalette(name?: string): Promise<Palette | null> {
    const colors: string[] = [];
    const colorCount = 8 + Math.floor(Math.random() * 8); // 8-16 colors

    for (let i = 0; i < colorCount; i++) {
      const hue = Math.floor(Math.random() * 360);
      const saturation = 200 + Math.floor(Math.random() * 56); // 200-255
      const value = 200 + Math.floor(Math.random() * 56); // 200-255
      
      const color = this.hsvToRgb(hue, saturation / 255, value / 255);
      colors.push(this.rgbToHex(color.r, color.g, color.b));
    }

    return await this.createCustomPalette(
      name || `Random ${new Date().toLocaleTimeString()}`,
      colors,
      'Generated random palette'
    );
  }

  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    
    let r, g, b;
    if (h < 60) {
      r = c; g = x; b = 0;
    } else if (h < 120) {
      r = x; g = c; b = 0;
    } else if (h < 180) {
      r = 0; g = c; b = x;
    } else if (h < 240) {
      r = 0; g = x; b = c;
    } else if (h < 300) {
      r = x; g = 0; b = c;
    } else {
      r = c; g = 0; b = x;
    }
    
    return {
      r: Math.floor((r + m) * 255),
      g: Math.floor((g + m) * 255),
      b: Math.floor((b + m) * 255)
    };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return `#${Math.floor(r).toString(16).padStart(2, '0')}${Math.floor(g).toString(16).padStart(2, '0')}${Math.floor(b).toString(16).padStart(2, '0')}`;
  }
}

// Export a singleton instance
export const paletteManager = new PaletteManager();

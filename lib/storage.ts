import fs from 'fs/promises';
import path from 'path';
import { WLEDDevice, Group, VirtualDevice, Preset, Schedule, LocationSettings, Playlist } from '../types';

export class JSONStorage {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.access(this.dataDir);
    } catch {
      await fs.mkdir(this.dataDir, { recursive: true });
    }
  }

  private getFilePath(filename: string): string {
    return path.join(this.dataDir, `${filename}.json`);
  }

  async loadDevices(): Promise<WLEDDevice[]> {
    try {
      await this.ensureDataDir();
      const filePath = this.getFilePath('devices');
      let data = await fs.readFile(filePath, 'utf-8');
      if (!data || data.trim() === '') {
        console.warn(`devices.json is empty, returning empty array`);
        return [];
      }
      
      // Clean up any trailing brackets or extra characters that might cause JSON parse errors
      data = data.trim();
      
      // Try to parse first - if it works, great!
      let parsed: WLEDDevice[];
      try {
        parsed = JSON.parse(data);
      } catch (parseError) {
        // If parsing fails, try to find and remove trailing invalid content
        // Find the first valid closing bracket of the root array by counting brackets
        // (ignoring brackets inside strings)
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;
        let lastValidBracketIndex = -1;
        
        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '[') {
              bracketCount++;
            } else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) {
                // This is the closing bracket of the root array
                lastValidBracketIndex = i;
                break;
              }
            }
          }
        }
        
        // If we found a valid root array closing bracket, try parsing with cleaned data
        if (lastValidBracketIndex !== -1 && lastValidBracketIndex < data.length - 1) {
          const afterBracket = data.substring(lastValidBracketIndex + 1).trim();
          if (afterBracket.length > 0) {
            console.warn(`Found extra content after valid JSON in devices.json (${afterBracket.length} chars), cleaning up`);
            data = data.substring(0, lastValidBracketIndex + 1);
            // Try parsing the cleaned data
            parsed = JSON.parse(data);
          } else {
            // No extra content but still failed to parse - rethrow original error
            throw parseError;
          }
        } else {
          // Couldn't find valid bracket structure - rethrow original error
          throw parseError;
        }
      }
      if (!Array.isArray(parsed)) {
        console.error(`devices.json does not contain an array, got: ${typeof parsed}`);
        return [];
      }
      return parsed;
    } catch (error) {
      console.error('Error loading devices from storage:', error);
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        console.warn('devices.json file does not exist, returning empty array');
      }
      // Try to fix the file if there's a parse error
      try {
        await this.fixCorruptedDevicesFile();
      } catch (fixError) {
        console.error('Failed to fix corrupted devices.json:', fixError);
      }
      return [];
    }
  }
  
  private async fixCorruptedDevicesFile(): Promise<void> {
    try {
      const filePath = this.getFilePath('devices');
      let data = await fs.readFile(filePath, 'utf-8');
      data = data.trim();
      
      // Try to parse first
      try {
        JSON.parse(data);
        // File is valid, nothing to fix
        return;
      } catch {
        // File is corrupted, try to fix it
      }
      
      // Find the first valid closing bracket (accounting for strings)
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      let lastValidBracketIndex = -1;
      
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '[') {
            bracketCount++;
          } else if (char === ']') {
            bracketCount--;
            if (bracketCount === 0) {
              lastValidBracketIndex = i;
              break;
            }
          }
        }
      }
      
      if (lastValidBracketIndex !== -1) {
        const cleanedData = data.substring(0, lastValidBracketIndex + 1);
        // Verify it's valid JSON
        JSON.parse(cleanedData);
        // Save the cleaned version atomically
        const tempPath = filePath + '.tmp';
        await fs.writeFile(tempPath, cleanedData + '\n', 'utf-8');
        await fs.rename(tempPath, filePath);
        console.log('Successfully fixed corrupted devices.json file');
      } else {
        console.warn('Could not determine valid JSON structure in devices.json');
      }
    } catch (error) {
      console.error('Could not automatically fix devices.json:', error);
    }
  }

  async saveDevices(devices: WLEDDevice[]): Promise<void> {
    await this.ensureDataDir();
    const filePath = this.getFilePath('devices');
    // Generate clean JSON and ensure it's valid
    const jsonContent = JSON.stringify(devices, null, 2);
    
    // Verify the JSON is valid before writing
    try {
      JSON.parse(jsonContent);
    } catch (error) {
      console.error('Generated invalid JSON in saveDevices:', error);
      throw new Error('Failed to generate valid JSON for devices');
    }
    
    // Write file atomically - write to temp file first, then rename to prevent corruption
    const tempPath = filePath + '.tmp';
    await fs.writeFile(tempPath, jsonContent + '\n', 'utf-8');
    await fs.rename(tempPath, filePath);
  }

  async loadGroups(): Promise<Group[]> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.getFilePath('groups'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveGroups(groups: Group[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('groups'), JSON.stringify(groups, null, 2));
  }

  async loadVirtuals(): Promise<VirtualDevice[]> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.getFilePath('virtuals'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveVirtuals(virtuals: VirtualDevice[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('virtuals'), JSON.stringify(virtuals, null, 2));
  }

  async loadPresets(): Promise<Preset[]> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.getFilePath('presets'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async savePresets(presets: Preset[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('presets'), JSON.stringify(presets, null, 2));
  }

  async loadSchedules(): Promise<Schedule[]> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.getFilePath('schedules'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveSchedules(schedules: Schedule[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('schedules'), JSON.stringify(schedules, null, 2));
  }

  async addDevice(device: WLEDDevice): Promise<void> {
    const devices = await this.loadDevices();
    devices.push(device);
    await this.saveDevices(devices);
  }

  async updateDevice(device: WLEDDevice): Promise<void> {
    const devices = await this.loadDevices();
    const index = devices.findIndex(d => d.id === device.id);
    if (index !== -1) {
      devices[index] = device;
      await this.saveDevices(devices);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    const devices = await this.loadDevices();
    const filtered = devices.filter(d => d.id !== deviceId);
    await this.saveDevices(filtered);
  }

  async addGroup(group: Group): Promise<void> {
    const groups = await this.loadGroups();
    groups.push(group);
    await this.saveGroups(groups);
  }

  async updateGroup(group: Group): Promise<void> {
    const groups = await this.loadGroups();
    const index = groups.findIndex(g => g.id === group.id);
    if (index !== -1) {
      groups[index] = group;
      await this.saveGroups(groups);
    }
  }

  async removeGroup(groupId: string): Promise<void> {
    const groups = await this.loadGroups();
    const filtered = groups.filter(g => g.id !== groupId);
    await this.saveGroups(filtered);
  }

  async addVirtual(virtual: VirtualDevice): Promise<void> {
    const virtuals = await this.loadVirtuals();
    virtuals.push(virtual);
    await this.saveVirtuals(virtuals);
  }

  async updateVirtual(virtual: VirtualDevice): Promise<void> {
    const virtuals = await this.loadVirtuals();
    const index = virtuals.findIndex(v => v.id === virtual.id);
    if (index !== -1) {
      virtuals[index] = virtual;
      await this.saveVirtuals(virtuals);
    }
  }

  async removeVirtual(virtualId: string): Promise<void> {
    const virtuals = await this.loadVirtuals();
    const filtered = virtuals.filter(v => v.id !== virtualId);
    await this.saveVirtuals(filtered);
  }

  async addPreset(preset: Preset): Promise<void> {
    const presets = await this.loadPresets();
    presets.push(preset);
    await this.savePresets(presets);
  }

  async updatePreset(preset: Preset): Promise<void> {
    const presets = await this.loadPresets();
    const index = presets.findIndex(p => p.id === preset.id);
    if (index !== -1) {
      presets[index] = preset;
      await this.savePresets(presets);
    }
  }

  async removePreset(presetId: string): Promise<void> {
    const presets = await this.loadPresets();
    const filtered = presets.filter(p => p.id !== presetId);
    await this.savePresets(filtered);
  }

  async addSchedule(schedule: Schedule): Promise<void> {
    const schedules = await this.loadSchedules();
    schedules.push(schedule);
    await this.saveSchedules(schedules);
  }

  async updateSchedule(schedule: Schedule): Promise<void> {
    const schedules = await this.loadSchedules();
    const index = schedules.findIndex(s => s.id === schedule.id);
    if (index !== -1) {
      schedules[index] = schedule;
      await this.saveSchedules(schedules);
    }
  }

  async removeSchedule(scheduleId: string): Promise<void> {
    const schedules = await this.loadSchedules();
    const filtered = schedules.filter(s => s.id !== scheduleId);
    await this.saveSchedules(filtered);
  }

  async loadLocationSettings(): Promise<LocationSettings> {
    try {
      await this.ensureDataDir();
      const data = await fs.readFile(this.getFilePath('location-settings'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveLocationSettings(settings: LocationSettings): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('location-settings'), JSON.stringify(settings, null, 2));
  }

  async loadPlaylists(): Promise<Playlist[]> {
    try {
      await this.ensureDataDir();
      const filePath = this.getFilePath('playlists');
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      console.error('Error loading playlists from storage:', error);
      return [];
    }
  }

  async savePlaylists(playlists: Playlist[]): Promise<void> {
    await this.ensureDataDir();
    const filePath = this.getFilePath('playlists');
    const jsonContent = JSON.stringify(playlists, null, 2);
    const tempPath = filePath + '.tmp';
    await fs.writeFile(tempPath, jsonContent + '\n', 'utf-8');
    await fs.rename(tempPath, filePath);
  }
}

export default JSONStorage;

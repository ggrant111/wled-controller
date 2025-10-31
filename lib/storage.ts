import fs from 'fs/promises';
import path from 'path';
import { WLEDDevice, Group, VirtualDevice, Preset, Schedule, LocationSettings } from '../types';

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
      const data = await fs.readFile(this.getFilePath('devices'), 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveDevices(devices: WLEDDevice[]): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(this.getFilePath('devices'), JSON.stringify(devices, null, 2));
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
}

export default JSONStorage;

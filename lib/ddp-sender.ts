import dgram from 'dgram';
import { DDPPacket, StreamFrame, WLEDDevice, LEDSegment } from '../types';

export class DDPSender {
  private socket: dgram.Socket;
  private devices: Map<string, WLEDDevice> = new Map();
  private frameCount: number = 0;

  // DDP Protocol Constants
  private readonly MAX_PIXELS = 480;
  private readonly MAX_DATALEN = this.MAX_PIXELS * 3; // 1440 bytes (RGB)

  constructor() {
    this.socket = dgram.createSocket('udp4');
  }

  addDevice(device: WLEDDevice): void {
    this.devices.set(device.id, device);
  }

  removeDevice(deviceId: string): void {
    this.devices.delete(deviceId);
  }

  updateDevice(device: WLEDDevice): void {
    this.devices.set(device.id, device);
  }

  private createDDPHeader(offset: number, length: number, isLast: boolean = true): Buffer {
    const header = Buffer.alloc(10);
    
    // DDP Header Format (LEDfx compatible):
    // Byte 0: Version and Push flag (VER1 | PUSH)
    // Byte 1: Sequence number (1-15, cycling)
    // Byte 2: Data type (DATATYPE_RGB = 0x0B)
    // Byte 3: Destination ID (1 = default)
    // Bytes 4-7: Data offset (4 bytes, big-endian)
    // Bytes 8-9: Data length (2 bytes, big-endian)
    
    const VER1 = 0x40; // Version 1
    const PUSH = 0x01;  // Push flag
    const DATATYPE = 0x0B; // RGB, 8-bit
    const DESTINATION_ID = 0x01; // Default destination
    
    // Byte 0: VER1 | PUSH (if last packet)
    header[0] = VER1 | (isLast ? PUSH : 0);
    
    // Byte 1: Sequence (cycling 1-15)
    header[1] = 1;
    
    // Byte 2: Data type (RGB)
    header[2] = DATATYPE;
    
    // Byte 3: Destination ID
    header[3] = DESTINATION_ID;
    
    // Bytes 4-7: Data offset (4 bytes big-endian)
    header.writeUInt32BE(offset, 4);
    
    // Bytes 8-9: Data length (2 bytes big-endian)
    header.writeUInt16BE(length, 8);
    
    return header;
  }

  private createRGBPayload(leds: Buffer): Buffer {
    return leds;
  }

  createDDPPacket(offset: number, rgbData: Buffer, isLast: boolean = true): DDPPacket {
    const header = this.createDDPHeader(offset, rgbData.length, isLast);
    const payload = this.createRGBPayload(rgbData);
    
    return {
      header,
      payload
    };
  }

  async sendFrame(frame: StreamFrame): Promise<void> {
    const device = this.devices.get(frame.target.id);
    if (!device) {
      console.warn(`Device ${frame.target.id} not found`);
      return;
    }

    const packet = this.createDDPPacket(0, frame.data);
    const fullPacket = Buffer.concat([packet.header, packet.payload]);

    return new Promise((resolve, reject) => {
      this.socket.send(fullPacket, device.port, device.ip, (error) => {
        if (error) {
          console.error(`Failed to send DDP packet to ${device.ip}:${device.port}`, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async sendToDevice(deviceId: string, rgbData: Buffer, offset: number = 0): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error(`Device ${deviceId} not found in DDP sender`);
      throw new Error(`Device ${deviceId} not found`);
    }

    console.log(`Sending DDP packet to ${device.name} (${device.ip}:${device.port}), data length: ${rgbData.length}`);
    
    // Chunk data if it exceeds MAX_DATALEN
    if (rgbData.length > this.MAX_DATALEN) {
      return this.sendChunkedData(device, rgbData, offset);
    } else {
      // Send as single packet
      const sequence = (this.frameCount % 15) + 1;
      this.frameCount++;
      
      const packet = this.createDDPPacket(offset, rgbData, true);
      const fullPacket = Buffer.concat([packet.header, packet.payload]);
      
      return new Promise((resolve, reject) => {
        this.socket.send(fullPacket, device.port, device.ip, (error) => {
          if (error) {
            console.error(`DDP send error to ${device.ip}:${device.port}:`, error);
            reject(error);
          } else {
            console.log(`DDP packet sent successfully to ${device.ip}:${device.port}`);
            resolve();
          }
        });
      });
    }
  }

  private async sendChunkedData(device: WLEDDevice, rgbData: Buffer, offset: number = 0): Promise<void> {
    const sequence = (this.frameCount % 15) + 1;
    this.frameCount++;
    
    const totalPackets = Math.ceil(rgbData.length / this.MAX_DATALEN);
    
    for (let i = 0; i < totalPackets; i++) {
      const chunkOffset = i * this.MAX_DATALEN;
      const chunkEnd = Math.min(chunkOffset + this.MAX_DATALEN, rgbData.length);
      const chunk = rgbData.slice(chunkOffset, chunkEnd);
      const isLast = i === totalPackets - 1;
      
      const packetHeader = this.createDDPHeader(
        offset + chunkOffset,
        chunk.length,
        isLast
      );
      
      // Update sequence number
      packetHeader[1] = sequence;
      
      const fullPacket = Buffer.concat([packetHeader, chunk]);
      
      await new Promise<void>((resolve, reject) => {
        this.socket.send(fullPacket, device.port, device.ip, (error) => {
          if (error) {
            console.error(`DDP chunk ${i + 1}/${totalPackets} send error to ${device.ip}:${device.port}:`, error);
            reject(error);
          } else {
            console.log(`DDP chunk ${i + 1}/${totalPackets} sent to ${device.ip}:${device.port}`);
            resolve();
          }
        });
      });
    }
    
    console.log(`Sent ${totalPackets} DDP packets to ${device.name} (${rgbData.length} bytes total)`);
  }

  async sendToSegment(deviceId: string, segmentId: string, rgbData: Buffer): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const segment = device.segments.find(s => s.id === segmentId);
    if (!segment) {
      throw new Error(`Segment ${segmentId} not found on device ${deviceId}`);
    }

    await this.sendToDevice(deviceId, rgbData, segment.start);
  }

  close(): void {
    this.socket.close();
  }
}

export default DDPSender;

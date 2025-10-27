'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Effect } from '../types';
import { useSocket } from '../hooks/useSocket';

interface LEDPreviewCanvasProps {
  effect: Effect | null;
  parameters: Map<string, any>;
  ledCount?: number;
  width?: number;
  height?: number;
}

export default function LEDPreviewCanvas({ 
  effect, 
  parameters, 
  ledCount = 100,
  width = 600,
  height = 100
}: LEDPreviewCanvasProps) {
  const { on, off } = useSocket();
  const [frameData, setFrameData] = useState<Uint8Array | null>(null);
  const simulationRef = useRef<{ intervalId: ReturnType<typeof setInterval> | null; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse base64 frame data from server
  const handleFrameData = useCallback((data: { targetId: string; data: string; ledCount: number }) => {
    try {
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      setFrameData(bytes);
    } catch (error) {
      console.error('Error parsing frame data:', error);
    }
  }, []);

  // Listen for frame data from server when streaming
  useEffect(() => {
    on('frame-data', handleFrameData);
    
    const handleStreamingStopped = () => {
      setFrameData(null);
    };
    
    on('streaming-stopped', handleStreamingStopped);
    on('streaming-stopped-all', handleStreamingStopped);
    
    return () => {
      off('frame-data', handleFrameData);
      off('streaming-stopped', handleStreamingStopped);
      off('streaming-stopped-all', handleStreamingStopped);
    };
  }, [on, off, handleFrameData]);

  // Update preview when frame data arrives
  useEffect(() => {
    if (!frameData || !containerRef.current) return;
    
    const container = containerRef.current;
    const currentLedCount = frameData.length / 3;
    
    // Update or create LED divs
    for (let i = 0; i < currentLedCount; i++) {
      let ledDiv = container.children[i] as HTMLElement;
      if (!ledDiv) {
        ledDiv = document.createElement('div');
        container.appendChild(ledDiv);
      }
      
      const r = frameData[i * 3];
      const g = frameData[i * 3 + 1];
      const b = frameData[i * 3 + 2];
      
      ledDiv.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      ledDiv.style.width = `${100 / currentLedCount}%`;
      ledDiv.style.height = '100%';
      ledDiv.style.display = 'inline-block';
      ledDiv.style.border = '1px solid rgba(255, 255, 255, 0.05)';
      ledDiv.style.boxSizing = 'border-box';
      ledDiv.style.float = 'left';
    }
    
    // Remove extra divs if ledCount changed
    while (container.children.length > currentLedCount) {
      container.removeChild(container.lastChild!);
    }
  }, [frameData, ledCount]);

  // Simulate effect locally when not receiving frame data
  useEffect(() => {
    if (frameData) return; // Don't simulate if we have real frame data

    if (!effect || !containerRef.current) return;

    // Reset time when effect or parameters change
    let time = 0;
    const frameTime = 0.016; // Match server's frame time (16ms per frame)
    const interval = 16; // 16ms interval = ~60fps rendering

    const simulateEffect = (): Uint8Array => {
      const buffer = new Uint8Array(ledCount * 3);
      
      if (effect.type === 'solid') {
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ff0000')];
        
        for (let i = 0; i < ledCount; i++) {
          const colorIndex = Math.floor((i / ledCount) * colorsArr.length) % colorsArr.length;
          const color = colorsArr[colorIndex];
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r;
          buffer[pixelIndex + 1] = color.g;
          buffer[pixelIndex + 2] = color.b;
        }
      } else if (effect.type === 'rainbow') {
        const speed = parameters.get('speed') || 0.1;
        const reverse = parameters.get('reverse') || false;
        const mirror = parameters.get('mirror') || false;
        
        for (let i = 0; i < ledCount; i++) {
          let effectiveI = i;
          
          if (mirror) {
            effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
          }
          
          if (reverse) {
            effectiveI = ledCount - 1 - effectiveI;
          }
          
          const hue = ((effectiveI / ledCount) * 360 + time * speed * 10) % 360;
          const color = hslToRgb(hue / 360, 1, 0.5);
          buffer[i * 3] = color.r;
          buffer[i * 3 + 1] = color.g;
          buffer[i * 3 + 2] = color.b;
        }
      } else if (effect.type === 'color-wipe') {
        const speed = parameters.get('speed') || 0.1;
        const reverse = parameters.get('reverse') || false;
        const mirror = parameters.get('mirror') || false;
        const colors = parameters.get('colors') || ['#ff0000', '#0000ff'];
        const colorsArr = colors.map((c: string) => parseColor(c));
        
        const totalCycleTime = ledCount * colorsArr.length;
        const cycleProgress = (time * speed * 100) % totalCycleTime;
        const currentColorIndex = Math.floor(cycleProgress / ledCount);
        const wipeProgress = cycleProgress % ledCount;
        const currentColor = colorsArr[currentColorIndex % colorsArr.length];
        const prevColor = colorsArr[(currentColorIndex - 1 + colorsArr.length) % colorsArr.length];
        
        for (let i = 0; i < ledCount; i++) {
          const pixelIndex = i * 3;
          buffer[pixelIndex] = prevColor.r;
          buffer[pixelIndex + 1] = prevColor.g;
          buffer[pixelIndex + 2] = prevColor.b;
        }
        
        for (let i = 0; i < ledCount; i++) {
          const pixelIndex = i * 3;
          let shouldOverwrite = false;
          
          if (mirror && reverse) {
            const center = ledCount / 2;
            const distance = Math.abs(i - center);
            const maxDistance = wipeProgress;
            shouldOverwrite = distance <= maxDistance;
          } else if (mirror && !reverse) {
            const distanceFromStart = i;
            const distanceFromEnd = ledCount - 1 - i;
            const minDistance = Math.min(distanceFromStart, distanceFromEnd);
            shouldOverwrite = minDistance < wipeProgress;
          } else if (!mirror && reverse) {
            shouldOverwrite = i >= (ledCount - wipeProgress);
          } else {
            shouldOverwrite = i <= wipeProgress;
          }
          
          if (shouldOverwrite) {
            buffer[pixelIndex] = currentColor.r;
            buffer[pixelIndex + 1] = currentColor.g;
            buffer[pixelIndex + 2] = currentColor.b;
          }
        }
      } else if (effect.type === 'comet') {
        const speed = parameters.get('speed') || 0.1;
        const length = parameters.get('length') || 20;
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ff0000')];
        const tail = parameters.get('tail') || 0.3;
        const mirror = parameters.get('mirror') || false;
        
        let position = (time * speed * ledCount * 10) % (ledCount * 2) - ledCount;
        const normalizedPosition = Math.max(0, position + ledCount);
        const colorIndex = Math.floor((normalizedPosition / (ledCount * 2)) * colorsArr.length) % colorsArr.length;
        const color = colorsArr[colorIndex] || colorsArr[0];
        
        for (let i = 0; i < ledCount; i++) {
          let effectiveI = i;
          
          if (mirror) {
            effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
            const center = ledCount / 2;
            position = (time * speed * ledCount * 10) % ledCount;
            const distance = Math.abs(effectiveI - center);
            const brightnessVal = Math.max(0, 1 - (distance / length));
            const pixelIndex = i * 3;
            buffer[pixelIndex] = color.r * brightnessVal;
            buffer[pixelIndex + 1] = color.g * brightnessVal;
            buffer[pixelIndex + 2] = color.b * brightnessVal;
          } else {
            const dist = Math.abs(i - position);
            const brightnessVal = Math.max(0, 1 - (dist / length));
            const pixelIndex = i * 3;
            buffer[pixelIndex] = color.r * brightnessVal;
            buffer[pixelIndex + 1] = color.g * brightnessVal;
            buffer[pixelIndex + 2] = color.b * brightnessVal;
          }
        }
      } else if (effect.type === 'chase') {
        const speed = parameters.get('speed') || 0.1;
        const length = parameters.get('length') || 5;
        const count = parameters.get('count') || 1;
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ff0000')];
        const colorMode = parameters.get('colorMode') || 'palette';
        const bgColor = parseColor(parameters.get('backgroundColor') || '#000000');
        const reverse = parameters.get('reverse') || false;
        const mirror = parameters.get('mirror') || false;
        
        let currentCycleColor;
        if (colorMode === 'cycle') {
          const cycleIndex = Math.floor((time * speed * 10) / 5) % colorsArr.length;
          currentCycleColor = colorsArr[cycleIndex];
        }
        
        for (let i = 0; i < ledCount; i++) {
          const pixelIndex = i * 3;
          buffer[pixelIndex] = bgColor.r;
          buffer[pixelIndex + 1] = bgColor.g;
          buffer[pixelIndex + 2] = bgColor.b;
        }
        
        for (let i = 0; i < ledCount; i++) {
          const pixelIndex = i * 3;
          let combinedBrightness = 0;
          let combinedR = 0;
          let combinedG = 0;
          let combinedB = 0;
          
          for (let c = 0; c < count; c++) {
            const segmentStart = (c * ledCount) / count;
            const segmentEnd = ((c + 1) * ledCount) / count;
            
            if (i >= segmentStart && i < segmentEnd) {
              const localPosition = i - segmentStart;
              const normalizedPos = localPosition / (segmentEnd - segmentStart);
              
              let effectiveTime = time * speed * 100;
              if (reverse) {
                effectiveTime = -effectiveTime;
              }
              
              const spacing = ledCount / count;
              const wavePos = (normalizedPos * (spacing * 2) + effectiveTime) % (spacing * 2);
              const distance = Math.abs(normalizedPos * spacing - wavePos);
              
              if (distance < length) {
                const intensity = 1 - (distance / length);
                combinedBrightness += intensity;
                
                let color;
                if (colorMode === 'cycle') {
                  color = currentCycleColor!;
                } else {
                  color = colorsArr[c % colorsArr.length];
                }
                
                combinedR += color.r * intensity;
                combinedG += color.g * intensity;
                combinedB += color.b * intensity;
              }
            }
          }
          
          if (combinedBrightness > 0) {
            buffer[pixelIndex] = Math.min(255, combinedR / combinedBrightness);
            buffer[pixelIndex + 1] = Math.min(255, combinedG / combinedBrightness);
            buffer[pixelIndex + 2] = Math.min(255, combinedB / combinedBrightness);
          }
        }
      } else if (effect.type === 'breathing') {
        const speed = parameters.get('speed') || 0.1;
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ff0000')];
        const minBrightness = parameters.get('minBrightness') || 0.1;
        
        const brightness = minBrightness + (Math.sin(time * speed * 10) + 1) / 2 * (1 - minBrightness);
        
        for (let i = 0; i < ledCount; i++) {
          const color = colorsArr[i % colorsArr.length];
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * brightness;
          buffer[pixelIndex + 1] = color.g * brightness;
          buffer[pixelIndex + 2] = color.b * brightness;
        }
      } else if (effect.type === 'wave') {
        const speed = parameters.get('speed') || 0.1;
        const frequency = parameters.get('frequency') || 0.05;
        const count = parameters.get('count') || 1;
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#00ff00')];
        const colorMode = parameters.get('colorMode') || 'palette';
        const reverse = parameters.get('reverse') || false;
        const mirror = parameters.get('mirror') || false;
        
        let currentCycleColor;
        if (colorMode === 'cycle') {
          const cycleIndex = Math.floor((time * speed * 10) / 5) % colorsArr.length;
          currentCycleColor = colorsArr[cycleIndex];
        }
        
        for (let i = 0; i < ledCount; i++) {
          let effectiveI = i;
          
          if (mirror) {
            effectiveI = i < ledCount / 2 ? i : ledCount - 1 - i;
          }
          
          if (reverse) {
            effectiveI = ledCount - 1 - effectiveI;
          }
          
          const waveVal = effectiveI * frequency * count + time * speed * 10;
          const wave = (Math.sin(waveVal) + 1) / 2;
          
          let color;
          if (colorMode === 'cycle') {
            color = currentCycleColor!;
          } else {
            const colorIndex = Math.floor(waveVal / (ledCount / count)) % colorsArr.length;
            color = colorsArr[colorIndex];
          }
          
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * wave;
          buffer[pixelIndex + 1] = color.g * wave;
          buffer[pixelIndex + 2] = color.b * wave;
        }
      } else if (effect.type === 'twinkle') {
        const density = parameters.get('density') || 0.1;
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ffffff')];
        
        for (let i = 0; i < ledCount; i++) {
          const sparkle = Math.random() < density ? Math.random() : 0;
          const color = colorsArr[i % colorsArr.length];
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * sparkle;
          buffer[pixelIndex + 1] = color.g * sparkle;
          buffer[pixelIndex + 2] = color.b * sparkle;
        }
      } else if (effect.type === 'fire') {
        for (let i = 0; i < ledCount; i++) {
          const brightness = Math.random() * 0.5 + 0.3;
          const heat = Math.random();
          const pixelIndex = i * 3;
          buffer[pixelIndex] = 255 * brightness;
          buffer[pixelIndex + 1] = (85 + Math.random() * 170) * brightness;
          buffer[pixelIndex + 2] = 0;
        }
      } else if (effect.type === 'matrix') {
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#00ff00')];
        const density = parameters.get('density') || 0.1;
        
        for (let i = 0; i < ledCount; i++) {
          const sparkle = Math.random() < density ? (0.5 + Math.random() * 0.5) : 0;
          const color = colorsArr[i % colorsArr.length];
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * sparkle;
          buffer[pixelIndex + 1] = color.g * sparkle;
          buffer[pixelIndex + 2] = color.b * sparkle;
        }
      } else if (effect.type === 'confetti') {
        for (let i = 0; i < ledCount; i++) {
          const hue = (time * 0.1 + i / ledCount) % 1;
          const sparkle = Math.random() * 0.7 + 0.3;
          const color = hslToRgb(hue, 1, 0.5);
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * sparkle;
          buffer[pixelIndex + 1] = color.g * sparkle;
          buffer[pixelIndex + 2] = color.b * sparkle;
        }
      } else if (effect.type === 'glitter') {
        const colors = parameters.get('colors');
        const colorsArr = Array.isArray(colors) && colors.length > 0 
          ? colors.map((c: string) => parseColor(c))
          : [parseColor('#ffffff')];
        const density = parameters.get('density') || 0.1;
        
        for (let i = 0; i < ledCount; i++) {
          const sparkle = Math.random() < density ? 1 : 0;
          const color = colorsArr[i % colorsArr.length];
          const pixelIndex = i * 3;
          buffer[pixelIndex] = color.r * sparkle;
          buffer[pixelIndex + 1] = color.g * sparkle;
          buffer[pixelIndex + 2] = color.b * sparkle;
        }
      } else {
        if (parameters.has('color')) {
          const color = parseColor(parameters.get('color') || '#ff0000');
          for (let i = 0; i < ledCount; i++) {
            const pixelIndex = i * 3;
            buffer[pixelIndex] = color.r;
            buffer[pixelIndex + 1] = color.g;
            buffer[pixelIndex + 2] = color.b;
          }
        } else {
          for (let i = 0; i < ledCount; i++) {
            const hue = ((i / ledCount) + time * 0.1) % 1;
            const color = hslToRgb(hue, 1, 0.5);
            buffer[i * 3] = color.r;
            buffer[i * 3 + 1] = color.g;
            buffer[i * 3 + 2] = color.b;
          }
        }
      }

      return buffer;
    };

    const updatePreview = () => {
      if (!containerRef.current) return;
      
      const buffer = simulateEffect();
      const container = containerRef.current;
      
      // Update or create LED divs
      for (let i = 0; i < ledCount; i++) {
        let ledDiv = container.children[i] as HTMLElement;
        if (!ledDiv) {
          ledDiv = document.createElement('div');
          container.appendChild(ledDiv);
        }
        
        const r = buffer[i * 3];
        const g = buffer[i * 3 + 1];
        const b = buffer[i * 3 + 2];
        
        ledDiv.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        ledDiv.style.width = `${100 / ledCount}%`;
        ledDiv.style.height = '100%';
        ledDiv.style.display = 'inline-block';
        ledDiv.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        ledDiv.style.boxSizing = 'border-box';
      }
      
      time += frameTime;
    };

    updatePreview();
    const intervalId = setInterval(updatePreview, interval);
    simulationRef.current = { intervalId, time };

    return () => {
      const intervalId = simulationRef.current?.intervalId;
      if (intervalId !== null && intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [effect, parameters, ledCount, frameData]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden"
      style={{ height: `${height}px`, background: '#000' }}
    >
      {!frameData && !effect && (
        <div className="flex items-center justify-center w-full text-white/50">
          No preview available
        </div>
      )}
    </div>
  );
}

// Helper function to parse color
function parseColor(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Helper function to convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

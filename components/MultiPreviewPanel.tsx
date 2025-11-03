'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import LEDPreviewCanvas from './LEDPreviewCanvas';
import { WLEDDevice, Group, VirtualDevice } from '../types';

interface PreviewTarget {
  targetId: string; // Unique ID for this preview (deviceId or deviceId:start-end)
  deviceId: string;
  deviceName: string;
  ledCount: number;
  segmentInfo?: {
    startLed: number;
    endLed: number;
    segmentId?: string;
  };
  targetType: 'device' | 'group-segment' | 'virtual-range';
  groupId?: string;
  groupName?: string;
  virtualId?: string;
  virtualName?: string;
}

interface MultiPreviewPanelProps {
  selectedTargets: string[]; // Array of target IDs (device IDs, group-*, virtual-*)
  devices: WLEDDevice[];
  groups: Group[];
  virtuals: VirtualDevice[];
  effect?: any;
  parameters?: Map<string, any>;
  layers?: any[];
  layerParameters?: Map<string, Map<string, any>>;
}

function MultiPreviewPanel({
  selectedTargets,
  devices,
  groups,
  virtuals,
  effect,
  parameters,
  layers,
  layerParameters
}: MultiPreviewPanelProps) {
  // Expand selected targets into individual preview targets
  const previewTargets = useMemo(() => {
    const targets: PreviewTarget[] = [];
    const seenTargetIds = new Set<string>();

    for (const targetId of selectedTargets) {
      if (targetId.startsWith('group-')) {
        // Expand group into member devices/segments
        const groupId = targetId.replace('group-', '');
        const group = groups.find(g => g.id === groupId);
        
        if (group && group.members) {
          for (const member of group.members) {
            const device = devices.find(d => d.id === member.deviceId);
            if (!device) continue;
            
            let previewTargetId: string;
            let ledCount: number;
            let segmentInfo: { startLed: number; endLed: number; segmentId?: string } | undefined;
            
            if (member.startLed !== undefined && member.endLed !== undefined) {
              // Segment
              ledCount = member.endLed - member.startLed + 1;
              previewTargetId = `${member.deviceId}:${member.startLed}-${member.endLed}`;
              segmentInfo = {
                startLed: member.startLed,
                endLed: member.endLed,
                segmentId: member.segmentId
              };
            } else {
              // Full device
              ledCount = device.ledCount;
              previewTargetId = member.deviceId;
            }
            
            // Avoid duplicates if same device/segment appears in multiple groups
            if (!seenTargetIds.has(previewTargetId)) {
              seenTargetIds.add(previewTargetId);
              targets.push({
                targetId: previewTargetId,
                deviceId: member.deviceId,
                deviceName: device.name,
                ledCount,
                segmentInfo,
                targetType: member.startLed !== undefined ? 'group-segment' : 'device',
                groupId: group.id,
                groupName: group.name
              });
            }
          }
        }
      } else if (targetId.startsWith('virtual-')) {
        // Expand virtual device into device ranges
        const virtualId = targetId.replace('virtual-', '');
        const virtual = virtuals.find(v => v.id === virtualId);
        
        if (virtual && virtual.ledRanges) {
          for (const range of virtual.ledRanges) {
            const device = devices.find(d => d.id === range.deviceId);
            if (!device) continue;
            
            const ledCount = range.endLed - range.startLed + 1;
            const previewTargetId = `${range.deviceId}:${range.startLed}-${range.endLed}`;
            
            // Avoid duplicates
            if (!seenTargetIds.has(previewTargetId)) {
              seenTargetIds.add(previewTargetId);
              targets.push({
                targetId: previewTargetId,
                deviceId: range.deviceId,
                deviceName: device.name,
                ledCount,
                segmentInfo: {
                  startLed: range.startLed,
                  endLed: range.endLed
                },
                targetType: 'virtual-range',
                virtualId: virtual.id,
                virtualName: virtual.name
              });
            }
          }
        }
      } else if (targetId.includes(':') && targetId.match(/:\d+-\d+$/)) {
        // Segment ID format: device-id:start-end
        // Parse the segment ID
        const [deviceId, range] = targetId.split(':');
        const [startLed, endLed] = range.split('-').map(Number);
        const device = devices.find(d => d.id === deviceId);
        
        if (device && !seenTargetIds.has(targetId)) {
          seenTargetIds.add(targetId);
          targets.push({
            targetId: targetId,
            deviceId: device.id,
            deviceName: device.name,
            ledCount: endLed - startLed + 1,
            segmentInfo: {
              startLed,
              endLed
            },
            targetType: 'device'
          });
        }
      } else {
        // Direct device target
        const device = devices.find(d => d.id === targetId);
        if (device && !seenTargetIds.has(targetId)) {
          seenTargetIds.add(targetId);
          targets.push({
            targetId: targetId,
            deviceId: device.id,
            deviceName: device.name,
            ledCount: device.ledCount,
            targetType: 'device'
          });
        }
      }
    }
    
    return targets;
  }, [selectedTargets, devices, groups, virtuals]);

  if (previewTargets.length === 0) {
    return null;
  }

  const getPreviewTitle = (target: PreviewTarget) => {
    if (target.segmentInfo) {
      const segmentLabel = target.segmentInfo.segmentId ? 'Segment' : 'LEDs';
      return `${target.deviceName} (${segmentLabel} ${target.segmentInfo.startLed}-${target.segmentInfo.endLed})`;
    }
    
    let prefix = '';
    if (target.groupName) {
      prefix = `${target.groupName} → `;
    } else if (target.virtualName) {
      prefix = `${target.virtualName} → `;
    }
    
    return `${prefix}${target.deviceName}`;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold">Live Preview</h3>
      <div className="space-y-4">
        {previewTargets.map((target) => (
          <motion.div
            key={target.targetId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-4"
          >
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-300">{getPreviewTitle(target)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{target.ledCount} LEDs</p>
            </div>
            <LEDPreviewCanvas
              effect={effect}
              parameters={parameters}
              layers={layers}
              layerParameters={layerParameters}
              ledCount={target.ledCount}
              width={800}
              height={80}
              onlyTargetId={target.targetId}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(MultiPreviewPanel);


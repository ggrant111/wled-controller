'use client';

import React from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { StreamingSession, WLEDDevice, Group, VirtualDevice } from '../types';
import { useToast } from './ToastProvider';
import { useModal } from './ModalProvider';
import MultiPreviewPanel from './MultiPreviewPanel';

interface StreamSessionExpandedTargetsProps {
  session: StreamingSession;
  devices: WLEDDevice[];
  groups: Group[];
  virtuals: VirtualDevice[];
  onRefresh: () => void;
}

interface ExpandedTarget {
  id: string; // Unique identifier for this target
  deviceId: string;
  deviceName: string;
  ledCount: number;
  segmentInfo?: {
    startLed: number;
    endLed: number;
    segmentId?: string;
  };
  targetType: 'device' | 'group-segment' | 'group-device' | 'virtual-range';
  parentTargetType: 'device' | 'group' | 'virtual';
  parentTargetId: string;
  parentTargetName: string;
  isExcluded?: boolean;
}

function StreamSessionExpandedTargets({
  session,
  devices,
  groups,
  virtuals,
  onRefresh
}: StreamSessionExpandedTargetsProps) {
  const { showToast } = useToast();
  const { showConfirm } = useModal();
  const [showPreview, setShowPreview] = React.useState(false);

  // Expand targets into individual devices/segments
  const expandedTargets = React.useMemo(() => {
    const targets: ExpandedTarget[] = [];
    const excludedDevices = session.excludedDevices || [];
    const sessionTargets = session.targets || [];
    
    console.log('Expanding targets:', {
      sessionId: session.id,
      targetsCount: sessionTargets.length,
      targets: sessionTargets,
      devicesCount: devices.length,
      groupsCount: groups.length,
      virtualsCount: virtuals.length
    });
    
    for (const target of sessionTargets) {
      if (target.type === 'device') {
        const device = devices.find(d => d.id === target.id);
        if (device) {
          targets.push({
            id: device.id,
            deviceId: device.id,
            deviceName: device.name,
            ledCount: device.ledCount,
            targetType: 'device',
            parentTargetType: 'device',
            parentTargetId: target.id,
            parentTargetName: device.name,
            isExcluded: excludedDevices.includes(device.id)
          });
        } else {
          console.warn('Device not found for target:', target.id);
        }
      } else if (target.type === 'group') {
        const group = groups.find(g => g.id === target.id);
        console.log('Processing group target:', {
          targetId: target.id,
          groupFound: !!group,
          groupMembers: group?.members?.length || 0
        });
        
        if (!group) {
          console.warn('Group not found for target:', target.id, 'Available groups:', groups.map(g => g.id));
          continue;
        }
        
        if (group.members && group.members.length > 0) {
          for (const member of group.members) {
            // Skip if this device is excluded
            if (excludedDevices.includes(member.deviceId)) {
              console.log('Skipping excluded device:', member.deviceId);
              continue;
            }
            
            const device = devices.find(d => d.id === member.deviceId);
            if (!device) {
              console.warn('Device not found for group member:', member.deviceId);
              continue;
            }
            
            if (member.startLed !== undefined && member.endLed !== undefined) {
              // Segment
              const targetId = `${member.deviceId}:${member.startLed}-${member.endLed}`;
              targets.push({
                id: targetId,
                deviceId: member.deviceId,
                deviceName: device.name,
                ledCount: member.endLed - member.startLed + 1,
                segmentInfo: {
                  startLed: member.startLed,
                  endLed: member.endLed,
                  segmentId: member.segmentId
                },
                targetType: 'group-segment',
                parentTargetType: 'group',
                parentTargetId: group.id,
                parentTargetName: group.name
              });
            } else {
              // Full device in group
              targets.push({
                id: member.deviceId,
                deviceId: member.deviceId,
                deviceName: device.name,
                ledCount: device.ledCount,
                targetType: 'group-device',
                parentTargetType: 'group',
                parentTargetId: group.id,
                parentTargetName: group.name
              });
            }
          }
        } else {
          console.warn('Group has no members:', group.id, group.name);
        }
      } else if (target.type === 'virtual') {
        const virtual = virtuals.find(v => v.id === target.id);
        if (!virtual) {
          console.warn('Virtual not found for target:', target.id);
          continue;
        }
        
        if (virtual.ledRanges && virtual.ledRanges.length > 0) {
          for (const range of virtual.ledRanges) {
            // Skip if this device is excluded
            if (excludedDevices.includes(range.deviceId)) {
              continue;
            }
            
            const device = devices.find(d => d.id === range.deviceId);
            if (!device) continue;
            
            const targetId = `${range.deviceId}:${range.startLed}-${range.endLed}`;
            targets.push({
              id: targetId,
              deviceId: range.deviceId,
              deviceName: device.name,
              ledCount: range.endLed - range.startLed + 1,
              segmentInfo: {
                startLed: range.startLed,
                endLed: range.endLed
              },
              targetType: 'virtual-range',
              parentTargetType: 'virtual',
              parentTargetId: virtual.id,
              parentTargetName: virtual.name
            });
          }
        }
      }
    }
    
    console.log('Expanded targets result:', {
      count: targets.length,
      targets: targets.map(t => ({ id: t.id, deviceName: t.deviceName, type: t.targetType }))
    });
    
    return targets;
  }, [
    session.targets,
    session.excludedDevices,
    session.id,
    devices, 
    groups, 
    virtuals
  ]);

  const handleStopTarget = async (target: ExpandedTarget) => {
    showConfirm({
      message: `Stop streaming to ${target.deviceName}${target.segmentInfo ? ` (LEDs ${target.segmentInfo.startLed}-${target.segmentInfo.endLed})` : ''}?`,
      title: 'Stop Stream Target',
      variant: 'warning',
      confirmText: 'Stop',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          let response;
          
          if (target.targetType === 'device') {
            // Stop entire device
            response = await fetch('/api/stream/exclude-device', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: session.id,
                deviceId: target.deviceId
              })
            });
          } else if (target.segmentInfo) {
            // Stop specific segment/range
            response = await fetch('/api/stream/exclude-segment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: session.id,
                deviceId: target.deviceId,
                startLed: target.segmentInfo.startLed,
                endLed: target.segmentInfo.endLed
              })
            });
          } else {
            // Stop device from group/virtual
            response = await fetch('/api/stream/exclude-device', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: session.id,
                deviceId: target.deviceId
              })
            });
          }
          
          if (response?.ok) {
            showToast(`Stopped streaming to ${target.deviceName}`, 'success');
            onRefresh();
          } else {
            const error = await response?.json();
            throw new Error(error?.error || 'Failed to stop target');
          }
        } catch (error: any) {
          console.error('Error stopping target:', error);
          showToast(error.message || 'Failed to stop target', 'error');
        }
      }
    });
  };

  const getTargetLabel = React.useCallback((target: ExpandedTarget): string => {
    if (target.segmentInfo) {
      return `${target.deviceName} (LEDs ${target.segmentInfo.startLed}-${target.segmentInfo.endLed})`;
    }
    return target.deviceName;
  }, []);

  // Create selected targets array for preview
  // Use stable array reference to prevent infinite loops
  // NOTE: Must be called before any conditional returns (Rules of Hooks)
  const previewTargets = React.useMemo(() => {
    const targets: string[] = [];
    for (const t of expandedTargets) {
      if (t.segmentInfo) {
        targets.push(`${t.deviceId}:${t.segmentInfo.startLed}-${t.segmentInfo.endLed}`);
      } else {
        targets.push(t.deviceId);
      }
    }
    return targets;
  }, [expandedTargets]);

  // Convert session layers to layerParameters format for MultiPreviewPanel
  // NOTE: Must be called before any conditional returns (Rules of Hooks)
  const layerParameters = React.useMemo(() => {
    if (!session.layers || session.layers.length === 0) {
      return new Map<string, Map<string, any>>();
    }
    
    const paramsMap = new Map<string, Map<string, any>>();
    session.layers.forEach(layer => {
      const key = `${layer.id}-${layer.effect?.id}`;
      const layerParams = new Map<string, any>();
      
      if (layer.effect?.parameters) {
        layer.effect.parameters.forEach(param => {
          layerParams.set(param.name, param.value);
        });
      }
      
      paramsMap.set(key, layerParams);
    });
    
    return paramsMap;
  }, [session.layers]);

  // Show different messages based on why there are no expanded targets
  // This must come AFTER all hooks (Rules of Hooks)
  if (expandedTargets.length === 0) {
    const hasTargets = session.targets && session.targets.length > 0;
    const hasGroups = groups.length > 0;
    const hasDevices = devices.length > 0;
    const allExcluded = session.excludedDevices && session.excludedDevices.length > 0 && session.targets?.some(t => t.type === 'device');
    
    let message = 'No devices found for this stream.';
    if (allExcluded) {
      message = 'All targets have been excluded from this stream.';
    } else if (!hasTargets) {
      message = 'No targets configured for this stream session.';
    } else if (!hasGroups && session.targets?.some(t => t.type === 'group')) {
      message = 'Group data not loaded yet. Please wait...';
    } else if (!hasDevices) {
      message = 'Device data not loaded yet. Please wait...';
    }
    
    return (
      <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-sm text-yellow-400">{message}</p>
        <p className="text-xs text-yellow-500/70 mt-1">
          Debug: {session.targets?.length || 0} targets, {groups.length} groups, {devices.length} devices loaded
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300 mb-1">
            Streaming to {expandedTargets.length} device{expandedTargets.length !== 1 ? 's' : ''}/segment{expandedTargets.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-500">Click stop to exclude individual targets from this stream</p>
        </div>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {showPreview ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Show Preview
            </>
          )}
        </button>
      </div>

      {showPreview && previewTargets.length > 0 && (
        <div className="mt-4">
          <MultiPreviewPanel
            selectedTargets={previewTargets}
            devices={devices}
            groups={groups}
            virtuals={virtuals}
            effect={session.effect}
            layers={session.layers}
            layerParameters={layerParameters}
          />
        </div>
      )}

      <div className="space-y-2">
        {expandedTargets.map((target) => (
          <div
            key={target.id}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{getTargetLabel(target)}</p>
                {target.parentTargetType !== 'device' && (
                  <span className="text-xs text-white/50">
                    ({target.parentTargetName})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-white/50">{target.ledCount} LEDs</span>
                <span className="text-xs px-2 py-0.5 rounded bg-primary-500/20 text-primary-400">
                  {target.targetType === 'device' && 'Device'}
                  {target.targetType === 'group-device' && 'Group Device'}
                  {target.targetType === 'group-segment' && 'Group Segment'}
                  {target.targetType === 'virtual-range' && 'Virtual Range'}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleStopTarget(target)}
              className="ml-4 p-2 hover:bg-red-500/20 text-red-400 rounded transition-colors"
              title={`Stop streaming to ${getTargetLabel(target)}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StreamSessionExpandedTargets;


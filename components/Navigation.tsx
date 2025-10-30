'use client';

import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Zap, Cpu, Settings, Play, Pause, Save } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useStreaming } from '../contexts/StreamingContext';

export default function Navigation() {
  const pathname = usePathname();
  const { isStreaming, setIsStreaming, setStreamingSessionId, lastStreamConfig } = useStreaming();
  const [activeStreams, setActiveStreams] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/stream/sessions');
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) setActiveStreams(data.count || 0);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 3000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const handleStartStopStreaming = async () => {
    try {
      if (isStreaming) {
        // Stop all streaming
        await fetch('/api/stream/stop-all', { method: 'POST' });
        setIsStreaming(false);
      } else {
        // Start streaming with last configuration if available
        if (lastStreamConfig) {
          try {
            setIsStreaming(true);
            const response = await fetch('/api/stream/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targets: lastStreamConfig.targets,
                effect: lastStreamConfig.effect,
                fps: lastStreamConfig.fps || 30,
                blendMode: lastStreamConfig.blendMode || 'overwrite'
              })
            });

            if (!response.ok) {
              throw new Error('Failed to start streaming');
            }

            const session = await response.json();
            console.log('Streaming restarted:', session);
            setStreamingSessionId(session.id);
          } catch (error) {
            console.error('Error restarting streaming:', error);
            setIsStreaming(false);
            alert('Failed to restart streaming. Please configure from the Effects page.');
          }
        } else {
          // No last configuration - navigate to effects page or show message
          if (pathname !== '/effects') {
            window.location.href = '/effects';
          } else {
            alert('Please configure and start streaming first.');
          }
        }
      }
    } catch (error) {
      console.error('Error toggling streaming:', error);
      setIsStreaming(false);
    }
  };

  const navItems = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/devices', icon: Cpu, label: 'Devices' },
    { href: '/effects', icon: Zap, label: 'Effects' },
    { href: '/presets', icon: Save, label: 'Presets' },
    { href: '/schedule', icon: Settings, label: 'Schedule' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="glass-card sticky top-0 z-40 mb-6">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-xl font-bold hover:text-primary-500 transition-colors">
            <Zap className="h-6 w-6 text-primary-500" />
            <span className="hidden sm:inline">WLED Controller</span>
            <span className="sm:hidden">WLED</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary-500/20 text-primary-500'
                      : 'hover:bg-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            {/* Streaming Control */}
            <div className="h-8 w-px bg-white/20 mx-2"></div>
            <button
              onClick={handleStartStopStreaming}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isStreaming
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              }`}
            >
              {isStreaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="hidden lg:inline">{isStreaming ? 'Stop' : 'Start'} All</span>
              {activeStreams > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center">
                  {activeStreams}
                </span>
              )}
            </button>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-500/20 text-primary-500'
                      : 'hover:bg-white/10 text-white/70'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            {/* Mobile Streaming Control */}
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            <button
              onClick={handleStartStopStreaming}
              className={`relative flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-all whitespace-nowrap ${
                isStreaming
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-green-500/20 text-green-400'
              }`}
            >
              {isStreaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="text-xs">{isStreaming ? 'Stop' : 'Start'}</span>
              {activeStreams > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] h-4 px-1 rounded-full bg-primary-500 text-white text-[10px] leading-none flex items-center justify-center">
                  {activeStreams}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}


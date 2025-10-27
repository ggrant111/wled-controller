'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

interface LastStreamConfig {
  targets: any[];
  effect: any;
  fps?: number;
  blendMode?: string;
  selectedTargets?: string[];
}

interface StreamingContextType {
  isStreaming: boolean;
  setIsStreaming: (value: boolean) => void;
  streamingSessionId: string | null;
  setStreamingSessionId: (id: string | null) => void;
  lastStreamConfig: LastStreamConfig | null;
  setLastStreamConfig: (config: LastStreamConfig | null) => void;
  currentSession: any;
  selectedTargets: string[];
  setSelectedTargets: (targets: string[]) => void;
}

const StreamingContext = createContext<StreamingContextType | undefined>(undefined);

export function StreamingProvider({ children }: { children: React.ReactNode }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [lastStreamConfig, setLastStreamConfig] = useState<LastStreamConfig | null>(null);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  // Fetch streaming state from server on mount
  useEffect(() => {
    fetch('/api/stream/state')
      .then(res => res.json())
      .then(data => {
        if (data.hasActiveSession) {
          setIsStreaming(true);
          setStreamingSessionId(data.session.id);
          setCurrentSession(data.session);
          // Only set selectedTargets if they exist in the session
          if (data.session.selectedTargets) {
            setSelectedTargets(data.session.selectedTargets);
          }
          setLastStreamConfig({
            targets: data.session.targets,
            effect: data.session.effect,
            fps: data.session.fps,
            blendMode: data.session.blendMode,
            selectedTargets: data.session.selectedTargets || []
          });
        }
      })
      .catch(err => console.error('Failed to fetch streaming state:', err));
  }, []);

  return <SocketListener setIsStreaming={setIsStreaming} setStreamingSessionId={setStreamingSessionId} setCurrentSession={setCurrentSession} setLastStreamConfig={setLastStreamConfig} setSelectedTargets={setSelectedTargets}>
    <StreamingContext.Provider value={{
      isStreaming,
      setIsStreaming,
      streamingSessionId,
      setStreamingSessionId,
      lastStreamConfig,
      setLastStreamConfig,
      currentSession,
      selectedTargets,
      setSelectedTargets
    }}>
      {children}
    </StreamingContext.Provider>
  </SocketListener>;
}

function SocketListener({ children, setIsStreaming, setStreamingSessionId, setCurrentSession, setLastStreamConfig, setSelectedTargets }: { 
  children: React.ReactNode;
  setIsStreaming: (value: boolean) => void;
  setStreamingSessionId: (id: string | null) => void;
  setCurrentSession: (session: any) => void;
  setLastStreamConfig: (config: LastStreamConfig | null) => void;
  setSelectedTargets: (targets: string[]) => void;
}) {
  const { on } = useSocket();

  // Listen for Socket.IO events
  useEffect(() => {
    const handleStreamingStarted = (session: any) => {
      setIsStreaming(true);
      setStreamingSessionId(session.id);
      setCurrentSession(session);
      // Only update selectedTargets if the session has them explicitly set
      if (session.selectedTargets) {
        setSelectedTargets(session.selectedTargets);
      }
      setLastStreamConfig({
        targets: session.targets,
        effect: session.effect,
        fps: session.fps,
        blendMode: session.blendMode,
        selectedTargets: session.selectedTargets || []
      });
    };

    const handleStreamingSessionUpdated = (session: any) => {
      // Update session without resetting streaming state
      setCurrentSession(session);
      setLastStreamConfig({
        targets: session.targets,
        effect: session.effect,
        fps: session.fps,
        blendMode: session.blendMode,
        selectedTargets: session.selectedTargets || []
      });
    };

    const handleStreamingStopped = () => {
      setIsStreaming(false);
      setStreamingSessionId(null);
      setCurrentSession(null);
      setLastStreamConfig(null);
    };

    const handleStreamingStoppedAll = () => {
      setIsStreaming(false);
      setStreamingSessionId(null);
      setCurrentSession(null);
      setLastStreamConfig(null);
    };

    const handleStreamingStateChanged = (data: any) => {
      if (data.isStreaming) {
        setIsStreaming(true);
        setStreamingSessionId(data.session?.id || null);
        setCurrentSession(data.session);
        // Only update selectedTargets if the session has them explicitly set
        if (data.session?.selectedTargets) {
          setSelectedTargets(data.session.selectedTargets);
        }
      } else {
        setIsStreaming(false);
        setStreamingSessionId(null);
        setCurrentSession(null);
      }
    };

    on('streaming-started', handleStreamingStarted);
    on('streaming-session-updated', handleStreamingSessionUpdated);
    on('streaming-stopped', handleStreamingStopped);
    on('streaming-stopped-all', handleStreamingStoppedAll);
    on('streaming-state-changed', handleStreamingStateChanged);

    return () => {
      // Cleanup would be handled by the socket hook
    };
  }, [on, setIsStreaming, setStreamingSessionId, setCurrentSession, setLastStreamConfig, setSelectedTargets]);

  return <>{children}</>;
}

export function useStreaming() {
  const context = useContext(StreamingContext);
  if (!context) {
    throw new Error('useStreaming must be used within StreamingProvider');
  }
  return context;
}


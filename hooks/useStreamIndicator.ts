'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';

export function useStreamIndicator(targetId: string, timeoutMs: number = 1500) {
  const { on, off } = useSocket();
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = (data: { targetId: string }) => {
      if (data.targetId !== targetId) return;
      setActive(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(false), timeoutMs);
    };

    on('frame-data', handle);
    return () => {
      off('frame-data', handle);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [on, off, targetId, timeoutMs]);

  return active;
}



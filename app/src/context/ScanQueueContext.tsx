/**
 * ScanQueueContext — Shared state for the device scan queue.
 *
 * Used by AdvancedScanScreen (adds devices), DeviceQueueScreen (reviews/processes),
 * and ScanConfirmScreen (consumes during batch confirm flow).
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { QueuedDevice } from '../utils/scannerTypes';

interface ScanQueueContextType {
  queue: QueuedDevice[];
  addToQueue: (device: QueuedDevice) => void;
  removeFromQueue: (id: string) => void;
  updateInQueue: (id: string, updates: Partial<QueuedDevice>) => void;
  clearQueue: () => void;
  /** Index of the device currently being processed in batch confirm flow. -1 if not active. */
  processingIndex: number;
  setProcessingIndex: (index: number) => void;
}

const ScanQueueContext = createContext<ScanQueueContextType | null>(null);

export function ScanQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedDevice[]>([]);
  const [processingIndex, setProcessingIndex] = useState(-1);

  const addToQueue = useCallback((device: QueuedDevice) => {
    setQueue((prev) => [...prev, device]);
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const updateInQueue = useCallback((id: string, updates: Partial<QueuedDevice>) => {
    setQueue((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setProcessingIndex(-1);
  }, []);

  return (
    <ScanQueueContext.Provider
      value={{
        queue,
        addToQueue,
        removeFromQueue,
        updateInQueue,
        clearQueue,
        processingIndex,
        setProcessingIndex,
      }}
    >
      {children}
    </ScanQueueContext.Provider>
  );
}

export function useScanQueue(): ScanQueueContextType {
  const ctx = useContext(ScanQueueContext);
  if (!ctx) throw new Error('useScanQueue must be used within ScanQueueProvider');
  return ctx;
}

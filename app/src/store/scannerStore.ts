import { create } from 'zustand';
import { ScannerState, TrackedObject, ProductInfo } from '../utils/scannerTypes';

interface ScannerStore {
  state: ScannerState;
  trackedObjects: TrackedObject[];
  confirmedProducts: TrackedObject[];
  pendingConfirmation: TrackedObject | null;
  currentRoom: string;

  setState: (state: ScannerState) => void;
  updateTrackedObjects: (objects: TrackedObject[]) => void;
  markIdentificationAttempted: (trackId: string) => void;
  setPendingConfirmation: (object: TrackedObject) => void;
  confirmProduct: (productInfo: ProductInfo) => void;
  dismissProduct: () => void;
  setCurrentRoom: (room: string) => void;
  clearScan: () => void;
}

export const useScannerStore = create<ScannerStore>((set, get) => ({
  state: 'idle',
  trackedObjects: [],
  confirmedProducts: [],
  pendingConfirmation: null,
  currentRoom: 'Living Room',

  setState: (state) => set({ state }),

  updateTrackedObjects: (objects) => set({ trackedObjects: objects }),

  markIdentificationAttempted: (trackId) =>
    set((s) => ({
      trackedObjects: s.trackedObjects.map((obj) =>
        obj.id === trackId ? { ...obj, identificationAttempted: true } : obj
      ),
    })),

  setPendingConfirmation: (object) => {
    // Don't overwrite if user is already reviewing a product
    if (get().pendingConfirmation) return;
    set({ pendingConfirmation: object, state: 'confirming' });
  },

  confirmProduct: (productInfo) => {
    const { pendingConfirmation } = get();
    if (!pendingConfirmation) return;

    const confirmed: TrackedObject = {
      ...pendingConfirmation,
      productInfo: { ...productInfo, confirmed: true },
    };

    set((s) => ({
      pendingConfirmation: null,
      state: 'scanning',
      confirmedProducts: [...s.confirmedProducts, confirmed],
      trackedObjects: s.trackedObjects.map((obj) =>
        obj.id === confirmed.id
          ? { ...obj, productInfo: { ...productInfo, confirmed: true } }
          : obj
      ),
    }));
  },

  dismissProduct: () =>
    set({ pendingConfirmation: null, state: 'scanning' }),

  setCurrentRoom: (room) => set({ currentRoom: room }),

  clearScan: () =>
    set({
      state: 'idle',
      trackedObjects: [],
      confirmedProducts: [],
      pendingConfirmation: null,
    }),
}));

import { create } from 'zustand';
import { ScannerState, TrackedObject, ProductInfo, PowerProfileData } from '../utils/scannerTypes';
import { fetchPowerProfile, saveScan } from '../services/apiClient';

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
  updateProductPowerProfile: (trackId: string, profile: PowerProfileData, scanId?: string) => void;
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

    // Fire backend calls in the background (non-blocking)
    const brand = productInfo.lookup?.brand || productInfo.brand || 'Generic';
    const model = productInfo.lookup?.model || productInfo.model || 'unknown';
    const name = productInfo.displayName || 'Unknown Appliance';

    // 1. Fetch power profile from backend
    fetchPowerProfile(brand, model, name)
      .then((res) => {
        get().updateProductPowerProfile(confirmed.id, res.profile);
      })
      .catch((err) => console.warn('[api] Power profile fetch failed:', err));

    // 2. Save scan to backend DB
    saveScan({
      userId: 'default_user',
      imageUrl: confirmed.croppedImageUri || 'no-image',
      label: name,
      confidence: confirmed.score,
    })
      .then((res) => {
        console.log('[api] Scan saved:', res.insertedId);
      })
      .catch((err) => console.warn('[api] Scan save failed:', err));
  },

  updateProductPowerProfile: (trackId, profile, scanId) =>
    set((s) => ({
      confirmedProducts: s.confirmedProducts.map((obj) =>
        obj.id === trackId
          ? {
              ...obj,
              productInfo: obj.productInfo
                ? { ...obj.productInfo, powerProfile: profile, backendScanId: scanId }
                : undefined,
            }
          : obj
      ),
    })),

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

import { useCallback, useRef } from 'react';
import { useOCR, OCR_ENGLISH } from 'react-native-executorch';
import { TrackedObject, ProductInfo } from '../utils/scannerTypes';
import { parseProductInfo, identificationConfidence } from '../utils/ocrParser';
import { getCategory, getDisplayName } from '../utils/applianceClasses';
import { cropToBoundingBox } from '../services/imageProcessingService';
import { lookupAppliance } from '../services/productLookupService';
import { useScannerStore } from '../store/scannerStore';

// Default image dimensions for the SSD model input
const MODEL_IMG_WIDTH = 320;
const MODEL_IMG_HEIGHT = 320;

interface ProductIdentifierResult {
  identify: (photoUri: string, trackedObject: TrackedObject) => Promise<void>;
  isReady: boolean;
}

export function useProductIdentifier(): ProductIdentifierResult {
  const ocr = useOCR({ model: OCR_ENGLISH });
  const processingIds = useRef(new Set<string>());

  const { markIdentificationAttempted, setPendingConfirmation } = useScannerStore();

  const identify = useCallback(
    async (photoUri: string, trackedObject: TrackedObject) => {
      // Prevent duplicate processing
      if (processingIds.current.has(trackedObject.id)) return;
      processingIds.current.add(trackedObject.id);

      try {
        markIdentificationAttempted(trackedObject.id);

        // Crop the detected region from the photo
        const croppedUri = await cropToBoundingBox(
          photoUri,
          trackedObject.bbox,
          MODEL_IMG_WIDTH,
          MODEL_IMG_HEIGHT,
          0.15 // 15% padding for label context
        );

        // Run OCR on the cropped image
        let ocrTexts: string[] = [];
        if (ocr.isReady) {
          const ocrResults = await ocr.forward(croppedUri);
          ocrTexts = ocrResults.map((r) => r.text);
        }

        // Parse brand/model from OCR text
        const parsed = parseProductInfo(ocrTexts);
        const confidence = identificationConfidence(parsed);
        const category = getCategory(trackedObject.label);

        // Look up product
        const lookup = lookupAppliance(parsed, category);

        const productInfo: ProductInfo = {
          brand: lookup?.brand || parsed.brand || 'Unknown',
          model: lookup?.model || parsed.model || '',
          displayName:
            lookup?.name ||
            (parsed.brand && parsed.model
              ? `${parsed.brand} ${parsed.model}`
              : getDisplayName(trackedObject.label)),
          confirmed: false,
          wattage: parsed.wattage,
          lookup: lookup || undefined,
        };

        // Queue for user confirmation
        setPendingConfirmation({
          ...trackedObject,
          productInfo,
          croppedImageUri: croppedUri,
          identificationAttempted: true,
        });
      } finally {
        processingIds.current.delete(trackedObject.id);
      }
    },
    [ocr.isReady, ocr.forward, markIdentificationAttempted, setPendingConfirmation]
  );

  return {
    identify,
    isReady: ocr.isReady,
  };
}

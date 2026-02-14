import { Platform } from 'react-native';
import { BBox } from '../utils/scannerTypes';
import { padBBox } from '../utils/bboxUtils';

/**
 * Crop an image to the region defined by a bounding box.
 * Uses expo-image-manipulator on native, canvas API on web.
 */
export async function cropToBoundingBox(
  imageUri: string,
  bbox: BBox,
  imageWidth: number,
  imageHeight: number,
  padding: number = 0.1
): Promise<string> {
  const padded = padBBox(bbox, padding, imageWidth, imageHeight);
  const cropX = padded.x1;
  const cropY = padded.y1;
  const cropW = padded.x2 - padded.x1;
  const cropH = padded.y2 - padded.y1;

  if (Platform.OS === 'web') {
    return cropOnWeb(imageUri, cropX, cropY, cropW, cropH);
  }

  return cropOnNative(imageUri, cropX, cropY, cropW, cropH);
}

async function cropOnNative(
  imageUri: string,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<string> {
  const ImageManipulator = await import('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop: { originX: x, originY: y, width: w, height: h } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

async function cropOnWeb(
  imageUri: string,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<string> {
  const img = await loadImage(imageUri);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob failed'));
        resolve(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.8
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

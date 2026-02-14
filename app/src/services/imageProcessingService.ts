import * as ImageManipulator from 'expo-image-manipulator';
import { BBox } from '../utils/scannerTypes';
import { padBBox } from '../utils/bboxUtils';

/**
 * Crop an image to the region defined by a bounding box.
 * Adds configurable padding around the bbox for better OCR context.
 */
export async function cropToBoundingBox(
  imageUri: string,
  bbox: BBox,
  imageWidth: number,
  imageHeight: number,
  padding: number = 0.1
): Promise<string> {
  const padded = padBBox(bbox, padding, imageWidth, imageHeight);

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: padded.x1,
          originY: padded.y1,
          width: padded.x2 - padded.x1,
          height: padded.y2 - padded.y1,
        },
      },
    ],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  return result.uri;
}

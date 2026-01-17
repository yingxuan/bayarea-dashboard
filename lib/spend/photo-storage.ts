import { put } from '@vercel/blob';
import { PHOTO_VERSION } from './photo-cache.js';

const BLOB_BASE_PATH = 'place-photos';

export interface StoredPhoto {
  url: string;
  path: string;
}

export async function storePhotoBytes(
  placeId: string,
  data: ArrayBuffer,
  contentType?: string,
  options?: { version?: string; uniqueSuffix?: string | number | boolean }
): Promise<StoredPhoto> {
  const version = options?.version || PHOTO_VERSION;
  const suffix =
    options?.uniqueSuffix === undefined || options?.uniqueSuffix === false
      ? ''
      : `-${options.uniqueSuffix === true ? Date.now() : options.uniqueSuffix}`;
  const path = `${BLOB_BASE_PATH}/${version}/${placeId}/0${suffix}.jpg`;
  const res = await put(path, data, {
    access: 'public',
    contentType: contentType || 'image/jpeg',
    addRandomSuffix: false,
  });
  return { url: res.url, path };
}

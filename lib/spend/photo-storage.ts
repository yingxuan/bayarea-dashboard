import { put } from '@vercel/blob';

const BLOB_BASE_PATH = 'place-photos';

export interface StoredPhoto {
  url: string;
  path: string;
}

export async function storePhotoBytes(
  placeId: string,
  data: ArrayBuffer,
  contentType?: string
): Promise<StoredPhoto> {
  const path = `${BLOB_BASE_PATH}/${placeId}/0.jpg`;
  const res = await put(path, data, {
    access: 'public',
    contentType: contentType || 'image/jpeg',
    addRandomSuffix: false,
  });
  return { url: res.url, path };
}

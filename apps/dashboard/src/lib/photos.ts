import { API_URL, ApiError, OFFLINE, messageOf } from './api';
import { session } from './session';

/** How big each kind of photo is kept, on its longest side: plenty for a phone or tablet screen. */
export const PHOTO_SIZES = { item: 800, cover: 1600, logo: 400 } as const;

export const itemPhotoPath = (itemId: string) => `/api/menu/items/${itemId}/photo`;
export const storePhotoPath = (which: 'cover' | 'logo') => `/api/storefront/photos/${which}`;

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Makes a picture small before it's sent: at most `longest` pixels on its longest side, as WebP,
 * or JPEG where the browser can't make WebP. A 4 MB phone photo becomes well under 200 KB, which
 * matters for vendors' data and for customers loading the store.
 */
async function shrink(file: File, longest: number): Promise<Blob> {
  let picture: ImageBitmap;
  try {
    picture = await createImageBitmap(file);
  } catch {
    throw new ApiError('That file isn’t a picture we can use. Pick a JPG, PNG or WebP photo.', 400);
  }
  const scale = Math.min(1, longest / Math.max(picture.width, picture.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(picture.width * scale));
  canvas.height = Math.max(1, Math.round(picture.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    picture.close();
    throw new ApiError('This browser can’t prepare photos. Try Chrome.', 0);
  }
  try {
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const webp = await canvasBlob(canvas, 'image/webp', 0.8);
    // A browser that can't make WebP quietly makes a PNG instead.
    if (webp?.type === 'image/webp') return webp;
    // JPEG has no see-through parts: put the picture on white rather than black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.85);
    if (!jpeg) throw new ApiError('That photo couldn’t be prepared. Try another one.', 0);
    return jpeg;
  } finally {
    picture.close();
  }
}

/** The picture is sent as itself, not as JSON, so this is a plain fetch rather than the client. */
async function send(method: 'PUT' | 'DELETE', path: string, picture?: Blob): Promise<Response> {
  const { token, tenantId } = session.get();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (tenantId) headers.set('x-tenant-id', tenantId);
  if (picture) headers.set('Content-Type', picture.type);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers, body: picture });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (response.status === 401) session.signOut();
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new ApiError(messageOf(body, response.status), response.status);
  }
  return response;
}

/** Makes the picture small and keeps it as the photo at `path`; returns its address. */
export async function uploadPhoto(path: string, file: File, longest: number): Promise<string> {
  const response = await send('PUT', path, await shrink(file, longest));
  return ((await response.json()) as { url: string }).url;
}

export async function removePhoto(path: string): Promise<void> {
  await send('DELETE', path);
}

// Decodes and downscales images off the main thread. A 24–45 MP camera JPEG
// takes hundreds of milliseconds to decode; doing it here keeps the UI thread
// free so animations never stall on a decode.

export interface DecodeJob {
  id: number;
  url: string;
  maxWidth: number;
  maxHeight: number;
}

export type DecodeResult =
  | { id: number; bitmap: ImageBitmap; naturalWidth: number; naturalHeight: number }
  | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeJob>) => void) | null;
  postMessage(message: DecodeResult, transfer?: Transferable[]): void;
};

async function decodeOriented(blob: Blob): Promise<ImageBitmap> {
  try {
    // Respect EXIF rotation so portrait shots from a camera stand upright.
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (error) {
    if (error instanceof TypeError) return createImageBitmap(blob);
    throw error;
  }
}

scope.onmessage = async event => {
  const { id, url, maxWidth, maxHeight } = event.data;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const full = await decodeOriented(await response.blob());
    const naturalWidth = full.width;
    const naturalHeight = full.height;
    const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);

    let bitmap = full;
    if (scale < 1) {
      bitmap = await createImageBitmap(full, {
        resizeWidth: Math.max(1, Math.round(naturalWidth * scale)),
        resizeHeight: Math.max(1, Math.round(naturalHeight * scale)),
        resizeQuality: 'high',
      });
      full.close();
    }
    scope.postMessage({ id, bitmap, naturalWidth, naturalHeight }, [bitmap]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

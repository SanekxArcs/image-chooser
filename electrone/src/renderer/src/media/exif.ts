// Reads the small preview JPEG that cameras embed in EXIF (IFD1). It lives in
// the first ~64 KB of the file, so a filmstrip thumbnail costs one tiny read
// and a 160 px decode instead of decoding a 24–45 MP photo.

export interface ExifPreview {
  blob: Blob;
  orientation: number;
  /** Pixel size of the full photo, when the camera recorded it. */
  width: number;
  height: number;
}

const HEAD_BYTES = 128 * 1024;

/** Reads at most the first bytes of a file, whether or not Range is honoured. */
export async function readHead(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const out = new Uint8Array(HEAD_BYTES);
  let length = 0;
  while (length < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.length, HEAD_BYTES - length);
    out.set(value.subarray(0, take), length);
    length += take;
  }
  void reader.cancel().catch(() => {});
  return out.buffer.slice(0, length);
}

export function parseExifPreview(buf: ArrayBuffer): ExifPreview | null {
  try {
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        return parseTiff(view, offset + 10);
      }
      offset += 2 + size;
    }
  } catch {
    // Truncated or malformed EXIF; the caller falls back to a full decode.
  }
  return null;
}

function parseTiff(view: DataView, tiff: number): ExifPreview | null {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(tiff + o, little);
  const u32 = (o: number) => view.getUint32(tiff + o, little);
  if (u16(2) !== 42) return null;

  const value = (entry: number) => (u16(entry + 2) === 3 ? u16(entry + 8) : u32(entry + 8));

  let orientation = 1;
  let exifIfd = 0;
  const ifd0 = u32(4);
  const count0 = u16(ifd0);
  for (let i = 0; i < count0; i++) {
    const entry = ifd0 + 2 + i * 12;
    const tag = u16(entry);
    if (tag === 0x0112) orientation = u16(entry + 8);
    else if (tag === 0x8769) exifIfd = u32(entry + 8);
  }

  let width = 0;
  let height = 0;
  if (exifIfd) {
    const count = u16(exifIfd);
    for (let i = 0; i < count; i++) {
      const entry = exifIfd + 2 + i * 12;
      const tag = u16(entry);
      if (tag === 0xa002) width = value(entry);
      else if (tag === 0xa003) height = value(entry);
    }
  }

  const ifd1 = u32(ifd0 + 2 + count0 * 12);
  if (!ifd1) return null;
  let start = 0;
  let length = 0;
  const count1 = u16(ifd1);
  for (let i = 0; i < count1; i++) {
    const entry = ifd1 + 2 + i * 12;
    const tag = u16(entry);
    if (tag === 0x0201) start = u32(entry + 8);
    else if (tag === 0x0202) length = u32(entry + 8);
  }
  if (!start || !length || tiff + start + length > view.byteLength) return null;

  const bytes = new Uint8Array(view.buffer as ArrayBuffer, tiff + start, length);
  return {
    blob: new Blob([bytes], { type: 'image/jpeg' }),
    orientation: orientation >= 1 && orientation <= 8 ? orientation : 1,
    width,
    height,
  };
}

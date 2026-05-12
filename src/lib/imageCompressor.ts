/**
 * Phase B1 — pure utility for compressing a single image File into a
 * JPEG Blob via the canvas pipeline.
 *
 * This module deliberately stays free of React/state/UI concerns: it
 * accepts a File and Promise-resolves a Blob (plus metadata for
 * debugging). Callers are responsible for memory management of the
 * input File and the output Blob; this function only manages the
 * intermediate Object URL it creates internally.
 *
 * Design notes:
 *  - We use HTMLCanvasElement + Image (not OffscreenCanvas / ImageBitmap)
 *    so the same code path runs in jsdom for tests.
 *  - URL.createObjectURL is always paired with URL.revokeObjectURL via
 *    try/finally to avoid leaks at 100-image batch scale.
 *  - canvas.toBlob is callback-based; we wrap it in a Promise so the
 *    function has a single async contract.
 */

export type CompressOptions = {
  /** Maximum width OR height in pixels. Aspect ratio preserved. Default: 1800. */
  maxDimension?: number;
  /** JPEG quality 0.0–1.0. Default: 0.75. */
  quality?: number;
};

export type CompressResult = {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
};

const DEFAULT_MAX_DIMENSION = 1800;
const DEFAULT_QUALITY = 0.75;

const loadImage = (objectUrl: string, filename: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`compressImage: failed to load image "${filename}"`));
    img.src = objectUrl;
  });

const canvasToJpegBlob = (
  canvas: HTMLCanvasElement,
  quality: number,
  filename: string,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(
            new Error(
              `compressImage: canvas.toBlob returned null for "${filename}"`,
            ),
          );
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });

const computeScaledDimensions = (
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const originalBytes = file.size;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl, file.name);
    const { width, height } = computeScaledDimensions(
      img.width,
      img.height,
      maxDimension,
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`compressImage: canvas 2d context unavailable for "${file.name}"`);
    }
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToJpegBlob(canvas, quality, file.name);
    return {
      blob,
      width,
      height,
      originalBytes,
      compressedBytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

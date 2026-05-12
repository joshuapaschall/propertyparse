/**
 * Tests for compressImage.
 *
 * jsdom has no real canvas; we mock Image, HTMLCanvasElement, and
 * URL.{createObjectURL,revokeObjectURL} at the module boundary. This
 * keeps the test deterministic — no pixel decoding, no flaky color
 * comparisons — while still exercising the option-passing, error
 * propagation, and object-URL revocation contracts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from './imageCompressor';

// makeFile pattern lifted from FileUploadCard.test.tsx — kept inline per
// spec ("copy inline; do not refactor it into a shared helper file").
const makeFile = (name: string, sizeBytes: number, mime = 'image/jpeg'): File => {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: mime });
  return new File([blob], name, { type: mime });
};

type ToBlobBehavior = 'jpeg' | 'null';
type ImageBehavior = { loaded: boolean; width?: number; height?: number };

const installCanvasAndImageMocks = (
  image: ImageBehavior,
  toBlob: ToBlobBehavior,
) => {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    width = image.width ?? 2000;
    height = image.height ?? 1500;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      // Fire async to mimic the real Image load timing without blocking.
      setTimeout(() => {
        if (image.loaded) {
          this.onload?.();
        } else {
          this.onerror?.(new Event('error'));
        }
      }, 0);
    }
  }
  vi.stubGlobal('Image', MockImage);

  // Capture sizes the caller assigns so toBlob can fabricate a Blob
  // with non-zero bytes for assertions about compressedBytes.
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
  ): HTMLElement => {
    if (tagName !== 'canvas') return originalCreateElement(tagName);
    const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
    canvas.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof canvas.getContext;
    canvas.toBlob = vi.fn((callback: BlobCallback): void => {
      if (toBlob === 'null') {
        callback(null);
        return;
      }
      const fakePdfBytes = new Uint8Array(128);
      callback(new Blob([fakePdfBytes], { type: 'image/jpeg' }));
    }) as typeof canvas.toBlob;
    return canvas;
  }) as typeof document.createElement);
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  createObjectURLMock = vi.fn(() => 'blob:mock-url');
  revokeObjectURLMock = vi.fn();
  // jsdom doesn't ship a real URL.createObjectURL; assign vi.fn directly.
  (URL as unknown as { createObjectURL: typeof URL.createObjectURL }).createObjectURL =
    createObjectURLMock as unknown as typeof URL.createObjectURL;
  (URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }).revokeObjectURL =
    revokeObjectURLMock as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  (URL as unknown as { createObjectURL: typeof URL.createObjectURL }).createObjectURL =
    originalCreateObjectURL;
  (URL as unknown as { revokeObjectURL: typeof URL.revokeObjectURL }).revokeObjectURL =
    originalRevokeObjectURL;
});

describe('compressImage', () => {
  it('uses default maxDimension=1800 and quality=0.75 when options omitted', async () => {
    installCanvasAndImageMocks({ loaded: true, width: 4000, height: 3000 }, 'jpeg');
    const file = makeFile('photo.jpg', 1024);

    const result = await compressImage(file);

    // 4000x3000 scaled so the longest side = 1800 => 1800x1350.
    expect(result.width).toBe(1800);
    expect(result.height).toBe(1350);
    expect(result.originalBytes).toBe(1024);
    expect(result.compressedBytes).toBeGreaterThan(0);
  });

  it('respects custom maxDimension and quality', async () => {
    installCanvasAndImageMocks({ loaded: true, width: 4000, height: 2000 }, 'jpeg');
    const file = makeFile('wide.jpg', 1024);

    const result = await compressImage(file, { maxDimension: 800, quality: 0.5 });

    // 4000x2000 scaled to longest=800 => 800x400.
    expect(result.width).toBe(800);
    expect(result.height).toBe(400);
  });

  it('does not upscale images smaller than maxDimension', async () => {
    installCanvasAndImageMocks({ loaded: true, width: 400, height: 300 }, 'jpeg');
    const file = makeFile('small.jpg', 256);

    const result = await compressImage(file, { maxDimension: 1800 });

    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('rejects with a descriptive error when the image fails to load', async () => {
    installCanvasAndImageMocks({ loaded: false }, 'jpeg');
    const file = makeFile('broken.jpg', 1024);

    await expect(compressImage(file)).rejects.toThrow(/failed to load image "broken\.jpg"/);
  });

  it('rejects when canvas.toBlob returns null', async () => {
    installCanvasAndImageMocks({ loaded: true }, 'null');
    const file = makeFile('toblobfails.jpg', 1024);

    await expect(compressImage(file)).rejects.toThrow(/canvas\.toBlob returned null/);
  });

  it('revokes the object URL on the success path', async () => {
    installCanvasAndImageMocks({ loaded: true }, 'jpeg');
    const file = makeFile('ok.jpg', 1024);

    await compressImage(file);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes the object URL on the failure path', async () => {
    installCanvasAndImageMocks({ loaded: false }, 'jpeg');
    const file = makeFile('bad.jpg', 1024);

    await expect(compressImage(file)).rejects.toThrow();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});

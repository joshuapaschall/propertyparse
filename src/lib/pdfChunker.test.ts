/**
 * Tests for chunkImagesIntoPdfs.
 *
 * Uses the real stitcher (and real pdf-lib) so we're verifying the
 * chunker's packing decisions against actual PDF byte sizes, not
 * simulated estimates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chunkImagesIntoPdfs } from './pdfChunker';
import type { StitchInput } from './pdfStitcher';

// jsdom v24 polyfill (see pdfStitcher.test.ts comment).
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  (Blob.prototype as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer =
    function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
}

const MINIMAL_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xfb,
  0xd0, 0xff, 0xd9,
]);

const makeJpegInput = (filename: string): StitchInput => ({
  blob: new Blob([MINIMAL_JPEG], { type: 'image/jpeg' }),
  filename,
});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('chunkImagesIntoPdfs', () => {
  it('single small image yields a single chunk with one page', async () => {
    const result = await chunkImagesIntoPdfs([makeJpegInput('only.jpg')]);

    expect(result.chunks).toHaveLength(1);
    expect(result.totalPages).toBe(1);
    expect(result.chunks[0].pageManifest).toEqual([
      { pageIndex: 0, sourceFilename: 'only.jpg' },
    ]);
  });

  it('many small images stay in one chunk when under target', async () => {
    const inputs = Array.from({ length: 5 }, (_unused, i) =>
      makeJpegInput(`tiny-${i}.jpg`),
    );
    const result = await chunkImagesIntoPdfs(inputs);

    expect(result.chunks).toHaveLength(1);
    expect(result.totalPages).toBe(5);
  });

  it('splits when targetBytesPerChunk is very tight', async () => {
    // 500 bytes is smaller than any pdf-lib output, so each image
    // overflows on the second probe and gets its own chunk.
    const inputs = [
      makeJpegInput('a.jpg'),
      makeJpegInput('b.jpg'),
      makeJpegInput('c.jpg'),
    ];
    const result = await chunkImagesIntoPdfs(inputs, { targetBytesPerChunk: 500 });

    expect(result.chunks).toHaveLength(3);
    expect(result.totalPages).toBe(3);
    for (const chunk of result.chunks) {
      expect(chunk.pageManifest).toHaveLength(1);
    }
  });

  it('respects maxPagesPerChunk regardless of byte budget', async () => {
    const inputs = Array.from({ length: 5 }, (_unused, i) =>
      makeJpegInput(`pg-${i}.jpg`),
    );
    const result = await chunkImagesIntoPdfs(inputs, { maxPagesPerChunk: 2 });

    // 5 images at 2 per chunk => 2 + 2 + 1 = 3 chunks.
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0].pageManifest).toHaveLength(2);
    expect(result.chunks[1].pageManifest).toHaveLength(2);
    expect(result.chunks[2].pageManifest).toHaveLength(1);
    expect(result.totalPages).toBe(5);
  });

  it('totalPages equals input length across multiple chunk shapes', async () => {
    const tight = await chunkImagesIntoPdfs(
      [makeJpegInput('x.jpg'), makeJpegInput('y.jpg'), makeJpegInput('z.jpg')],
      { targetBytesPerChunk: 500 },
    );
    const loose = await chunkImagesIntoPdfs(
      [makeJpegInput('x.jpg'), makeJpegInput('y.jpg'), makeJpegInput('z.jpg')],
    );
    expect(tight.totalPages).toBe(3);
    expect(loose.totalPages).toBe(3);
  });

  it('preserves input filename order across all chunks', async () => {
    const filenames = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
    const inputs = filenames.map(makeJpegInput);
    const result = await chunkImagesIntoPdfs(inputs, { maxPagesPerChunk: 2 });

    const flattened = result.chunks.flatMap((chunk) =>
      chunk.pageManifest.map((entry) => entry.sourceFilename),
    );
    expect(flattened).toEqual(filenames);
  });

  it('warns and still emits the chunk when a single image exceeds the target', async () => {
    // 10 bytes is smaller than any valid pdf-lib output; the single
    // image still gets emitted because we don't drop user data.
    const result = await chunkImagesIntoPdfs([makeJpegInput('big.jpg')], {
      targetBytesPerChunk: 10,
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].pageManifest).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});

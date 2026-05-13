/**
 * Utility for splitting N images into M PDF chunks,
 * each ≤ a target size in bytes.
 */

import { stitchImagesIntoPdf, type StitchInput, type StitchResult } from './pdfStitcher';

export type ChunkOptions = {
  /** Target maximum bytes per PDF chunk. Default: 20 * 1024 * 1024 (20 MB). */
  targetBytesPerChunk?: number;
  /** Hard maximum pages per chunk regardless of size. Default: 200. */
  maxPagesPerChunk?: number;
};

export type ChunkResult = {
  /** Array of finalized PDFs, in input order. */
  chunks: StitchResult[];
  /** Total pages across all chunks (sanity check; should equal images.length). */
  totalPages: number;
};

const DEFAULT_TARGET_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 200;

export async function chunkImagesIntoPdfs(
  images: StitchInput[],
  options: ChunkOptions = {},
): Promise<ChunkResult> {
  const targetBytes = options.targetBytesPerChunk ?? DEFAULT_TARGET_BYTES;
  const maxPages = options.maxPagesPerChunk ?? DEFAULT_MAX_PAGES;

  // Estimate sizes from blob.size instead of stitching a trial PDF for every image.
  const PDF_BASE_OVERHEAD = 8 * 1024;
  const PDF_PAGE_OVERHEAD = 4 * 1024;

  const chunkBoundaries: Array<[number, number]> = [];
  let currentStart = 0;
  let currentEstimate = PDF_BASE_OVERHEAD;

  for (let i = 0; i < images.length; i += 1) {
    const imageSize = images[i].blob.size;
    const pageEstimate = imageSize + PDF_PAGE_OVERHEAD;
    const pagesInChunk = i - currentStart + 1;

    const wouldExceed = currentEstimate + pageEstimate > targetBytes && pagesInChunk > 1;
    const atPageCap = pagesInChunk > maxPages;

    if (wouldExceed || atPageCap) {
      chunkBoundaries.push([currentStart, i - 1]);
      currentStart = i;
      currentEstimate = PDF_BASE_OVERHEAD + pageEstimate;
    } else {
      currentEstimate += pageEstimate;
    }
  }

  if (currentStart < images.length) {
    chunkBoundaries.push([currentStart, images.length - 1]);
  }

  const chunks: StitchResult[] = [];
  for (const [start, end] of chunkBoundaries) {
    const chunkImages = images.slice(start, end + 1);
    const result = await stitchImagesIntoPdf(chunkImages);

    if (result.bytes > targetBytes && chunkImages.length === 1) {
      console.warn(
        `chunkImagesIntoPdfs: single image "${chunkImages[0].filename}" stitched to ` +
          `${result.bytes} bytes, exceeds target ${targetBytes} bytes — emitting as own chunk`,
      );
    }

    chunks.push(result);
  }

  const totalPages = chunks.reduce((sum, chunk) => sum + chunk.pageManifest.length, 0);
  return { chunks, totalPages };
}

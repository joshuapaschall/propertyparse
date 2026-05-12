/**
 * Phase B1 — pure utility for splitting N images into M PDF chunks,
 * each ≤ a target size in bytes.
 *
 * Strategy: greedy packing with probe-and-roll-back. For each image:
 *   1. Add to pending list.
 *   2. Stitch a trial PDF.
 *   3. If trial > target AND pending has >1 image: drop the last
 *      image, finalize the previous (smaller) chunk, start a new
 *      chunk with the dropped image.
 *   4. If trial > target AND pending has only 1 image: keep it
 *      (single oversized images aren't dropped — we warn and ship).
 *   5. If pending hits maxPagesPerChunk: finalize.
 *
 * TODO (Phase B3): this re-stitches every probe step. For 1500
 * images that's ~1500 stitch operations. A size-estimation pass
 * (sum of blob.size + small constant for PDF overhead) would let
 * us pack without probing — at the cost of conservative slack.
 * Acceptable for B1; correctness > performance for now.
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

  const chunks: StitchResult[] = [];
  let pending: StitchInput[] = [];
  let lastTrial: StitchResult | null = null;

  const finalizeChunk = async () => {
    if (pending.length === 0) return;
    // Re-use the most recent successful trial when possible; otherwise
    // stitch one final time. (We stitch fresh when lastTrial is null,
    // which only happens on the very first image where we haven't
    // probed yet — but that path always has lastTrial set, so this
    // is defensive.)
    const finalized = lastTrial ?? (await stitchImagesIntoPdf(pending));
    chunks.push(finalized);
    pending = [];
    lastTrial = null;
  };

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    pending.push(image);
    // Probe: stitch the current pending list to measure its real size.
    const trial = await stitchImagesIntoPdf(pending);

    const overTargetSize = trial.bytes > targetBytes;
    const atPageCap = pending.length >= maxPages;

    if (overTargetSize && pending.length > 1) {
      // Roll back: drop the image we just added, finalize what fit,
      // and start a fresh chunk with the dropped image.
      pending.pop();
      const reducedTrial = await stitchImagesIntoPdf(pending);
      chunks.push(reducedTrial);
      pending = [image];
      lastTrial = await stitchImagesIntoPdf(pending);
      continue;
    }

    if (overTargetSize && pending.length === 1) {
      // Single image already over budget — emit it anyway, with a
      // warning. We don't drop user data; the operator can see this
      // in the console and split the source image manually if needed.
      console.warn(
        `chunkImagesIntoPdfs: single image "${image.filename}" stitched to ` +
          `${trial.bytes} bytes, exceeds target ${targetBytes} bytes — emitting as own chunk`,
      );
      chunks.push(trial);
      pending = [];
      lastTrial = null;
      continue;
    }

    lastTrial = trial;
    if (atPageCap) {
      await finalizeChunk();
    }
  }

  // Flush whatever is left in pending into a final chunk.
  await finalizeChunk();

  const totalPages = chunks.reduce((sum, chunk) => sum + chunk.pageManifest.length, 0);
  return { chunks, totalPages };
}

/**
 * Phase B1 — pure utility for stitching N image blobs into a single PDF.
 *
 * pdf-lib runs in both the browser and jsdom, so this module is
 * exercisable end-to-end by Vitest without a canvas polyfill.
 *
 * Page sizing: each page is sized exactly to the embedded image's
 * pixel dimensions, then the image is drawn at (0, 0) covering the
 * full page. This avoids letterboxing / cropping and preserves the
 * source resolution so downstream OCR has the same pixels to work with.
 *
 * The PDF is intentionally minimal: no page labels, annotations,
 * filename text, or other metadata are embedded. Filename mapping
 * lives only in the returned manifest. Keeping the PDF clean ensures
 * OCR doesn't see chrome as part of the page content.
 */

import { PDFDocument } from 'pdf-lib';

export type StitchInput = {
  /** Compressed JPEG blob (typically from compressImage). PNG also supported. */
  blob: Blob;
  /** Original filename, used for the page manifest. Not embedded in the PDF. */
  filename: string;
};

export type PageManifestEntry = {
  /** Zero-indexed page number in the resulting PDF. */
  pageIndex: number;
  /** Original filename this page was sourced from. */
  sourceFilename: string;
};

export type StitchResult = {
  pdfBlob: Blob;
  pageManifest: PageManifestEntry[];
  /** Final PDF size in bytes (after pdf-lib save). */
  bytes: number;
};

type EmbeddedKind = 'jpeg' | 'png';

const detectEmbeddedKind = (mimeType: string): EmbeddedKind | null => {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpeg';
  if (normalized === 'image/png') return 'png';
  return null;
};

export async function stitchImagesIntoPdf(images: StitchInput[]): Promise<StitchResult> {
  if (images.length === 0) {
    throw new Error('stitchImagesIntoPdf: at least one image required');
  }

  const pdfDoc = await PDFDocument.create();
  const pageManifest: PageManifestEntry[] = [];

  for (let i = 0; i < images.length; i += 1) {
    const input = images[i];
    const kind = detectEmbeddedKind(input.blob.type);
    if (kind === null) {
      throw new Error(
        `stitchImagesIntoPdf: unsupported MIME type "${input.blob.type}" for "${input.filename}"`,
      );
    }

    const bytes = await input.blob.arrayBuffer();
    const embedded =
      kind === 'jpeg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

    const page = pdfDoc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });

    pageManifest.push({ pageIndex: i, sourceFilename: input.filename });
  }

  const savedBytes = await pdfDoc.save();
  // Copy into a fresh Uint8Array (backed by a plain ArrayBuffer) so the
  // result satisfies Blob's strict BlobPart type. pdfDoc.save() returns
  // Uint8Array<ArrayBufferLike>, which TS rejects for new Blob([...]).
  const blobBytes = new Uint8Array(savedBytes);
  const pdfBlob = new Blob([blobBytes], { type: 'application/pdf' });

  return {
    pdfBlob,
    pageManifest,
    bytes: blobBytes.byteLength,
  };
}

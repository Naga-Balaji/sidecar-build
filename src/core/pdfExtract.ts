import {getOcr} from './ocr';

/**
 * PDF text extraction via Android's built-in PdfRenderer.
 *
 * Approach: render each page as a JPG through react-native-pdf-thumbnail
 * (which wraps android.graphics.pdf.PdfRenderer), then OCR each with ML Kit.
 * No JS-side PDF parsing — everything goes through code paths we know work.
 *
 * Slower than a real text-layer extractor for text-heavy PDFs, but rock
 * solid: works for scans, exports, mixed content, anything with a page.
 *
 * Caps at 15 pages by default to keep memory + OCR time bounded.
 */
export async function extractPdfText(fileUri: string, maxPages = 15): Promise<string> {
  const PdfThumbnail = require('react-native-pdf-thumbnail').default;
  const path = fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;

  // generateAllPages renders every page. On very large PDFs this can be slow;
  // we could switch to per-page generate() with early exit later.
  const pages = await PdfThumbnail.generateAllPages(path, 80);
  const usable = pages.slice(0, maxPages);

  const ocr = getOcr();
  const parts: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const p = usable[i];
    try {
      const text = await ocr.recognize(p.uri);
      if (text.trim()) {
        parts.push(text.trim());
      }
    } catch (e) {
      console.warn(`[pdf] page ${i + 1} OCR failed`, e);
    }
  }
  if (pages.length > maxPages) {
    parts.push(`\n[Sidecar: showed first ${maxPages} of ${pages.length} pages.]`);
  }
  return parts.join('\n\n');
}

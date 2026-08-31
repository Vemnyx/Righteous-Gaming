import { sanitizeRichTextHtml, isEmptyRichHtml } from "./richTextDomPurify";

/** Soft cap for Word imports (images inside can still be large). */
export const MAX_DOCX_IMPORT_BYTES = 25 * 1024 * 1024;

/** @param {number} bytes */
export function docxImportSizeError(bytes) {
  if (!Number.isFinite(bytes) || bytes <= MAX_DOCX_IMPORT_BYTES) return null;
  return "Word document exceeds the 25 MB import limit.";
}

/**
 * @param {string} contentType
 * @returns {string}
 */
function extFromContentType(contentType) {
  const t = String(contentType || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("gif")) return "gif";
  if (t.includes("webp")) return "webp";
  if (t.includes("svg")) return "svg";
  return "bin";
}

/**
 * Convert a .docx File to sanitized HTML suitable for TipTap.
 * Mammoth is loaded on demand to keep the main bundle smaller.
 *
 * @param {File} file
 * @param {{
 *   uploadImage?: (file: File) => Promise<string>,
 * }} [options]
 * @returns {Promise<{ html: string, warnings: string[] }>}
 */
export async function docxFileToRichHtml(file, options = {}) {
  if (!file) throw new Error("Choose a Word (.docx) file.");
  const name = String(file.name || "").toLowerCase();
  const isDocx =
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/octet-stream";
  if (!isDocx) {
    throw new Error("Only .docx Word documents are supported.");
  }
  const sizeErr = docxImportSizeError(file.size);
  if (sizeErr) throw new Error(sizeErr);

  const mammothMod = await import("mammoth");
  const mammoth = mammothMod.default ?? mammothMod;

  const arrayBuffer = await file.arrayBuffer();
  /** @type {Record<string, unknown>} */
  const mammothOpts = {};

  if (typeof options.uploadImage === "function") {
    const uploadImage = options.uploadImage;
    mammothOpts.convertImage = mammoth.images.imgElement(async (image) => {
      const bytes = await image.read();
      const contentType = image.contentType || "application/octet-stream";
      const ext = extFromContentType(contentType);
      const imgFile = new File([bytes], `docx-image.${ext}`, { type: contentType });
      const src = await uploadImage(imgFile);
      return { src };
    });
  }

  const result = await mammoth.convertToHtml({ arrayBuffer }, mammothOpts);
  const html = sanitizeRichTextHtml(result.value || "");
  if (isEmptyRichHtml(html)) {
    throw new Error("That document had no readable text to import.");
  }

  const warnings = (result.messages || [])
    .filter((m) => m && m.type === "warning" && typeof m.message === "string")
    .map((m) => m.message)
    .slice(0, 5);

  return { html, warnings };
}

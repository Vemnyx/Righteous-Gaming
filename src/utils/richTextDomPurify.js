import DOMPurify from "dompurify";

const textAlignStyle = /^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$/i;

let purifyHooksInstalled = false;

function ensurePurifyHooks() {
  if (purifyHooksInstalled) return;
  purifyHooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName !== "style") return;
    const v = String(data.attrValue ?? "").trim();
    if (!textAlignStyle.test(v)) {
      data.keepAttr = false;
    }
  });
}

/** Sanitize TipTap HTML for safe rendering. */
export function sanitizeRichTextHtml(html) {
  ensurePurifyHooks();
  return DOMPurify.sanitize(html ?? "", {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["style", "data-text-align", "width", "height"],
  });
}

/** @deprecated Prefer {@link sanitizeRichTextHtml} */
export const sanitizeAnnouncementBodyHtml = sanitizeRichTextHtml;

/** Tailwind prose styles for rendered rich text. */
export const richTextBodyClassName =
  "rich-text-body max-w-none text-[0.95rem] leading-relaxed text-[#f4f0fa] [&_a]:text-violet-200 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img[data-text-align=center]]:mx-auto [&_img[data-text-align=right]]:ml-auto [&_img[data-text-align=right]]:mr-0 [&_p]:my-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6";

/** @deprecated Prefer {@link richTextBodyClassName} */
export const announcementBodyClassName = `announcement-body ${richTextBodyClassName} [&_img]:cursor-zoom-in`;

/** Escape plain text for HTML. */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Normalize stored note/body content to HTML.
 * Plain-text legacy rows become escaped paragraphs.
 * @param {string | null | undefined} body
 */
export function bodyToRichHtml(body) {
  const t = String(body ?? "").trim();
  if (!t) return "";
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  return `<p>${escapeHtml(t).replace(/\r\n|\r|\n/g, "<br>")}</p>`;
}

/** True when TipTap HTML has no visible text and no images. */
export function isEmptyRichHtml(html) {
  const raw = String(html ?? "");
  if (/<img\b/i.test(raw)) return false;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text === "";
}

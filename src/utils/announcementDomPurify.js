import DOMPurify from "dompurify";

const announcementTextAlignStyle = /^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$/i;

let announcementBodyPurifyHooksInstalled = false;

function ensureAnnouncementBodyPurifyHooks() {
  if (announcementBodyPurifyHooksInstalled) return;
  announcementBodyPurifyHooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName !== "style") return;
    const v = String(data.attrValue ?? "").trim();
    if (!announcementTextAlignStyle.test(v)) {
      data.keepAttr = false;
    }
  });
}

/** Rich-text body only (no iframes / embedded video — use `youtube_url` for video). */
export function sanitizeAnnouncementBodyHtml(html) {
  ensureAnnouncementBodyPurifyHooks();
  return DOMPurify.sanitize(html ?? "", {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["style", "data-text-align", "width", "height"],
  });
}

/** Tailwind applied to sanitized announcement prose (shared feed + admin preview). */
export const announcementBodyClassName =
  "announcement-body max-w-none text-[0.95rem] leading-relaxed text-[#f4f0fa]/92 [&_a]:text-violet-300 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:my-4 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img[data-text-align=center]]:mx-auto [&_img[data-text-align=right]]:ml-auto [&_img[data-text-align=right]]:mr-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6";

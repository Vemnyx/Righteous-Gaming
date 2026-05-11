import { forwardRef, useCallback, useImperativeHandle } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Youtube from "@tiptap/extension-youtube";
import { uploadPublicAsset, extFromFilename } from "../utils/uploadPublicAsset";

/**
 * @typedef {{
 *   initialHtml: string,
 *   draftFolder: string,
 *   editingId: number | null,
 *   getIdToken: () => Promise<string>,
 *   isLight: boolean,
 * }} AnnouncementRichTextEditorProps
 */

const btn =
  "rounded-md border px-2 py-1 text-[0.75rem] font-semibold transition-colors disabled:opacity-40";

function toolbarSurface(isLight) {
  return isLight
    ? "border-white/[0.18] bg-black/25 text-[#f4f0fa]"
    : "border-white/[0.22] bg-black/30 text-[#f4f0fa]";
}

/** Idle vs active styling so toggle marks/lists read clearly when the caret is inside them */
function toolbarBtnClass(active, isLight, idleTone) {
  if (!active) return `${btn} ${idleTone}`;
  if (isLight) {
    return `${btn} border-[rgba(152,117,207,0.9)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_2px_10px_rgb(103_61_154/0.38)]`;
  }
  return `${btn} border-[rgba(142,90,200,0.8)] bg-gradient-to-br from-[rgba(80,40,120,0.65)] to-[rgba(40,20,70,0.72)] text-white shadow-[0_2px_10px_rgba(90,40,140,0.25)]`;
}

export const AnnouncementRichTextEditor = forwardRef(function AnnouncementRichTextEditor(
  { initialHtml, draftFolder, editingId, getIdToken, isLight },
  ref,
) {
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      TextAlign.configure({
        types: ["paragraph", "heading", "youtube"],
        alignments: ["left", "center", "right"],
        defaultAlignment: null,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-violet-300 underline underline-offset-2" },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-md block",
        },
        resize: {
          enabled: true,
          minWidth: 64,
          minHeight: 48,
          alwaysPreserveAspectRatio: true,
          directions: [
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ],
        },
      }),
      Youtube.configure({
        width: 640,
        height: 360,
        nocookie: true,
        controls: true,
        HTMLAttributes: {
          class: "max-h-[min(75vh,480px)] w-full max-w-full rounded-lg border-0",
        },
      }),
      Placeholder.configure({
        placeholder:
          "Write the announcement… Drag images here, paste a YouTube link, or use the toolbar.",
      }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[14rem] px-3 py-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]",
      },
    },
  });

  const insertImageFile = useCallback(
    async (file) => {
      if (!editor || !file?.type?.startsWith("image/")) return;
      const ext = extFromFilename(file.name);
      const folder =
        editingId != null ? `announcements/${editingId}` : `announcements/drafts/${draftFolder}`;
      const path = `${folder}/inline-${Date.now()}.${ext}`;
      try {
        const url = await uploadPublicAsset(getIdToken, path, file);
        editor.chain().focus().setImage({ src: url, alt: "" }).run();
      } catch (err) {
        console.error("Inline image upload failed", err);
      }
    },
    [editor, editingId, draftFolder, getIdToken],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => editor?.getHTML() ?? "",
      insertImageFile,
    }),
    [editor, insertImageFile],
  );

  const onPasteContainer = useCallback(
    (e) => {
      const files = e.clipboardData?.files;
      if (files?.length && files[0]?.type?.startsWith("image/")) {
        e.preventDefault();
        void insertImageFile(files[0]);
      }
    },
    [insertImageFile],
  );

  const onDropContainer = useCallback(
    (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file?.type?.startsWith("image/")) {
        e.preventDefault();
        void insertImageFile(file);
      }
    },
    [insertImageFile],
  );

  const ts = toolbarSurface(isLight);

  /** @param {*} ed TipTap Editor */
  const currentTextAlign = (ed) => {
    const fromPara = ed.getAttributes("paragraph").textAlign;
    if (fromPara && ["left", "center", "right"].includes(fromPara)) return fromPara;
    const fromHead = ed.getAttributes("heading").textAlign;
    if (fromHead && ["left", "center", "right"].includes(fromHead)) return fromHead;
    const fromYt = ed.getAttributes("youtube").textAlign;
    if (fromYt && ["left", "center", "right"].includes(fromYt)) return fromYt;
    return "left";
  };

  if (!editor) {
    return (
      <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-8 text-center text-[0.85rem] text-[#f4f0fa]/60">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-wrap gap-1 rounded-lg border p-1.5 ${ts}`}
        role="toolbar"
        aria-label="Formatting"
      >
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("bold"), isLight, ts)}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive("bold")}
          title={editor.isActive("bold") ? "Bold — on (click to turn off)" : "Bold — off"}
        >
          Bold
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("italic"), isLight, ts)}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={editor.isActive("italic")}
          title={editor.isActive("italic") ? "Italic — on" : "Italic — off"}
        >
          Italic
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("underline"), isLight, ts)}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-pressed={editor.isActive("underline")}
          title={editor.isActive("underline") ? "Underline — on" : "Underline — off"}
        >
          Underline
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("heading", { level: 2 }), isLight, ts)}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-pressed={editor.isActive("heading", { level: 2 })}
          title={
            editor.isActive("heading", { level: 2 })
              ? "Heading — on"
              : "Heading — off"
          }
        >
          H2
        </button>
        <button
          type="button"
          className={toolbarBtnClass(currentTextAlign(editor) === "left", isLight, ts)}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          aria-pressed={currentTextAlign(editor) === "left"}
          title="Align left"
        >
          Left
        </button>
        <button
          type="button"
          className={toolbarBtnClass(currentTextAlign(editor) === "center", isLight, ts)}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          aria-pressed={currentTextAlign(editor) === "center"}
          title="Align center"
        >
          Center
        </button>
        <button
          type="button"
          className={toolbarBtnClass(currentTextAlign(editor) === "right", isLight, ts)}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          aria-pressed={currentTextAlign(editor) === "right"}
          title="Align right"
        >
          Right
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("bulletList"), isLight, ts)}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={editor.isActive("bulletList")}
          title={
            editor.isActive("bulletList") ? "Bullet list — on" : "Bullet list — off"
          }
        >
          List
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("orderedList"), isLight, ts)}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-pressed={editor.isActive("orderedList")}
          title={
            editor.isActive("orderedList")
              ? "Numbered list — on"
              : "Numbered list — off"
          }
        >
          1.
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("link"), isLight, ts)}
          onClick={() => {
            const prev = window.prompt("Link URL (https://…)");
            const url = prev?.trim();
            if (!url) return;
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          aria-pressed={editor.isActive("link")}
          title={editor.isActive("link") ? "Link — applied to selection" : "Add link"}
        >
          Link
        </button>
        <button
          type="button"
          className={toolbarBtnClass(editor.isActive("youtube"), isLight, ts)}
          onClick={() => {
            const prev = window.prompt("YouTube URL (watch, embed, or youtu.be)");
            const url = prev?.trim();
            if (!url) return;
            editor.chain().focus().setYoutubeVideo({ src: url }).run();
          }}
          aria-pressed={editor.isActive("youtube")}
          title="Embed YouTube video"
        >
          YouTube
        </button>
      </div>
      <div
        className={`rounded-lg border border-white/[0.18] bg-black/25 [&_.ProseMirror_img]:max-h-[min(560px,75vh)] [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:object-contain [&_[data-youtube-video]]:my-4 [&_[data-youtube-video]]:w-full [&_[data-youtube-video]]:max-w-[min(100%,40rem)] [&_[data-youtube-video]_iframe]:aspect-video [&_[data-youtube-video]_iframe]:h-auto [&_[data-youtube-video]_iframe]:w-full [&_[data-youtube-video]_iframe]:rounded-lg [&_[data-resize-handle]]:z-10 [&_[data-resize-handle]]:m-[-6px] [&_[data-resize-handle]]:size-[14px] [&_[data-resize-handle]]:rounded-sm [&_[data-resize-handle]]:border-2 [&_[data-resize-handle]]:border-[rgba(180,140,228,0.95)] [&_[data-resize-handle]]:bg-[rgba(22,12,38,0.92)] [&_[data-resize-handle]]:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${isLight ? "ring-1 ring-white/[0.06]" : ""}`}
        onPaste={onPasteContainer}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropContainer}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

AnnouncementRichTextEditor.displayName = "AnnouncementRichTextEditor";

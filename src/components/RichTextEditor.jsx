import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import BaseImage from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  FileText,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";
import { uploadPublicAsset, extFromFilename, uploadSizeError } from "../utils/uploadPublicAsset";
import { docxFileToRichHtml } from "../utils/docxToRichHtml";
import { isEmptyRichHtml } from "../utils/richTextDomPurify";
import { TextInputModal } from "./TextInputModal";

/** @param {string} v */
function validateLinkUrl(v) {
  const t = v.trim();
  if (!t) return "Enter a URL.";
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "mailto:") {
      return "Use an http, https, or mailto link.";
    }
    return null;
  } catch {
    return "Enter a valid URL.";
  }
}

/** @param {DataTransfer | null | undefined} dt */
function imageFilesFromDataTransfer(dt) {
  if (!dt) return [];
  const fromFiles = [...(dt.files || [])].filter((f) => f.type.startsWith("image/"));
  if (fromFiles.length) return fromFiles;
  /** @type {File[]} */
  const out = [];
  for (const item of [...(dt.items || [])]) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

const RichTextImage = BaseImage.extend({
  name: "image",
  parseHTML() {
    return [
      {
        tag: this.options.allowBase64 ? "img[src]" : 'img[src]:not([src^="data:"])',
        getAttrs: (element) => {
          const src = element.getAttribute("src");
          if (!src) return false;
          const out = {
            src,
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title"),
            width: element.getAttribute("width"),
            height: element.getAttribute("height"),
          };
          const dataTa = element.getAttribute("data-text-align");
          const styleTa = element.style?.textAlign;
          if (["left", "center", "right"].includes(dataTa)) out.textAlign = dataTa;
          else if (["left", "center", "right"].includes(styleTa)) out.textAlign = styleTa;
          return out;
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const merged = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    if (merged.style && typeof merged.style === "string") {
      const cleaned = merged.style
        .replace(/text-align\s*:\s*[^;]+;?/gi, "")
        .replace(/;\s*;/g, ";")
        .replace(/^;\s*|\s*;$/g, "")
        .trim();
      if (cleaned) merged.style = cleaned;
      else delete merged.style;
    }
    const ta = node.attrs.textAlign;
    if (ta === "center" || ta === "right") merged["data-text-align"] = ta;
    else delete merged["data-text-align"];
    return ["img", merged];
  },
  addNodeView() {
    const parentFactory = this.parent?.();
    if (!parentFactory) return null;
    return (props) => {
      const nodeView = parentFactory(props);
      const sync = (node) => {
        const root = nodeView.dom;
        const img = root?.tagName === "IMG" ? root : root?.querySelector?.("img");
        if (!img || !(img instanceof HTMLImageElement)) return;
        if (img.style.textAlign) img.style.textAlign = "";
        const ta = node.attrs.textAlign;
        if (ta === "center" || ta === "right") img.setAttribute("data-text-align", ta);
        else img.removeAttribute("data-text-align");
      };
      sync(props.node);
      const origUpdate = nodeView.update.bind(nodeView);
      nodeView.update = (node, outerDeco, innerDeco) => {
        const ok = origUpdate(node, outerDeco, innerDeco);
        if (ok) sync(node);
        return ok;
      };
      return nodeView;
    };
  },
});

const iconBtnBase =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const labelBtnBase =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[0.78rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

function toolbarSurface(isLight) {
  return isLight
    ? "border-white/[0.18] bg-black/25 text-[#f4f0fa]"
    : "border-white/[0.22] bg-black/30 text-[#f4f0fa]";
}

function toolbarBtnClass(active, isLight, idleTone, withLabel = false) {
  const base = withLabel ? labelBtnBase : iconBtnBase;
  if (!active) return `${base} ${idleTone}`;
  if (isLight) {
    return `${base} border-[rgba(152,117,207,0.9)] bg-gradient-to-b from-[#7b4cb8] to-[#5a2f8f] text-white shadow-[0_2px_10px_rgb(103_61_154/0.38)]`;
  }
  return `${base} border-[rgba(142,90,200,0.8)] bg-gradient-to-br from-[rgba(80,40,120,0.65)] to-[rgba(40,20,70,0.72)] text-white shadow-[0_2px_10px_rgba(90,40,140,0.25)]`;
}

function ToolbarDivider() {
  return <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-white/20 sm:block" aria-hidden />;
}

/**
 * @param {{
 *   active: boolean,
 *   isLight: boolean,
 *   idleTone: string,
 *   title: string,
 *   onClick: () => void,
 *   disabled?: boolean,
 *   children: import("react").ReactNode,
 * }} props
 */
function ToolbarIconButton({ active, isLight, idleTone, title, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={toolbarBtnClass(active, isLight, idleTone)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

/**
 * Shared TipTap editor with formatting toolbar and improved image upload.
 *
 * @param {{
 *   initialHtml?: string,
 *   getIdToken: () => Promise<string>,
 *   isLight?: boolean,
 *   placeholder?: string,
 *   minHeightClass?: string,
 *   buildUploadPath: (file: File, ext: string) => string,
 * }} props
 */
export const RichTextEditor = forwardRef(function RichTextEditor(
  {
    initialHtml = "<p></p>",
    getIdToken,
    isLight = false,
    placeholder = "Write here… Use Image, paste a screenshot, or drag files in.",
    minHeightClass = "min-h-[14rem]",
    buildUploadPath,
  },
  ref,
) {
  const fileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const docxInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const editorInstanceRef = useRef(/** @type {import("@tiptap/react").Editor | null} */ (null));
  const insertImagesRef = useRef(/** @type {(files: File[]) => Promise<void>} */ (async () => {}));
  const uploadingLockRef = useRef(false);

  const [linkModal, setLinkModal] = useState(/** @type {{ open: boolean, initial: string }} */ ({
    open: false,
    initial: "",
  }));
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingDocx, setImportingDocx] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(/** @type {string | null} */ (null));
  const [uploadError, setUploadError] = useState(/** @type {string | null} */ (null));

  const insertImageFiles = useCallback(
    async (/** @type {File[]} */ files) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) return;
      if (uploadingLockRef.current) return;
      uploadingLockRef.current = true;
      setUploading(true);
      setUploadError(null);
      let uploaded = 0;
      try {
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          const sizeErr = uploadSizeError(file.size);
          if (sizeErr) throw new Error(sizeErr);
          setUploadStatus(
            images.length === 1
              ? "Uploading image…"
              : `Uploading image ${i + 1} of ${images.length}…`,
          );
          const ext = extFromFilename(file.name);
          const path = buildUploadPath(file, ext);
          const url = await uploadPublicAsset(getIdToken, path, file);
          const ed = editorInstanceRef.current;
          if (ed) {
            ed
              .chain()
              .focus()
              .setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, "") || "" })
              .run();
          }
          uploaded += 1;
        }
        setUploadStatus(uploaded === 1 ? "Image added." : `${uploaded} images added.`);
        window.setTimeout(() => setUploadStatus(null), 1800);
      } catch (err) {
        setUploadStatus(null);
        setUploadError(err instanceof Error ? err.message : "Image upload failed");
      } finally {
        uploadingLockRef.current = false;
        setUploading(false);
      }
    },
    [buildUploadPath, getIdToken],
  );

  useEffect(() => {
    insertImagesRef.current = insertImageFiles;
  }, [insertImageFiles]);

  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      TextAlign.configure({
        types: ["paragraph", "heading", "image"],
        alignments: ["left", "center", "right"],
        defaultAlignment: null,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-violet-300 underline underline-offset-2" },
      }),
      RichTextImage.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-md block",
        },
        resize: {
          enabled: true,
          minWidth: 64,
          minHeight: 48,
          alwaysPreserveAspectRatio: true,
          directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: `focus:outline-none ${minHeightClass} px-3 py-2 text-[0.9rem] leading-relaxed text-[#f4f0fa]`,
      },
      handlePaste(_view, event) {
        const files = imageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        void insertImagesRef.current(files);
        return true;
      },
      handleDrop(_view, event, _slice, moved) {
        if (moved) return false;
        const files = imageFilesFromDataTransfer(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        void insertImagesRef.current(files);
        return true;
      },
    },
  });

  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  const insertImageFile = useCallback(
    async (file) => {
      if (!file) return;
      await insertImageFiles([file]);
    },
    [insertImageFiles],
  );

  const importDocxFile = useCallback(
    async (/** @type {File | null | undefined} */ file) => {
      if (!file) return;
      const ed = editorInstanceRef.current;
      if (!ed) return;
      if (uploadingLockRef.current || importingDocx) return;

      const currentHtml = ed.getHTML() ?? "";
      if (!isEmptyRichHtml(currentHtml)) {
        const ok = window.confirm(
          "Replace the current editor content with this Word document? Unsaved changes in the editor will be lost.",
        );
        if (!ok) return;
      }

      uploadingLockRef.current = true;
      setImportingDocx(true);
      setUploadError(null);
      setUploadStatus("Converting Word document…");
      try {
        const { html, warnings } = await docxFileToRichHtml(file, {
          uploadImage: async (imgFile) => {
            const sizeErr = uploadSizeError(imgFile.size);
            if (sizeErr) throw new Error(sizeErr);
            const ext = extFromFilename(imgFile.name);
            const path = buildUploadPath(imgFile, ext);
            setUploadStatus("Uploading images from document…");
            return uploadPublicAsset(getIdToken, path, imgFile);
          },
        });
        ed.chain().focus().setContent(html).run();
        if (warnings.length) {
          setUploadStatus(`Imported with ${warnings.length} conversion warning(s). Review formatting.`);
        } else {
          setUploadStatus("Document imported into the editor.");
        }
        window.setTimeout(() => setUploadStatus(null), 2800);
      } catch (err) {
        setUploadStatus(null);
        setUploadError(err instanceof Error ? err.message : "Failed to import Word document");
      } finally {
        uploadingLockRef.current = false;
        setImportingDocx(false);
      }
    },
    [buildUploadPath, getIdToken, importingDocx],
  );

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => editor?.getHTML() ?? "",
      insertImageFile,
      importDocxFile,
      isEmpty: () => {
        const html = editor?.getHTML() ?? "";
        if (/<img\b/i.test(html)) return false;
        return (editor?.getText() ?? "").trim() === "";
      },
    }),
    [editor, insertImageFile, importDocxFile],
  );

  const openLinkModal = useCallback(() => {
    if (!editor) return;
    const href = editor.getAttributes("link")?.href;
    setLinkModal({ open: true, initial: typeof href === "string" ? href : "" });
  }, [editor]);

  const closeLinkModal = useCallback(() => setLinkModal((m) => ({ ...m, open: false })), []);

  const applyLink = useCallback(
    (url) => {
      if (!editor) return;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      setLinkModal((m) => ({ ...m, open: false }));
    },
    [editor],
  );

  const onFileInputChange = useCallback(
    (e) => {
      const list = e.target.files ? [...e.target.files] : [];
      e.target.value = "";
      void insertImageFiles(list);
    },
    [insertImageFiles],
  );

  const onDocxInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0] ?? null;
      e.target.value = "";
      void importDocxFile(file);
    },
    [importDocxFile],
  );

  const ts = toolbarSurface(isLight);
  const iconCls = "h-[1.15rem] w-[1.15rem] shrink-0";

  /** @param {import("@tiptap/react").Editor} ed */
  const currentTextAlign = (ed) => {
    if (ed.isActive("image")) {
      const ta = ed.getAttributes("image").textAlign;
      if (ta && ["left", "center", "right"].includes(ta)) return ta;
      return "left";
    }
    const fromPara = ed.getAttributes("paragraph").textAlign;
    if (fromPara && ["left", "center", "right"].includes(fromPara)) return fromPara;
    const fromHead = ed.getAttributes("heading").textAlign;
    if (fromHead && ["left", "center", "right"].includes(fromHead)) return fromHead;
    return "left";
  };

  if (!editor) {
    return (
      <div className="rounded-lg border border-white/15 bg-black/20 px-3 py-8 text-center text-[0.85rem] text-[#f4f0fa]/80">
        Loading editor…
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div
          className={`flex w-full flex-wrap items-center gap-1 rounded-lg border p-1.5 ${ts}`}
          role="toolbar"
          aria-label="Formatting"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <ToolbarIconButton
              active={editor.isActive("bold")}
              isLight={isLight}
              idleTone={ts}
              title="Bold"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={editor.isActive("italic")}
              isLight={isLight}
              idleTone={ts}
              title="Italic"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={editor.isActive("underline")}
              isLight={isLight}
              idleTone={ts}
              title="Underline"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>

            <ToolbarDivider />

            <ToolbarIconButton
              active={editor.isActive("heading", { level: 2 })}
              isLight={isLight}
              idleTone={ts}
              title="Heading"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={editor.isActive("bulletList")}
              isLight={isLight}
              idleTone={ts}
              title="Bullet list"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={editor.isActive("orderedList")}
              isLight={isLight}
              idleTone={ts}
              title="Numbered list"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={editor.isActive("link")}
              isLight={isLight}
              idleTone={ts}
              title="Link"
              onClick={openLinkModal}
            >
              <LinkIcon className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>

            <ToolbarDivider />

            <ToolbarIconButton
              active={false}
              isLight={isLight}
              idleTone={ts}
              title="Insert image"
              disabled={uploading || importingDocx}
              onClick={() => {
                setUploadError(null);
                fileInputRef.current?.click();
              }}
            >
              <ImageIcon className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <button
              type="button"
              className={toolbarBtnClass(false, isLight, ts, true)}
              onClick={() => {
                setUploadError(null);
                docxInputRef.current?.click();
              }}
              disabled={uploading || importingDocx}
              title="Import Word (.docx) into the editor"
              aria-label="Import Word document"
            >
              <FileText className={iconCls} strokeWidth={2.25} />
              <span className="hidden sm:inline">{importingDocx ? "Importing…" : "Word"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={onFileInputChange}
            />
            <input
              ref={docxInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={onDocxInputChange}
            />
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1" role="group" aria-label="Text alignment">
            <ToolbarIconButton
              active={currentTextAlign(editor) === "left"}
              isLight={isLight}
              idleTone={ts}
              title="Align left"
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              <AlignLeft className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={currentTextAlign(editor) === "center"}
              isLight={isLight}
              idleTone={ts}
              title="Align center"
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              <AlignCenter className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
            <ToolbarIconButton
              active={currentTextAlign(editor) === "right"}
              isLight={isLight}
              idleTone={ts}
              title="Align right"
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              <AlignRight className={iconCls} strokeWidth={2.25} />
            </ToolbarIconButton>
          </div>
        </div>

        <div
          className={`relative rounded-lg border bg-black/25 transition-colors [&_.ProseMirror]:outline-none [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_li]:my-0.5 [&_.ProseMirror_li_p]:my-0 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:my-1.5 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_img]:max-h-[min(560px,75vh)] [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:object-contain [&_.ProseMirror_img[data-text-align=center]]:mx-auto [&_.ProseMirror_img[data-text-align=right]]:ml-auto [&_.ProseMirror_img[data-text-align=right]]:mr-0 [&_[data-resize-handle]]:z-10 [&_[data-resize-handle]]:m-[-6px] [&_[data-resize-handle]]:size-[14px] [&_[data-resize-handle]]:rounded-sm [&_[data-resize-handle]]:border-2 [&_[data-resize-handle]]:border-[rgba(180,140,228,0.95)] [&_[data-resize-handle]]:bg-[rgba(22,12,38,0.92)] [&_[data-resize-handle]]:shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${
            dragOver ? "border-emerald-300/70 ring-2 ring-emerald-400/35" : "border-white/[0.18]"
          } ${isLight ? "ring-1 ring-white/[0.06]" : ""}`}
          onDragEnter={(e) => {
            if (imageFilesFromDataTransfer(e.dataTransfer).length) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragOver={(e) => {
            if (imageFilesFromDataTransfer(e.dataTransfer).length) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(/** @type {Node} */ (e.relatedTarget))) {
              setDragOver(false);
            }
          }}
          onDrop={(e) => {
            const files = imageFilesFromDataTransfer(e.dataTransfer);
            if (!files.length) return;
            e.preventDefault();
            setDragOver(false);
            void insertImageFiles(files);
          }}
        >
          {dragOver ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-emerald-950/55 backdrop-blur-[1px]">
              <p className="m-0 rounded-lg border border-emerald-300/50 bg-black/50 px-4 py-2 text-[0.9rem] font-semibold text-emerald-100">
                Drop images to upload
              </p>
            </div>
          ) : null}
          <EditorContent editor={editor} />
        </div>

        {uploadStatus ? (
          <p className="m-0 text-[0.8rem] text-[#f4f0fa]/85" role="status">
            {uploadStatus}
          </p>
        ) : null}
        {uploadError ? (
          <p className="m-0 text-[0.8rem] text-red-200" role="alert">
            {uploadError}
          </p>
        ) : !uploadStatus ? (
          <p className="m-0 text-[0.75rem] text-[#f4f0fa]/75">
            Tip: Image button, paste a screenshot, or drag images here. Import Word (.docx) to load a draft. Select an
            image to resize.
          </p>
        ) : null}
      </div>

      <TextInputModal
        open={linkModal.open}
        title={editor.isActive("link") ? "Edit link" : "Add link"}
        description="Paste a full URL (https://… or mailto:…)."
        placeholder="https://example.com/path"
        confirmLabel={editor.isActive("link") ? "Update link" : "Add link"}
        cancelLabel="Cancel"
        initialValue={linkModal.initial}
        isLight={isLight}
        validate={validateLinkUrl}
        onConfirm={applyLink}
        onCancel={closeLinkModal}
      />
    </>
  );
});

RichTextEditor.displayName = "RichTextEditor";

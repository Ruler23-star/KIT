"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { BulletList } from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Check,
  Crop,
  Highlighter,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Pilcrow,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Undo2,
  WrapText,
  X,
} from "lucide-react";

type CropInsets = { top: number; right: number; bottom: number; left: number };
type CropHandle = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

const CROP_HANDLES: CropHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

const StyledBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bulletStyle: {
        default: "disc",
        parseHTML: (element) => element.getAttribute("data-bullet-style") || "disc",
        renderHTML: (attributes) => ({ "data-bullet-style": attributes.bulletStyle }),
      },
    };
  },
});

const InteractiveImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      layout: {
        default: "block",
        parseHTML: (element) => element.getAttribute("data-image-layout") || "block",
        renderHTML: (attributes) => ({ "data-image-layout": attributes.layout || "block" }),
      },
    };
  },
}).configure({
  allowBase64: false,
  inline: false,
  resize: {
    enabled: true,
    directions: ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-left", "bottom-right"],
    minWidth: 80,
    minHeight: 60,
    alwaysPreserveAspectRatio: false,
  },
});

const FormattingMarks = Extension.create({
  name: "formattingMarks",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("formattingMarks"),
      props: {
        decorations(state) {
          const marks: Decoration[] = [];
          state.doc.descendants((node, position) => {
            if (node.type.name === "hardBreak") {
              marks.push(Decoration.widget(position, () => {
                const mark = document.createElement("span");
                mark.className = "formatting-mark hard-break-mark";
                mark.textContent = "↵";
                mark.setAttribute("aria-hidden", "true");
                return mark;
              }, { side: -1 }));
            }
            if (node.isTextblock) {
              marks.push(Decoration.widget(position + node.nodeSize - 1, () => {
                const mark = document.createElement("span");
                mark.className = "formatting-mark paragraph-mark";
                mark.textContent = "¶";
                mark.setAttribute("aria-hidden", "true");
                return mark;
              }, { side: -1 }));
            }
          });
          return DecorationSet.create(state.doc, marks);
        },
      },
    })];
  },
});

type RichEditorProps = {
  content: string;
  onChange: (html: string) => void;
  onCreateIdea: (quote: string) => void;
  onCreateTodo: (quote: string) => void;
};

export function RichEditor({ content, onChange, onCreateIdea, onCreateTodo }: RichEditorProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const pointerSelectingRef = useRef(false);
  const selectionPointerYRef = useRef<number | null>(null);
  const selectionScrollTopRef = useRef(0);
  const selectionScrollTimeRef = useRef(0);
  const correctingSelectionScrollRef = useRef(false);
  const pendingHtmlRef = useRef(content);
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropDragRef = useRef<{
    handle: CropHandle;
    startX: number;
    startY: number;
    width: number;
    height: number;
    insets: CropInsets;
  } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState({ left: 0, top: 0 });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const [imageLayoutOpen, setImageLayoutOpen] = useState(false);
  const [imageMenuPosition, setImageMenuPosition] = useState({ left: 0, top: 0 });
  const [imageRect, setImageRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [cropMode, setCropMode] = useState(false);
  const [cropInsets, setCropInsets] = useState<CropInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState("");
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [showFormattingMarks, setShowFormattingMarks] = useState(false);

  onChangeRef.current = onChange;

  function queueSave(html: string) {
    pendingHtmlRef.current = html;
    if (composingRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const nextHtml = pendingHtmlRef.current;
      lastEmittedHtmlRef.current = nextHtml;
      onChangeRef.current(nextHtml);
    }, 650);
  }

  function syncSelectionUi(current: Editor) {
    const hasSelectedImage = current.isActive("image");
    setImageSelected(hasSelectedImage);
    if (hasSelectedImage) {
      setSelectedText("");
      setAiOpen(false);
      setAiStatus("");
      return;
    }

    setCropMode(false);
    setCropError("");
    setImageLayoutOpen(false);
    const { from, to } = current.state.selection;
    const text = current.state.doc.textBetween(from, to, " ").trim();
    setSelectedText(text);
    if (!text) {
      setAiOpen(false);
      setAiStatus("");
      return;
    }

    const start = current.view.coordsAtPos(from);
    const end = current.view.coordsAtPos(to);
    const left = Math.min(window.innerWidth - 210, Math.max(210, (start.left + end.right) / 2));
    const below = Math.max(start.bottom, end.bottom) + 10;
    const top = below > window.innerHeight - 92 ? Math.min(start.top, end.top) - 58 : below;
    setSelectionPosition({ left, top });
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ bulletList: false }),
      StyledBulletList,
      TextStyle,
      FontSize,
      Highlight.configure({ multicolor: true }),
      InteractiveImage,
      Placeholder.configure({ placeholder: "开始记录你的理解、问题和线索…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      FormattingMarks,
    ],
    content,
    editorProps: {
      attributes: { class: "prose-editor" },
      handleDOMEvents: {
        pointerdown: (_view, event) => {
          if (event.button !== 0) return false;
          pointerSelectingRef.current = true;
          selectionPointerYRef.current = event.clientY;
          selectionScrollTopRef.current = scrollAreaRef.current?.scrollTop ?? 0;
          selectionScrollTimeRef.current = performance.now();
          setSelectedText("");
          setAiOpen(false);
          setAiStatus("");
          return false;
        },
        compositionstart: () => {
          composingRef.current = true;
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
          }
          return false;
        },
        compositionend: () => {
          composingRef.current = false;
          window.setTimeout(() => {
            const current = editorRef.current;
            if (current) queueSave(current.getHTML());
          }, 0);
          return false;
        },
      },
      handlePaste: (_view, event) => {
        const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
        if (!imageFile) return false;
        void uploadImage(imageFile);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      pendingHtmlRef.current = html;
      if (composingRef.current || current.view.composing) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        return;
      }
      queueSave(html);
    },
    onSelectionUpdate: ({ editor: current }) => {
      if (!pointerSelectingRef.current) syncSelectionUi(current);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => { editorRef.current = null; };
  }, [editor]);

  useEffect(() => {
    const trackSelectionPointer = (event: PointerEvent) => {
      if (pointerSelectingRef.current) selectionPointerYRef.current = event.clientY;
    };
    const finishPointerSelection = () => {
      if (!pointerSelectingRef.current) return;
      pointerSelectingRef.current = false;
      selectionPointerYRef.current = null;
      window.requestAnimationFrame(() => {
        const current = editorRef.current;
        if (current) syncSelectionUi(current);
      });
    };
    window.addEventListener("pointermove", trackSelectionPointer);
    window.addEventListener("pointerup", finishPointerSelection);
    window.addEventListener("pointercancel", finishPointerSelection);
    return () => {
      window.removeEventListener("pointermove", trackSelectionPointer);
      window.removeEventListener("pointerup", finishPointerSelection);
      window.removeEventListener("pointercancel", finishPointerSelection);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("image-crop-active", cropMode);
    return () => document.body.classList.remove("image-crop-active");
  }, [cropMode]);

  useEffect(() => {
    document.body.classList.toggle("editor-fullscreen-open", isEditorFullscreen);
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isEditorFullscreen) setIsEditorFullscreen(false);
    };
    window.addEventListener("keydown", exitOnEscape);
    return () => {
      window.removeEventListener("keydown", exitOnEscape);
      document.body.classList.remove("editor-fullscreen-open");
    };
  }, [isEditorFullscreen]);

  function limitSelectionAutoScroll(event: UIEvent<HTMLDivElement>) {
    const area = event.currentTarget;
    if (!pointerSelectingRef.current) return;
    if (correctingSelectionScrollRef.current) {
      if (Math.abs(area.scrollTop - selectionScrollTopRef.current) >= 0.5) {
        area.scrollTop = selectionScrollTopRef.current;
      }
      return;
    }

    const previousTop = selectionScrollTopRef.current;
    const requestedTop = area.scrollTop;
    if (requestedTop <= previousTop) {
      selectionScrollTopRef.current = requestedTop;
      selectionScrollTimeRef.current = performance.now();
      return;
    }

    const pointerY = selectionPointerYRef.current;
    const rect = area.getBoundingClientRect();
    const editorLineHeight = editor ? Number.parseFloat(getComputedStyle(editor.view.dom).lineHeight) : 29;
    const lastLineZone = Math.max(28, (Number.isFinite(editorLineHeight) ? editorLineHeight : 29) * 1.35);
    const reachedLastVisibleLine = pointerY !== null && pointerY >= rect.bottom - lastLineZone;

    const now = performance.now();
    const elapsed = Math.min(32, Math.max(8, now - selectionScrollTimeRef.current));
    const maxStep = reachedLastVisibleLine ? Math.max(1, elapsed * 0.09) : 0;
    const nextTop = Math.min(requestedTop, previousTop + maxStep);

    selectionScrollTopRef.current = nextTop;
    selectionScrollTimeRef.current = now;
    if (Math.abs(requestedTop - nextTop) < 0.5) return;

    correctingSelectionScrollRef.current = true;
    area.scrollTop = nextTop;
    window.requestAnimationFrame(() => {
      correctingSelectionScrollRef.current = false;
    });
  }

  useEffect(() => {
    if (!editor || content === lastEmittedHtmlRef.current) return;
    if (composingRef.current || editor.view.composing || editor.isFocused || timer.current) return;
    if (editor.getHTML() !== content) {
      pendingHtmlRef.current = content;
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    editor?.view.dom.classList.toggle("show-formatting-marks", showFormattingMarks);
  }, [editor, showFormattingMarks]);

  useEffect(() => {
    if (!imageSelected) return;
    const updatePosition = () => {
      const selectedImage = globalThis.document.querySelector<HTMLElement>(".prose-editor [data-resize-container].ProseMirror-selectednode");
      if (!selectedImage) return;
      const rect = selectedImage.getBoundingClientRect();
      const image = selectedImage.querySelector("img");
      const imageBounds = image?.getBoundingClientRect() ?? rect;
      const fitsOnRight = rect.right + 98 <= window.innerWidth;
      const left = fitsOnRight ? rect.right + 10 : Math.max(12, rect.right - 42);
      const top = Math.max(12, Math.min(rect.top + 8, window.innerHeight - 52));
      setImageMenuPosition({ left, top });
      setImageRect({ left: imageBounds.left, top: imageBounds.top, width: imageBounds.width, height: imageBounds.height });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("pointermove", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointermove", updatePosition);
    };
  }, [imageSelected, isEditorFullscreen]);

  useEffect(() => {
    const updateCrop = (event: PointerEvent) => {
      const drag = cropDragRef.current;
      if (!drag) return;

      const horizontalDelta = ((event.clientX - drag.startX) / drag.width) * 100;
      const verticalDelta = ((event.clientY - drag.startY) / drag.height) * 100;
      const minimumWidth = Math.min(80, (44 / drag.width) * 100);
      const minimumHeight = Math.min(80, (44 / drag.height) * 100);
      const next = { ...drag.insets };

      if (drag.handle.includes("left")) {
        next.left = clamp(drag.insets.left + horizontalDelta, 0, 100 - drag.insets.right - minimumWidth);
      }
      if (drag.handle.includes("right")) {
        next.right = clamp(drag.insets.right - horizontalDelta, 0, 100 - drag.insets.left - minimumWidth);
      }
      if (drag.handle.includes("top")) {
        next.top = clamp(drag.insets.top + verticalDelta, 0, 100 - drag.insets.bottom - minimumHeight);
      }
      if (drag.handle.includes("bottom")) {
        next.bottom = clamp(drag.insets.bottom - verticalDelta, 0, 100 - drag.insets.top - minimumHeight);
      }
      setCropInsets(next);
    };
    const finishCrop = () => {
      cropDragRef.current = null;
      document.body.classList.remove("cropping-image");
    };
    window.addEventListener("pointermove", updateCrop);
    window.addEventListener("pointerup", finishCrop);
    window.addEventListener("pointercancel", finishCrop);
    return () => {
      window.removeEventListener("pointermove", updateCrop);
      window.removeEventListener("pointerup", finishCrop);
      window.removeEventListener("pointercancel", finishCrop);
      document.body.classList.remove("cropping-image");
    };
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      editor?.chain().focus().setImage({ src: result.url, alt: file.name }).run();
    } finally {
      setUploading(false);
    }
  }

  async function copyAiPrompt(action: "解释" | "总结" | "提取行动") {
    const instruction = {
      解释: "请解释这段文字的含义、关键概念和上下文，遇到不确定之处请明确指出。",
      总结: "请将这段文字压缩为简洁摘要，并列出最多 3 个关键点。",
      提取行动: "请从这段文字中提取可执行的下一步，给出一个清晰 Todo；先展示，不要保存。",
    }[action];
    const prompt = `${instruction}\n\n选中文字：\n“${selectedText}”`;

    try {
      await navigator.clipboard.writeText(prompt);
      setAiStatus(`“${action}”指令已复制，请粘贴到 Codex 对话中发送`);
    } catch {
      setAiStatus("无法自动复制，请在 Codex 对话中说：分析我刚才选中的文字");
    }
  }

  if (!editor) return <div className="editor-loading">正在打开编辑器…</div>;

  const tools = [
    { label: "一级标题", icon: Heading1, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
    { label: "二级标题", icon: Heading2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
    { label: "粗体", icon: Bold, run: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { label: "斜体", icon: Italic, run: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { label: "删除线", icon: Strikethrough, run: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike") },
    { label: "项目列表", icon: List, run: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { label: "编号列表", icon: ListOrdered, run: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { label: "引用段落：标注原文或他人观点", icon: Quote, run: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
  ];

  function setBulletStyle(style: string) {
    const chain = editor!.chain().focus();
    if (!editor!.isActive("bulletList")) chain.toggleBulletList();
    chain.updateAttributes("bulletList", { bulletStyle: style }).run();
  }

  function setImageLayout(layout: "block" | "center" | "float-left" | "float-right") {
    editor!.chain().focus().updateAttributes("image", { layout }).run();
    setImageLayoutOpen(false);
  }

  function startImageCrop() {
    setImageLayoutOpen(false);
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    setCropError("");
    setCropMode(true);
  }

  function toggleEditorFullscreen() {
    setCropMode(false);
    setImageLayoutOpen(false);
    setSelectedText("");
    setIsEditorFullscreen((fullscreen) => !fullscreen);
    window.requestAnimationFrame(() => editor?.commands.focus());
  }

  function beginCropDrag(handle: CropHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      width: Math.max(1, imageRect.width),
      height: Math.max(1, imageRect.height),
      insets: cropInsets,
    };
    document.body.classList.add("cropping-image");
  }

  async function applyImageCrop() {
    const selectedImage = globalThis.document.querySelector<HTMLElement>(".prose-editor [data-resize-container].ProseMirror-selectednode");
    const image = selectedImage?.querySelector<HTMLImageElement>("img");
    if (!image || !editor) return;

    const visibleWidth = 100 - cropInsets.left - cropInsets.right;
    const visibleHeight = 100 - cropInsets.top - cropInsets.bottom;
    if (visibleWidth >= 99.9 && visibleHeight >= 99.9) {
      setCropMode(false);
      return;
    }

    setCropBusy(true);
    setCropError("");
    try {
      const response = await fetch(image.currentSrc || image.src);
      if (!response.ok) throw new Error("无法读取图片");
      const originalBlob = await response.blob();
      const bitmap = await createImageBitmap(originalBlob);
      const sourceX = Math.round(bitmap.width * cropInsets.left / 100);
      const sourceY = Math.round(bitmap.height * cropInsets.top / 100);
      const sourceWidth = Math.max(1, Math.round(bitmap.width * visibleWidth / 100));
      const sourceHeight = Math.max(1, Math.round(bitmap.height * visibleHeight / 100));
      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法创建裁剪画布");
      context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      bitmap.close();

      const outputType = ["image/jpeg", "image/png", "image/webp"].includes(originalBlob.type) ? originalBlob.type : "image/png";
      const croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成裁剪图片")), outputType, 0.94);
      });
      const extension = outputType === "image/jpeg" ? "jpg" : outputType.split("/")[1];
      const form = new FormData();
      form.append("file", new File([croppedBlob], `cropped-image.${extension}`, { type: outputType }));
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: form });
      const result = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(result.error || "裁剪图片保存失败");

      editor.chain().focus().updateAttributes("image", { src: result.url }).run();
      setCropMode(false);
    } catch (error) {
      setCropError(error instanceof Error ? error.message : "图片裁剪失败");
    } finally {
      setCropBusy(false);
    }
  }

  return (
    <div className={isEditorFullscreen ? "editor-frame editor-fullscreen" : "editor-frame"}>
      <div className="editor-toolbar">
        <label className="toolbar-select font-size-select" title="字号大小">
          <span>字号</span>
          <select
            aria-label="字号大小"
            value={editor.getAttributes("textStyle").fontSize || ""}
            onChange={(event) => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}
          >
            <option value="">默认</option>
            <option value="12px">12</option>
            <option value="14px">14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="24px">24</option>
            <option value="32px">32</option>
          </select>
        </label>
        {tools.map(({ label, icon: Icon, run, active }) => (
          <button key={label} title={label} aria-label={label} className={active ? "active" : ""} onClick={run}><Icon size={17} /></button>
        ))}
        <label className="toolbar-select" title="选择项目符号样式">
          <List size={15} />
          <select aria-label="项目符号样式" defaultValue="disc" onChange={(event) => setBulletStyle(event.target.value)}>
            <option value="disc">• 实心圆</option>
            <option value="circle">○ 空心圆</option>
            <option value="square">■ 方块</option>
            <option value="arrow">→ 箭头</option>
            <option value="check">✓ 对勾</option>
          </select>
        </label>
        <label className="toolbar-select highlight-select" title="文字高亮">
          <Highlighter size={15} />
          <select
            aria-label="文字高亮"
            value={editor.getAttributes("highlight").color || ""}
            onChange={(event) => event.target.value ? editor.chain().focus().setHighlight({ color: event.target.value }).run() : editor.chain().focus().unsetHighlight().run()}
          >
            <option value="">无高亮</option>
            <option value="#fff09a">黄色</option>
            <option value="#ccefcf">绿色</option>
            <option value="#cfe8ff">蓝色</option>
            <option value="#ffd5e5">粉色</option>
          </select>
        </label>
        <span className="toolbar-divider" />
        <button title="撤销" aria-label="撤销" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></button>
        <button title="恢复" aria-label="恢复" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></button>
        <button title="插入图片" aria-label="插入图片" onClick={() => fileRef.current?.click()}><ImagePlus size={17} /></button>
        <button className={showFormattingMarks ? "active" : ""} title="显示/隐藏回车符号" aria-label="显示/隐藏回车符号" onClick={() => setShowFormattingMarks((visible) => !visible)}><Pilcrow size={17} /></button>
        <button
          className="editor-fullscreen-toggle"
          title={isEditorFullscreen ? "退出正文全屏（Esc）" : "正文全屏"}
          aria-label={isEditorFullscreen ? "退出正文全屏" : "正文全屏"}
          aria-pressed={isEditorFullscreen}
          onClick={toggleEditorFullscreen}
        >
          {isEditorFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void uploadImage(event.target.files[0])} />
        {uploading && <span className="save-state">正在保存图片…</span>}
      </div>

      {imageSelected && (
        <div className="image-layout-control" style={{ left: imageMenuPosition.left, top: imageMenuPosition.top }}>
          <button className={imageLayoutOpen ? "active" : ""} aria-label="图片布局选项" title="图片布局选项" onClick={() => { setCropMode(false); setImageLayoutOpen((open) => !open); }}><WrapText size={21} /></button>
          <button className={cropMode ? "active" : ""} aria-label="裁剪图片" title="裁剪图片" onClick={startImageCrop}><Crop size={20} /></button>
          {imageLayoutOpen && <div className="image-layout-popover">
            <strong>文字环绕</strong>
            <button className={(editor.getAttributes("image").layout || "block") === "block" ? "active" : ""} onClick={() => setImageLayout("block")}><span className="layout-preview inline" />嵌入型</button>
            <button className={editor.getAttributes("image").layout === "center" ? "active" : ""} onClick={() => setImageLayout("center")}><span className="layout-preview center" />上下型</button>
            <button className={editor.getAttributes("image").layout === "float-left" ? "active" : ""} onClick={() => setImageLayout("float-left")}><span className="layout-preview left" />四周型 · 左</button>
            <button className={editor.getAttributes("image").layout === "float-right" ? "active" : ""} onClick={() => setImageLayout("float-right")}><span className="layout-preview right" />四周型 · 右</button>
          </div>}
        </div>
      )}

      {cropMode && imageRect.width > 0 && createPortal(<>
        <div
          className="image-crop-overlay"
          style={{ left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height }}
          aria-label="图片裁剪区域"
        >
          <div
            className="image-crop-frame"
            style={{ inset: `${cropInsets.top}% ${cropInsets.right}% ${cropInsets.bottom}% ${cropInsets.left}%` }}
          >
            {CROP_HANDLES.map((handle) => (
              <button
                key={handle}
                className={`image-crop-handle ${handle}`}
                aria-label={`调整裁剪区域：${handle}`}
                onPointerDown={(event) => beginCropDrag(handle, event)}
              />
            ))}
          </div>
        </div>
        <div
          className="image-crop-actions"
          style={{
            left: clamp(imageRect.left + imageRect.width / 2, 98, window.innerWidth - 98),
            top: imageRect.top + imageRect.height + 52 < window.innerHeight ? imageRect.top + imageRect.height + 10 : Math.max(10, imageRect.top - 48),
          }}
          onPointerDown={(event) => event.preventDefault()}
        >
          <button disabled={cropBusy} onClick={() => { setCropMode(false); setCropError(""); }}><X size={15} />取消</button>
          <button className="primary" disabled={cropBusy} onClick={() => void applyImageCrop()}><Check size={15} />{cropBusy ? "处理中…" : "完成裁剪"}</button>
          {cropError && <span title={cropError}>{cropError}</span>}
        </div>
      </>, document.body)}

      {selectedText && (
        <div
          className="selection-actions"
          style={{ left: selectionPosition.left, top: selectionPosition.top }}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="selection-actions-row">
            <span title={selectedText}><MessageSquareText size={15} /> 已选择“{selectedText.slice(0, 24)}{selectedText.length > 24 ? "…" : ""}”</span>
            <button onClick={() => onCreateIdea(selectedText)}><Lightbulb size={15} /> 灵感</button>
            <button onClick={() => onCreateTodo(selectedText)}><List size={15} /> Todo</button>
            <button className={aiOpen ? "active" : ""} onClick={() => { setAiOpen((open) => !open); setAiStatus(""); }}><Sparkles size={15} /> AI</button>
          </div>
          {aiOpen && (
            <div className="selection-ai-panel">
              <strong>让 AI 如何处理这段文字？</strong>
              <div>
                <button onClick={() => void copyAiPrompt("解释")}>解释</button>
                <button onClick={() => void copyAiPrompt("总结")}>总结</button>
                <button onClick={() => void copyAiPrompt("提取行动")}>提取 Todo</button>
              </div>
              <small>{aiStatus || "选择后会复制完整指令，再粘贴到右侧 Codex 对话中发送。"}</small>
            </div>
          )}
        </div>
      )}

      <div ref={scrollAreaRef} className="editor-scroll-area" onScroll={limitSelectionAutoScroll}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

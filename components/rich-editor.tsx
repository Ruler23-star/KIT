"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
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
  Highlighter,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  MessageSquareText,
  Pilcrow,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Undo2,
  WrapText,
} from "lucide-react";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState({ left: 0, top: 0 });
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const [imageLayoutOpen, setImageLayoutOpen] = useState(false);
  const [imageMenuPosition, setImageMenuPosition] = useState({ left: 0, top: 0 });
  const [showFormattingMarks, setShowFormattingMarks] = useState(false);

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
      handlePaste: (_view, event) => {
        const imageFile = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
        if (!imageFile) return false;
        void uploadImage(imageFile);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(current.getHTML()), 650);
    },
    onSelectionUpdate: ({ editor: current }) => {
      const hasSelectedImage = current.isActive("image");
      setImageSelected(hasSelectedImage);
      if (hasSelectedImage) {
        setSelectedText("");
        setAiOpen(false);
        setAiStatus("");
        return;
      }
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
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false });
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
      const fitsOnRight = rect.right + 54 <= window.innerWidth;
      const left = fitsOnRight ? rect.right + 10 : Math.max(12, rect.right - 42);
      const top = Math.max(12, Math.min(rect.top + 8, window.innerHeight - 52));
      setImageMenuPosition({ left, top });
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
  }, [imageSelected]);

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

  return (
    <div className="editor-frame">
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
        <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && void uploadImage(event.target.files[0])} />
        {uploading && <span className="save-state">正在保存图片…</span>}
      </div>

      {imageSelected && (
        <div className="image-layout-control" style={{ left: imageMenuPosition.left, top: imageMenuPosition.top }}>
          <button className={imageLayoutOpen ? "active" : ""} aria-label="图片布局选项" title="图片布局选项" onClick={() => setImageLayoutOpen((open) => !open)}><WrapText size={21} /></button>
          {imageLayoutOpen && <div className="image-layout-popover">
            <strong>文字环绕</strong>
            <button className={(editor.getAttributes("image").layout || "block") === "block" ? "active" : ""} onClick={() => setImageLayout("block")}><span className="layout-preview inline" />嵌入型</button>
            <button className={editor.getAttributes("image").layout === "center" ? "active" : ""} onClick={() => setImageLayout("center")}><span className="layout-preview center" />上下型</button>
            <button className={editor.getAttributes("image").layout === "float-left" ? "active" : ""} onClick={() => setImageLayout("float-left")}><span className="layout-preview left" />四周型 · 左</button>
            <button className={editor.getAttributes("image").layout === "float-right" ? "active" : ""} onClick={() => setImageLayout("float-right")}><span className="layout-preview right" />四周型 · 右</button>
          </div>}
        </div>
      )}

      {selectedText && (
        <div
          className="selection-actions"
          style={{ left: selectionPosition.left, top: selectionPosition.top }}
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

      <EditorContent editor={editor} />
    </div>
  );
}

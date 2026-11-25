"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { Image as ImageIcon, Plus, X, ChevronLeft, ChevronRight, WrapText } from "lucide-react";

type ComparisonImage = { id: string; src: string; label: string; description: string };
export function ComparisonIcon() {
  return <span className="comparison-icon"><ImageIcon size={16} /><ImageIcon size={16} /></span>;
}

function ComparisonView({ node, updateAttributes, selected }: NodeViewProps) {
  const images = node.attrs.images as ComparisonImage[];
  const [mode, setMode] = useState<"closed" | "edit" | "view">("closed");
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [layoutOpen, setLayoutOpen] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number } | null>(null);
  const draggedRef = useRef(false);
  const wheelRef = useRef({ delta: 0, time: 0 });
  const visible = images.filter((image) => image.src);
  const active = Math.max(0, visible.findIndex((image) => image.id === activeId));
  const commit = (next: ComparisonImage[]) => updateAttributes({ images: next });
  const change = (id: string, patch: Partial<ComparisonImage>) => commit(images.map((image) => image.id === id ? { ...image, ...patch } : image));
  const move = (index: number, direction: number) => {
    const next = [...images];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    commit(next);
  };
  async function upload(file: File, id: string) {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "上传失败");
      change(id, { src: result.url });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上传失败，请重试"); }
    finally { setBusy(false); }
  }
  function switchImage(direction: number, loop = true) {
    if (visible.length < 2) return;
    setActiveId((current) => {
      const index = Math.max(0, visible.findIndex((image) => image.id === current));
      const next = loop
        ? ((index + direction) % visible.length + visible.length) % visible.length
        : Math.max(0, Math.min(visible.length - 1, index + direction));
      return visible[next].id;
    });
  }
  return <NodeViewWrapper className={`comparison-node comparison-layout-${node.attrs.layout || "center"} ${selected ? "selected" : ""}`} contentEditable={false}>
    {selected && <div className="comparison-layout-options" contentEditable={false} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => event.stopPropagation()}>
      <button className={`comparison-layout-toggle ${layoutOpen ? "active" : ""}`} aria-label="图片布局选项" title="图片布局选项" onClick={(event) => { event.stopPropagation(); setLayoutOpen((open) => !open); }}><WrapText size={21} /></button>
      {layoutOpen && <div className="image-layout-popover"><strong>图片布局</strong>{([{ value: "block", label: "嵌入型", preview: "inline" }, { value: "center", label: "居中", preview: "center" }]).map(({ value, label, preview }) => <button type="button" key={value} className={(node.attrs.layout || "center") === value ? "active" : ""} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); updateAttributes({ layout: value }); setLayoutOpen(false); }} onClick={(event) => { event.stopPropagation(); if (event.detail === 0) { updateAttributes({ layout: value }); setLayoutOpen(false); } }}><span className={`layout-preview ${preview}`} />{label}</button>)}</div>}
    </div>}
    <button className="comparison-placeholder" data-drag-handle onClick={() => setMode("edit")} aria-label="编辑多图片对比">
      <span /><span /><span>{visible.length ? <img draggable={false} src={visible[active]?.src} alt={visible[active]?.label || "图片对比"} /> : <Plus size={26} />}</span>
    </button>
    {mode !== "closed" && createPortal(<div className="comparison-backdrop" onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setMode("closed"); }}>
      <section className={`comparison-dialog ${mode === "view" ? "comparison-view-dialog" : ""}`} role="dialog" aria-modal="true" aria-label="多图片对比" tabIndex={0} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") setMode("closed");
        if (mode === "view") {
          if (event.key === "ArrowLeft") { event.preventDefault(); switchImage(-1); }
          if (event.key === "ArrowRight") { event.preventDefault(); switchImage(1); }
        }
      }}>
        <header style={{ justifyContent: "flex-end" }}><div>{mode === "view" && <button onClick={() => setMode("edit")}>编辑图片</button>}<button autoFocus aria-label="关闭" onClick={() => setMode("closed")}><X size={18} /></button></div></header>
        {mode === "edit" ? <><div className="comparison-grid">{images.map((image, index) => <section key={image.id} className="comparison-unit">
          <input aria-label="图片标签" placeholder="添加标签" value={image.label} onChange={(event) => change(image.id, { label: event.target.value })} />
          {image.src ? <button className="comparison-thumbnail" onClick={() => { setActiveId(image.id); setMode("view"); }}><img src={image.src} alt={image.label || "查看图片"} onError={(event) => { event.currentTarget.alt = "图片加载失败，可替换图片"; }} /></button> : <label className="comparison-upload"><Plus size={22} /><input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, image.id); }} /></label>}
          <textarea aria-label="图片解释" placeholder="添加解释文字…" value={image.description} onChange={(event) => change(image.id, { description: event.target.value })} />
          <div className="comparison-unit-actions"><label>替换<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, image.id); }} /></label><button disabled={index === 0 || busy} onClick={() => move(index, -1)} aria-label="前移">←</button><button disabled={index === images.length - 1 || busy} onClick={() => move(index, 1)} aria-label="后移">→</button><button disabled={busy} onClick={() => commit(images.filter((item) => item.id !== image.id))}>删除</button></div>
        </section>)}</div><footer><button disabled={images.length >= 30 || busy} onClick={() => commit([...images, { id: crypto.randomUUID(), src: "", label: "", description: "" }])}><Plus size={16} /> 添加图片</button><span>{busy ? "正在上传…" : error || "最多 30 张"}</span></footer></> : <>
          <div className="comparison-stage" style={{ cursor: "grab", userSelect: "none", touchAction: "pan-y" }}
            onWheel={(event) => {
              if (event.ctrlKey) return;
              event.stopPropagation();
              const now = performance.now();
              const wheel = wheelRef.current;
              if (now - wheel.time > 180) wheel.delta = 0;
              wheel.time = now;
              const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
              const normalized = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
              if (Math.sign(normalized) !== Math.sign(wheel.delta)) wheel.delta = 0;
              wheel.delta += normalized;
              if (Math.abs(wheel.delta) >= 60) {
                switchImage(Math.sign(wheel.delta));
                wheel.delta = 0;
              }
            }}
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragRef.current = { pointerId: event.pointerId, x: event.clientX };
              draggedRef.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              const delta = event.clientX - drag.x;
              const steps = Math.trunc(delta / 60);
              if (!steps) return;
              draggedRef.current = true;
              drag.x += steps * 60;
              switchImage(-steps, false);
            }}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onLostPointerCapture={() => { dragRef.current = null; }}
            onClickCapture={(event) => { if (draggedRef.current) { event.preventDefault(); event.stopPropagation(); draggedRef.current = false; } }}
          ><div className="comparison-fan">{visible.map((image, index) => {
            const distance = index - active;
            return <button key={image.id} className="comparison-card" aria-label={image.label || `图片 ${index + 1}`} onClick={() => setActiveId(image.id)} style={{ transform: `translateX(${Math.max(-3, Math.min(3, distance)) * 25}%) translateY(${Math.min(3, Math.abs(distance)) * 12}px) rotate(${Math.max(-3, Math.min(3, distance)) * 9}deg) scale(${1 - Math.min(3, Math.abs(distance)) * .1})`, zIndex: visible.length - Math.abs(distance), visibility: Math.abs(distance) > 3 ? "hidden" : "visible" }}><strong>{image.label || "\u00a0"}</strong><img src={image.src} alt={image.label || "对比图片"} onError={(event) => { event.currentTarget.alt = "图片加载失败，请返回编辑并替换"; }} /></button>;
          })}</div></div><div className="comparison-navigation"><button disabled={visible.length < 2} onClick={() => switchImage(-1)} aria-label="上一张"><ChevronLeft /></button><span>{active + 1} / {visible.length}</span><button disabled={visible.length < 2} onClick={() => switchImage(1)} aria-label="下一张"><ChevronRight /></button></div><p className="comparison-description">{visible[active]?.description}</p>
        </>}
      </section>
    </div>, document.body)}
  </NodeViewWrapper>;
}

export const ImageComparison = Node.create({
  name: "imageComparison", group: "block", atom: true, draggable: true,
  addAttributes() { return { layout: { default: "center", parseHTML: (element) => element.getAttribute("data-comparison-layout") || "center", renderHTML: (attributes) => ({ "data-comparison-layout": attributes.layout }) }, images: { default: [], parseHTML: (element) => { try { const value = JSON.parse(element.getAttribute("data-images") || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }, renderHTML: (attributes) => ({ "data-images": JSON.stringify(attributes.images) }) } }; },
  parseHTML() { return [{ tag: "div[data-image-comparison]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-image-comparison": "true" })]; },
  addNodeView() { return ReactNodeViewRenderer(ComparisonView); },
});

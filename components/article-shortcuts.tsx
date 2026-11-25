"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KnowledgeDocument } from "@/types/workspace";

export const ARTICLE_DRAG_TYPE = "application/x-kit-article";
const STORAGE = "kit:article-shortcuts";
const COLOR_STORAGE = "kit:article-shortcut-colors";
const pastelHues = [211, 35, 148, 272, 340, 182, 66, 5];

export function ArticleShortcuts({ documents, activeId, onOpen }: {
  documents: KnowledgeDocument[];
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [colorSlots, setColorSlots] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [over, setOver] = useState(false);
  const areaRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const gapRef = useRef<string | null>(null);
  const [gap, setGap] = useState<string | null>(null);
  const skipClick = useRef(false);
  const [tip, setTip] = useState<{ id: string; left: number; top: number } | null>(null);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
      if (Array.isArray(value)) setIds([...new Set(value.filter((id): id is string => typeof id === "string"))]);
      const savedColors: unknown = JSON.parse(localStorage.getItem(COLOR_STORAGE) ?? "{}");
      if (savedColors && typeof savedColors === "object") {
        setColorSlots(Object.fromEntries(Object.entries(savedColors).filter(([, slot]) => Number.isSafeInteger(slot) && slot >= 0)));
      }
    } catch { /* Ignore invalid saved preferences. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE, JSON.stringify(ids));
  }, [ids, ready]);
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const colorOrder = [...ids].sort();
  useEffect(() => {
    if (!ready) return;
    const next = Object.fromEntries(ids.filter((id) => Object.hasOwn(colorSlots, id)).map((id) => [id, colorSlots[id]]));
    const used = new Set(Object.values(next));
    for (const id of [...ids].sort()) {
      if (Object.hasOwn(next, id)) continue;
      let slot = 0;
      while (used.has(slot)) slot++;
      next[id] = slot;
      used.add(slot);
    }
    if (Object.keys(next).length !== Object.keys(colorSlots).length || ids.some((id) => !Object.hasOwn(colorSlots, id))) setColorSlots(next);
    localStorage.setItem(COLOR_STORAGE, JSON.stringify(next));
  }, [ids, ready, colorSlots]);
  useEffect(() => {
    const sidebar = areaRef.current?.closest(".sidebar");
    if (!sidebar) return;
    const insideSidebar = ({ clientX, clientY }: DragEvent) => {
      const { left, right, top, bottom } = sidebar.getBoundingClientRect();
      return clientX >= left && clientX < right && clientY >= top && clientY < bottom;
    };
    const onDragOver = (event: DragEvent) => {
      const transfer = event.dataTransfer;
      if (!transfer?.types.includes(ARTICLE_DRAG_TYPE)) return;
      const inside = insideSidebar(event);
      setOver(inside);
      if (!inside) return;
      event.preventDefault();
      event.stopPropagation();
      transfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      setOver(false);
      if (!insideSidebar(event)) return;
      const id = event.dataTransfer?.getData(ARTICLE_DRAG_TYPE);
      if (!documents.some((doc) => doc.id === id) || !id) return;
      event.preventDefault();
      event.stopPropagation();
      setIds((current) => current.includes(id) ? current : [...current, id]);
    };
    const reset = () => setOver(false);
    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("drop", onDrop, true);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("dragend", reset);
    };
  }, [documents]);
  const title = tip && byId.get(tip.id)?.title;
  function reorder(from: string, to: string) {
    setIds((current) => {
      const source = current.indexOf(from);
      const target = current.indexOf(to);
      if (source < 0 || target < 0 || source === target) return current;
      const next = [...current];
      [next[source], next[target]] = [next[target], next[source]];
      return next;
    });
  }
  return <section ref={areaRef} className={`article-shortcuts ${over ? "drop-active" : ""}`} aria-label="文章快捷区">
    {ids.filter((id) => byId.has(id)).map((id) => {
      const doc = byId.get(id)!;
      const showTitle = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        setTip({ id, left: bounds.right + 10, top: bounds.top + bounds.height / 2 });
      };
      const colorIndex = colorSlots[id] ?? colorOrder.indexOf(id);
      const hue = pastelHues[colorIndex % pastelHues.length];
      const lightness = Math.max(62, 80 - Math.floor(colorIndex / pastelHues.length) * 7);
      const color = `hsl(${hue} 74% ${lightness}%)`;
      return <button type="button" key={id} data-shortcut-id={id} data-insert-before={gap === id || undefined} className="article-shortcut" aria-label={doc.title} aria-current={activeId === id ? "true" : undefined}
        style={{ backgroundColor: color }} onClick={(event) => {
          if (event.detail && skipClick.current) return;
          if (event.detail <= 1) onOpen(id);
        }}
        onDoubleClick={() => {
          if (skipClick.current) return;
          setTip(null);
          const visibleIds = ids.filter((item) => byId.has(item));
          const index = visibleIds.indexOf(id);
          const nextId = visibleIds[index + 1] ?? visibleIds[index - 1];
          setIds((current) => current.filter((item) => item !== id));
          if (nextId) onOpen(nextId);
        }}
        onMouseEnter={(event) => showTitle(event.currentTarget)} onMouseLeave={() => setTip(null)}
        onFocus={(event) => showTitle(event.currentTarget)} onBlur={() => setTip(null)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          skipClick.current = false;
          drag.current = { y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = drag.current;
          if (!gesture || Math.abs(event.clientY - gesture.y) < 5 && !gesture.moved) return;
          gesture.moved = true;
          skipClick.current = true;
          setTip(null);
          const button = event.currentTarget;
          const area = button.parentElement!.getBoundingClientRect();
          const bounds = button.getBoundingClientRect();
          const offset = Number.parseFloat(button.style.translate.split(" ")[1]) || 0;
          const dy = Math.max(area.top - bounds.top + offset, Math.min(area.bottom - bounds.bottom + offset, event.clientY - gesture.y));
          button.style.translate = `0px ${dy}px`;
          const dots = Array.from(button.parentElement!.querySelectorAll<HTMLElement>("[data-shortcut-id]"));
          let nextGap: string | null = null;
          for (let index = 1; index < dots.length; index++) {
            const previous = dots[index - 1];
            const next = dots[index];
            if (previous === button || next === button) continue;
            if (event.clientY >= previous.getBoundingClientRect().bottom && event.clientY <= next.getBoundingClientRect().top) {
              nextGap = next.dataset.shortcutId ?? null;
              break;
            }
          }
          gapRef.current = nextGap;
          setGap(nextGap);
        }}
        onPointerUp={(event) => {
          const moved = drag.current?.moved;
          drag.current = null;
          const button = event.currentTarget;
          const bounds = button.getBoundingClientRect();
          const y = bounds.top + bounds.height / 2;
          button.style.translate = "";
          const insertion = gapRef.current;
          gapRef.current = null;
          setGap(null);
          if (!moved) return;
          if (insertion) {
            setIds((current) => {
              const next = current.filter((item) => item !== id);
              const index = next.indexOf(insertion);
              if (index < 0) return current;
              next.splice(index, 0, id);
              return next;
            });
            return;
          }
          let closest = Infinity;
          let target = id;
          for (const candidate of button.parentElement!.querySelectorAll<HTMLElement>("[data-shortcut-id]")) {
            const rect = candidate.getBoundingClientRect();
            const distance = Math.abs(y - rect.top - rect.height / 2);
            if (distance < closest) { closest = distance; target = candidate.dataset.shortcutId!; }
          }
          reorder(id, target);
        }}
        onLostPointerCapture={(event) => {
          drag.current = null;
          gapRef.current = null;
          setGap(null);
          event.currentTarget.style.translate = "";
        }} />;
    })}
    {title && tip && createPortal(<span className="article-shortcut-title" style={{ left: tip.left, top: tip.top }}>{title}</span>, document.body)}
  </section>;
}

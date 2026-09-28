"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText, BrainCircuit, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Circle, Clock3, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Lightbulb, Link2, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PencilLine, Plus, Search,
  Sparkles, Trash2, X,
} from "lucide-react";
import { RichEditor } from "./rich-editor";
import { WebMcpTools } from "./webmcp-tools";
import { collectTopTags, stripHtml } from "@/lib/knowledge-utils";
import type { Idea, KnowledgeDocument, KnowledgeFolder, Todo, TodoStatus, WorkspaceData } from "@/types/workspace";

type View = "dashboard" | "knowledge" | "ideas" | "todos" | "framework";
type Entity = "document" | "folder" | "idea" | "todo";
type Mutate = (entity: Entity, action: "create" | "update" | "delete", id?: string, payload?: Record<string, unknown>) => Promise<unknown>;

const emptyWorkspace: WorkspaceData = { folders: [], documents: [], ideas: [], todos: [] };
const navItems: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: "dashboard", label: "今日任务", icon: CalendarDays },
  { id: "knowledge", label: "知识记录", icon: BookOpenText },
  { id: "ideas", label: "灵感记录", icon: Lightbulb },
  { id: "todos", label: "Todo", icon: CheckCircle2 },
  { id: "framework", label: "知识框架梳理", icon: BrainCircuit },
];

export function WorkspaceShell() {
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [view, setView] = useState<View>("dashboard");
  const previousNonFrameworkView = useRef<View>("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取本地数据");
    const workspace = (await response.json()) as WorkspaceData;
    setData(workspace);
    setActiveDocumentId((current) => current && workspace.documents.some((item) => item.id === current) ? current : workspace.documents[0]?.id ?? null);
    setActiveTodoId((current) => current && workspace.todos.some((item) => item.id === current) ? current : workspace.todos[0]?.id ?? null);
  }, []);

  useEffect(() => { loadData().catch((error) => setNotice(error.message)).finally(() => setLoading(false)); }, [loadData]);
  useEffect(() => {
    if (view !== "framework") previousNonFrameworkView.current = view;
  }, [view]);
  useEffect(() => {
    const refresh = () => void loadData();
    window.addEventListener("workspace:changed", refresh);
    return () => window.removeEventListener("workspace:changed", refresh);
  }, [loadData]);
  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const scheduleNextDayRefresh = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(() => {
        void loadData().catch((error) => setNotice(error.message)).finally(() => {
          if (!cancelled) scheduleNextDayRefresh();
        });
      }, nextDay.getTime() - now.getTime());
    };
    scheduleNextDayRefresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [loadData]);

  const mutate = useCallback<Mutate>(async (entity, action, id, payload = {}) => {
    setSaving(true);
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, action, id, data: payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      await loadData();
      return result.result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
      throw error;
    } finally { setSaving(false); }
  }, [loadData]);

  const counts = {
    dashboard: data.todos.filter((item) => item.isToday).length,
    knowledge: data.documents.length,
    ideas: data.ideas.length,
    todos: data.todos.filter((item) => item.status !== "completed").length,
    framework: 0,
  };
  const filteredDocuments = data.documents.filter((item) => `${item.title} ${stripHtml(item.content)}`.toLowerCase().includes(search.toLowerCase()));
  const activeDocument = data.documents.find((item) => item.id === activeDocumentId) ?? null;

  async function createDocument(folderId: string | null = null) {
    const baseTitle = "未命名知识";
    const existingTitles = new Set(data.documents.map((document) => document.title));
    let title = baseTitle;
    let suffix = 2;
    while (existingTitles.has(title)) title = `${baseTitle} ${suffix++}`;
    const created = await mutate("document", "create", undefined, { title, folderId }) as KnowledgeDocument;
    setActiveDocumentId(created.id); setView("knowledge");
    setNotice("新知识文档已创建，可直接修改标题和正文。");
  }
  async function createIdeaFromQuote(quote: string, documentId?: string) {
    const content = window.prompt("记录由这段内容产生的灵感", "")?.trim();
    if (!content) return;
    await mutate("idea", "create", undefined, { title: content.length > 28 ? `${content.slice(0, 28)}…` : content, originalContent: content, sourceDocumentId: documentId ?? null, sourceQuote: quote || null });
    setNotice("灵感已保存，并保留了原文来源。");
  }
  async function createTodoFromSource(titleSeed: string, source: Partial<Todo> = {}) {
    const title = window.prompt("Todo 标题", titleSeed)?.trim();
    if (!title) return;
    await mutate("todo", "create", undefined, { title, isToday: true, priority: "medium", ...source });
    setNotice("Todo 已加入今日任务。");
  }

  if (loading) return <main className="loading-screen"><LoaderCircle className="spin" /><strong>正在打开本地知识库</strong></main>;

  return (
    <main className="app-shell">
      <WebMcpTools />
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><img src="/kit-icon.png" alt="" /></span><div><img className="brand-wordmark" src="/kit-wordmark-green-large.png" alt="KIT" /><span>knowledge · idea · todo</span></div></div>
        <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索" placeholder="搜索全部内容" /></label>
        <nav className="nav-list" aria-label="主要导航">{navItems.map(({ id, label, icon: Icon }) => <button className={view === id ? "nav-item active" : "nav-item"} key={id} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span>{counts[id] > 0 && <span className="nav-count">{counts[id]}</span>}</button>)}</nav>
        <div className="flow-card"><span>核心循环</span><strong>Capture → Organize → Connect → Act → Review</strong><p>{data.todos.filter((item) => item.status !== "completed").length} 项行动正在推动知识继续生长</p></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><span className="eyebrow">个人工作台</span><h1>{navItems.find((item) => item.id === view)?.label}</h1></div><div className="top-actions">{saving && <span className="save-state"><LoaderCircle className="spin" size={15} /> 正在保存</span>}<button className="ghost-button" onClick={() => setView(view === "framework" ? previousNonFrameworkView.current : "framework")}><Sparkles size={17} /> 与 AI 一起梳理</button></div></header>
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div>}
        {view === "dashboard" && <Dashboard data={data} mutate={mutate} onOpen={(id) => { setActiveTodoId(id); setView("todos"); }} onNavigate={setView} />}
        {view === "knowledge" && <KnowledgeView folders={data.folders} documents={filteredDocuments} activeDocument={activeDocument} onSelect={setActiveDocumentId} onCreate={createDocument} onCreateFolder={(name, parentId) => mutate("folder", "create", undefined, { name, parentId })} onRenameFolder={(id, name) => mutate("folder", "update", id, { name })} onUpdate={(id, payload) => mutate("document", "update", id, payload)} onDelete={async (id) => { const document = data.documents.find((item) => item.id === id); if (window.confirm(`确定删除“${document?.title ?? "这篇知识记录"}”吗？关联内容会保留，但来源将变为空。`)) await mutate("document", "delete", id); }} onCreateIdea={(quote) => createIdeaFromQuote(quote, activeDocument?.id)} onCreateTodo={(quote) => createTodoFromSource(`弄清：${quote.slice(0, 32)}`, { sourceType: "knowledge", sourceDocumentId: activeDocument?.id ?? null, sourceQuote: quote })} />}
        {view === "ideas" && <IdeasView data={data} mutate={mutate} onCreateTodo={createTodoFromSource} />}
        {view === "todos" && <TodosView data={data} activeTodoId={activeTodoId} onSelect={setActiveTodoId} mutate={mutate} />}
        {view === "framework" && <FrameworkView data={data} onNavigate={setView} />}
      </section>
    </main>
  );
}

function Dashboard({ data, mutate, onOpen, onNavigate }: { data: WorkspaceData; mutate: Mutate; onOpen: (id: string) => void; onNavigate: (view: View) => void }) {
  const [draft, setDraft] = useState("");
  const todayTodos = data.todos.filter((item) => item.isToday).sort(dailyBriefingLast);
  const completed = todayTodos.filter((item) => item.status === "completed").length;
  const progress = todayTodos.length ? Math.round((completed / todayTodos.length) * 100) : 0;
  const dateText = useMemo(() => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);
  async function addTodo() { const title = draft.trim(); if (!title) return; await mutate("todo", "create", undefined, { title, isToday: true, priority: "medium" }); setDraft(""); }
  return <div className="dashboard"><section className="today-panel"><div className="date-row"><div><p>{dateText}</p><h2>把今天的思考变成进展</h2></div><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><strong>{completed}</strong> / {todayTodos.length}</span></div></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="quick-add"><Plus size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addTodo()} placeholder="快速添加一个今日 Todo…" aria-label="新建今日任务" /><button onClick={() => void addTodo()}>添加</button></div><div className="todo-list">{todayTodos.length === 0 && <Empty text="今天还没有任务，可以先记录一个想推进的小行动。" />}{todayTodos.map((todo) => <article className={todo.status === "completed" ? "todo-row done" : "todo-row"} key={todo.id}><button className="check-button" onClick={() => void mutate("todo", "update", todo.id, { status: todo.status === "completed" ? "not_started" : "completed" })}>{todo.status === "completed" ? <Check size={16} /> : <Circle size={18} />}</button><button className="todo-main" onClick={() => onOpen(todo.id)}><strong>{todo.title}</strong>{getSourceLabel(todo, data) && <span>来源 · {getSourceLabel(todo, data)}</span>}</button><ChevronRight size={18} /></article>)}</div></section><aside className="insight-column"><section className="insight-card accent"><div className="section-label"><BrainCircuit size={17} /> 知识线索</div><h3>{topTags(data)[0]?.[0] ?? "开始形成知识主线"}</h3><p>系统会保留知识、灵感和行动的来源关系，帮助你回到问题产生的地方。</p><button onClick={() => onNavigate("framework")}>查看关联内容 <ChevronRight size={16} /></button></section><section className="recent-card"><div className="section-heading"><h3>最近记录</h3><button onClick={() => onNavigate("knowledge")}>全部</button></div>{data.documents.slice(0, 3).map((document) => <div className="recent-item" key={document.id}><BookOpenText size={17} /><div><strong>{document.title}</strong><span>{formatRelative(document.updatedAt)} · 知识</span></div></div>)}</section></aside><section className="module-grid" aria-label="核心模块"><ModuleCard tone="blue" icon={BookOpenText} title="知识记录" detail="继续学习与沉淀" onClick={() => onNavigate("knowledge")} /><ModuleCard tone="amber" icon={Lightbulb} title="灵感记录" detail="捕捉突然出现的想法" onClick={() => onNavigate("ideas")} /><ModuleCard tone="green" icon={CheckCircle2} title="Todo" detail="从想法推进到行动" onClick={() => onNavigate("todos")} /><ModuleCard tone="violet" icon={BrainCircuit} title="知识框架梳理" detail="发现联系、缺口与新问题" onClick={() => onNavigate("framework")} /></section></div>;
}

function ModuleCard({ tone, icon: Icon, title, detail, onClick }: { tone: string; icon: typeof BookOpenText; title: string; detail: string; onClick: () => void }) { return <button className={`module-card ${tone}`} onClick={onClick}><Icon /><span><strong>{title}</strong><small>{detail}</small></span><ChevronRight /></button>; }

function KnowledgeView({ folders, documents, activeDocument, onSelect, onCreate, onCreateFolder, onRenameFolder, onUpdate, onDelete, onCreateIdea, onCreateTodo }: { folders: KnowledgeFolder[]; documents: KnowledgeDocument[]; activeDocument: KnowledgeDocument | null; onSelect: (id: string) => void; onCreate: (folderId?: string | null) => void; onCreateFolder: (name: string, parentId: string | null) => Promise<unknown>; onRenameFolder: (id: string, name: string) => Promise<unknown>; onUpdate: (id: string, payload: Record<string, unknown>) => Promise<unknown>; onDelete: (id: string) => void; onCreateIdea: (quote: string) => void; onCreateTodo: (quote: string) => void }) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [folderParent, setFolderParent] = useState<string | null | undefined>(undefined);
  const [folderName, setFolderName] = useState("");
  const [documentPanelWidth, setDocumentPanelWidth] = useState(235);
  const [documentPanelOpen, setDocumentPanelOpen] = useState(true);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem("kit:document-panel-width"));
    if (Number.isFinite(savedWidth) && savedWidth >= 190 && savedWidth <= 760) setDocumentPanelWidth(savedWidth);
    setDocumentPanelOpen(window.localStorage.getItem("kit:document-panel") !== "closed");
    setSourcePanelOpen(window.localStorage.getItem("kit:source-panel") !== "closed");
  }, []);
  function followLayoutEdge(edge: "left" | "right") {
    const startedAt = window.performance.now();
    const follow = () => {
      const layout = layoutRef.current;
      if (!layout) return;
      layout.scrollLeft = edge === "right" ? layout.scrollWidth : 0;
      if (window.performance.now() - startedAt < 380) window.requestAnimationFrame(follow);
    };
    window.requestAnimationFrame(follow);
  }
  function toggleDocumentPanel(open: boolean) {
    setDocumentPanelOpen(open);
    window.localStorage.setItem("kit:document-panel", open ? "open" : "closed");
    followLayoutEdge("left");
  }
  function beginDocumentPanelResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!documentPanelOpen) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = documentPanelWidth;
    let latestWidth = startWidth;
    const move = (pointerEvent: PointerEvent) => {
      latestWidth = Math.min(760, Math.max(190, startWidth + pointerEvent.clientX - startX));
      setDocumentPanelWidth(latestWidth);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      globalThis.document.body.classList.remove("resizing-panel");
      window.localStorage.setItem("kit:document-panel-width", String(Math.round(latestWidth)));
    };
    globalThis.document.body.classList.add("resizing-panel");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }
  function resizeDocumentPanelByKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextWidth = Math.min(760, Math.max(190, documentPanelWidth + (event.key === "ArrowRight" ? 10 : -10)));
    setDocumentPanelWidth(nextWidth);
    window.localStorage.setItem("kit:document-panel-width", String(nextWidth));
  }
  function toggleSourcePanel(open: boolean) {
    setSourcePanelOpen(open);
    window.localStorage.setItem("kit:source-panel", open ? "open" : "closed");
    followLayoutEdge("right");
  }
  async function submitFolder() {
    const name = folderName.trim();
    if (!name) return;
    await onCreateFolder(name, folderParent ?? null);
    setFolderName("");
    setFolderParent(undefined);
  }
  const parentFolder = folders.find((folder) => folder.id === folderParent);
  const rootDocuments = documents.filter((document) => !document.folderId || !folders.some((folder) => folder.id === document.folderId));
  const layoutClassName = ["knowledge-layout", documentPanelOpen ? "" : "document-collapsed", sourcePanelOpen ? "" : "source-collapsed"].filter(Boolean).join(" ");
  return <div ref={layoutRef} className={layoutClassName} style={{ "--document-panel-expanded-width": `${documentPanelWidth}px` } as React.CSSProperties}>
    <aside className={documentPanelOpen ? "document-list-panel" : "document-list-panel collapsed"}>
      {documentPanelOpen ? <>
      <div className="panel-title"><strong>知识文档</strong><div className="panel-title-actions"><button aria-label="收起知识文档" title="收起知识文档" onClick={() => toggleDocumentPanel(false)}><PanelLeftClose size={17} /></button><button aria-label="新建文件夹" title="新建文件夹" onClick={() => setFolderParent(null)}><FolderPlus size={17} /></button><button aria-label="新建知识文档" title="新建知识文档" onClick={() => onCreate(null)}><Plus size={17} /></button></div></div>
      {folderParent !== undefined && <div className="new-folder-row"><span>{parentFolder ? `在“${parentFolder.name}”中新建` : "新建顶级文件夹"}</span><input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitFolder(); if (event.key === "Escape") setFolderParent(undefined); }} placeholder="文件夹名称" /><div><button onClick={() => setFolderParent(undefined)}>取消</button><button disabled={!folderName.trim()} onClick={() => void submitFolder()}>创建</button></div></div>}
      <div className="document-list folder-tree">{rootDocuments.length > 0 && <section className="unfiled-documents"><span>未分类</span>{rootDocuments.map((document) => <DocumentTreeItem key={document.id} document={document} active={activeDocument?.id === document.id} onSelect={onSelect} onDelete={onDelete} />)}</section>}{folders.filter((folder) => !folder.parentId).map((folder) => <FolderTreeNode key={folder.id} folder={folder} folders={folders} documents={documents} activeDocumentId={activeDocument?.id ?? null} onSelect={onSelect} onDelete={onDelete} onRenameFolder={onRenameFolder} onCreateDocument={onCreate} onCreateChild={(parentId) => { setFolderParent(parentId); setFolderName(""); }} />)}</div>
      </> : <button className="document-expand-button" onClick={() => toggleDocumentPanel(true)} title="展开知识文档" aria-label="展开知识文档"><PanelLeftOpen size={18} /><span>文档</span></button>}
      {documentPanelOpen && <div className="document-panel-resizer" role="separator" aria-label="调整知识文档区域宽度" aria-orientation="vertical" aria-valuemin={190} aria-valuemax={760} aria-valuenow={Math.round(documentPanelWidth)} tabIndex={0} onPointerDown={beginDocumentPanelResize} onKeyDown={resizeDocumentPanelByKeyboard} />}
    </aside>
    {activeDocument ? <section className="document-editor-panel"><div className="document-title-row"><DocumentTitleInput value={activeDocument.title} onSave={(title) => onUpdate(activeDocument.id, { title })} /><FolderPicker compact folders={folders} value={activeDocument.folderId} onChange={(folderId) => onUpdate(activeDocument.id, { folderId })} /><span><Clock3 size={14} /> 自动保存</span></div><RichEditor key={activeDocument.id} content={activeDocument.content} onChange={(content) => void onUpdate(activeDocument.id, { content })} onCreateIdea={onCreateIdea} onCreateTodo={onCreateTodo} /></section> : <section className="empty-panel"><Empty text="新建一篇知识文档，开始记录。" /><button className="primary-button" onClick={() => onCreate(null)}><Plus size={16} /> 新建文档</button></section>}
    {activeDocument && <aside className={sourcePanelOpen ? "source-panel" : "source-panel collapsed"}>{sourcePanelOpen ? <><div className="panel-title"><strong>来源与整理</strong><div className="source-panel-actions"><button onClick={() => toggleSourcePanel(false)} title="收起来源与整理" aria-label="收起来源与整理"><PanelRightClose size={16} /></button><button className="danger-icon" onClick={() => onDelete(activeDocument.id)} title="删除文档"><Trash2 size={16} /></button></div></div><FolderPicker folders={folders} value={activeDocument.folderId} onChange={(folderId) => onUpdate(activeDocument.id, { folderId })} /><SourceField label="来源类型" value={activeDocument.sourceType ?? ""} onBlur={(value) => onUpdate(activeDocument.id, { sourceType: value || null })} /><SourceField label="来源名称" value={activeDocument.sourceName ?? ""} onBlur={(value) => onUpdate(activeDocument.id, { sourceName: value || null })} /><SourceField label="URL" value={activeDocument.sourceUrl ?? ""} onBlur={(value) => onUpdate(activeDocument.id, { sourceUrl: value || null })} /><SourceField label="作者" value={activeDocument.author ?? ""} onBlur={(value) => onUpdate(activeDocument.id, { author: value || null })} /><TagEditor tags={activeDocument.aiTags} onChange={(aiTags) => onUpdate(activeDocument.id, { aiTags })} />{activeDocument.aiSummary && <div className="summary-box"><span><Sparkles size={14} /> AI 摘要</span><p>{activeDocument.aiSummary}</p></div>}</> : <button className="source-expand-button" onClick={() => toggleSourcePanel(true)} title="展开来源与整理" aria-label="展开来源与整理"><PanelRightOpen size={18} /><span>来源</span></button>}</aside>}
  </div>;
}

function DocumentTreeItem({ document, active, onSelect, onDelete }: { document: KnowledgeDocument; active: boolean; onSelect: (id: string) => void; onDelete: (id: string) => void }) {
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => () => {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
  }, []);
  function queueTitleTooltip() {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => {
      const button = titleButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = rect.bottom + 8;
      const top = below + 64 <= window.innerHeight ? below : Math.max(12, rect.top - 56);
      setTooltipPosition({ left, top, width });
    }, 400);
  }
  function hideTitleTooltip() {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = null;
    setTooltipPosition(null);
  }
  return <><div className={active ? "document-item-row active" : "document-item-row"}><button ref={titleButtonRef} className="document-item" onMouseEnter={queueTitleTooltip} onMouseLeave={hideTitleTooltip} onFocus={queueTitleTooltip} onBlur={hideTitleTooltip} onClick={() => onSelect(document.id)}><FileText size={16} /><span><strong>{document.title}</strong><small>{formatRelative(document.updatedAt)}</small></span></button><button className="document-delete" title={`删除文档：${document.title}`} aria-label={`删除文档：${document.title}`} onClick={() => onDelete(document.id)}><Trash2 size={14} /></button></div>{tooltipPosition && createPortal(<div className="document-title-tooltip" role="tooltip" style={{ left: tooltipPosition.left, top: tooltipPosition.top, width: tooltipPosition.width }}>{document.title}</div>, globalThis.document.body)}</>;
}

function FolderTreeNode({ folder, folders, documents, activeDocumentId, onSelect, onDelete, onRenameFolder, onCreateDocument, onCreateChild }: { folder: KnowledgeFolder; folders: KnowledgeFolder[]; documents: KnowledgeDocument[]; activeDocumentId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; onRenameFolder: (id: string, name: string) => Promise<unknown>; onCreateDocument: (folderId: string) => void; onCreateChild: (parentId: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => () => { if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current); }, []);
  const children = folders.filter((item) => item.parentId === folder.id);
  const items = documents.filter((document) => document.folderId === folder.id);
  function queueFolderTooltip() {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => {
      const rect = folderButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      setTooltipPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: rect.bottom + 8, width });
    }, 400);
  }
  function hideFolderTooltip() {
    if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = null;
    setTooltipPosition(null);
  }
  function renameFolder() {
    const name = window.prompt("修改文件夹名称", folder.name)?.trim();
    if (name && name !== folder.name) void onRenameFolder(folder.id, name);
  }
  return <><section className="folder-node"><div className="folder-row"><button ref={folderButtonRef} className="folder-toggle" onMouseEnter={queueFolderTooltip} onMouseLeave={hideFolderTooltip} onFocus={queueFolderTooltip} onBlur={hideFolderTooltip} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{expanded ? <FolderOpen size={16} /> : <Folder size={16} />}<strong>{folder.name}</strong><small>{items.length + children.length}</small></button><button className="folder-add" title={`重命名文件夹 ${folder.name}`} aria-label={`重命名文件夹 ${folder.name}`} onClick={renameFolder}><PencilLine size={13} /></button><button className="folder-add" title={`在 ${folder.name} 中新建知识文档`} aria-label={`在 ${folder.name} 中新建知识文档`} onClick={() => { setExpanded(true); onCreateDocument(folder.id); }}><FilePlus2 size={13} /></button><button className="folder-add" title={`在 ${folder.name} 中新建子文件夹`} aria-label={`在 ${folder.name} 中新建子文件夹`} onClick={() => onCreateChild(folder.id)}><FolderPlus size={13} /></button></div>{expanded && <div className="folder-children">{items.map((document) => <DocumentTreeItem key={document.id} document={document} active={activeDocumentId === document.id} onSelect={onSelect} onDelete={onDelete} />)}{children.map((child) => <FolderTreeNode key={child.id} folder={child} folders={folders} documents={documents} activeDocumentId={activeDocumentId} onSelect={onSelect} onDelete={onDelete} onRenameFolder={onRenameFolder} onCreateDocument={onCreateDocument} onCreateChild={onCreateChild} />)}{items.length === 0 && children.length === 0 && <small className="empty-folder">空文件夹</small>}</div>}</section>{tooltipPosition && createPortal(<div className="document-title-tooltip" role="tooltip" style={{ left: tooltipPosition.left, top: tooltipPosition.top, width: tooltipPosition.width }}>{folder.name}</div>, globalThis.document.body)}</>;
}

function FolderPicker({ folders, value, onChange, compact = false }: { folders: KnowledgeFolder[]; value: string | null; onChange: (folderId: string | null) => Promise<unknown>; compact?: boolean }) {
  const options: Array<{ id: string; label: string }> = [];
  const append = (parentId: string | null, depth: number) => folders.filter((folder) => folder.parentId === parentId).forEach((folder) => { options.push({ id: folder.id, label: `${"　".repeat(depth)}${depth ? "└ " : ""}${folder.name}` }); append(folder.id, depth + 1); });
  append(null, 0);
  const select = <select aria-label="所属目录" value={value ?? ""} onChange={(event) => void onChange(event.target.value || null)}><option value="">未分类</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
  return compact ? <label className="compact-folder-picker"><Folder size={14} />{select}</label> : <label className="source-field"><span>所属目录</span>{select}</label>;
}

function DocumentTitleInput({ value, onSave }: { value: string; onSave: (value: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  const saveTimer = useRef<number | null>(null);
  useEffect(() => { if (!composing.current) setDraft(value); }, [value]);
  useEffect(() => () => { if (saveTimer.current !== null) window.clearTimeout(saveTimer.current); }, []);
  function scheduleSave(next: string) {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { if (!composing.current && next !== value) void onSave(next); }, 650);
  }
  function flushSave() {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!composing.current && draft !== value) void onSave(draft);
  }
  return <input value={draft} aria-label="文档标题" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={(event) => { composing.current = false; const next = event.currentTarget.value; setDraft(next); scheduleSave(next); }} onChange={(event) => { const next = event.target.value; setDraft(next); if (!(event.nativeEvent as InputEvent).isComposing) scheduleSave(next); }} onBlur={flushSave} />;
}

function SourceField({ label, value, onBlur }: { label: string; value: string; onBlur: (value: string) => void }) {
  if (label === "来源类型") return <SourceTypeField value={value} onBlur={onBlur} />;
  const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]);
  return <label className="source-field"><span>{label}</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onBlur(draft)} /></label>;
}

function SourceTypeField({ value, onBlur }: { value: string; onBlur: (value: string) => void }) {
  const [draft, setDraft] = useState(value); const [open, setOpen] = useState(false);
  useEffect(() => setDraft(value), [value]);
  function choose(option: string) { setDraft(option); setOpen(false); onBlur(option); }
  return <label className="source-field source-type-field"><span>来源类型</span><input value={draft} onFocus={() => setOpen(true)} onChange={(event) => { setDraft(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => { setOpen(false); onBlur(draft); }, 120)} placeholder="可直接输入，或选择类型" />{open && <div className="source-type-options" role="listbox"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose("科技晨报")}>科技晨报</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose("检索文章")}>检索文章</button></div>}</label>;
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => Promise<unknown> }) {
  const [draft, setDraft] = useState("");
  const normalize = (value: string) => value.trim().replace(/^#+/, "");
  async function addTags() {
    const additions = draft.split(/[,，]/).map(normalize).filter(Boolean);
    if (!additions.length) return;
    const next = [...tags];
    additions.forEach((tag) => { if (!next.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) next.push(tag); });
    setDraft("");
    await onChange(next);
  }
  async function removeTag(tag: string) { await onChange(tags.filter((item) => item !== tag)); }
  async function generateTags() {
    const title = globalThis.document.querySelector<HTMLInputElement>('[aria-label="文档标题"]')?.value ?? "";
    const body = globalThis.document.querySelector<HTMLElement>(".prose-editor")?.innerText ?? "";
    const sourceType = globalThis.document.querySelector<HTMLInputElement>('[placeholder="可直接输入，或选择类型"]')?.value ?? "";
    await onChange(suggestDocumentTags(title, body, sourceType));
  }
  return <div className="source-field tag-editor"><div className="tag-label-row"><span>标签</span><button className="generate-tags" type="button" onClick={() => void generateTags()}><Sparkles size={13} /> AI 生成</button></div><div className="editable-tags">{tags.map((tag) => <button key={tag} title={`删除标签 ${tag}`} onClick={() => void removeTag(tag)}><span>#{tag}</span><X size={12} /></button>)}{!tags.length && <small>暂无标签，可以手动添加或让 AI 生成</small>}</div><div className="tag-input-row"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addTags(); } }} placeholder="输入标签，Enter 添加" aria-label="添加标签" /><button disabled={!draft.trim()} onClick={() => void addTags()}>添加</button></div><small className="tag-help">AI 会生成 2–3 个标签，仍可手动添加、删除或修改。</small></div>;
}

function suggestDocumentTags(title: string, content: string, sourceType: string) {
  const blocked = new Set(["学习", "记录", "知识", "文章", "内容", "可以", "这个", "一个", "进行", "关于", "以及", "用于", "当前", "我们", "the", "and", "with", "from", "that", "this"]);
  const tokens = `${title} ${title} ${content}`.match(/[A-Za-z][A-Za-z0-9-]{2,}|[\u4e00-\u9fff]{2,8}/g) ?? [];
  const frequency = new Map<string, number>();
  tokens.forEach((token) => { if (!blocked.has(token.toLowerCase())) frequency.set(token, (frequency.get(token) ?? 0) + 1); });
  const suggested = [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([token]) => token).slice(0, 3);
  if (sourceType && suggested.length < 3 && !suggested.includes(sourceType)) suggested.push(sourceType);
  return (suggested.length ? suggested : [sourceType || "学习记录", "待整理"]).slice(0, 3);
}

function IdeasView({ data, mutate, onCreateTodo }: { data: WorkspaceData; mutate: Mutate; onCreateTodo: (seed: string, source?: Partial<Todo>) => void }) {
  const [content, setContent] = useState("");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [ideaOverlayOpen, setIdeaOverlayOpen] = useState(false);
  useEffect(() => { setContent(window.localStorage.getItem("kit:idea-draft") ?? ""); }, []);
  function updateDraft(value: string) { setContent(value); window.localStorage.setItem("kit:idea-draft", value); }
  async function addIdea() { const originalContent = content.trim(); if (!originalContent) return; await mutate("idea", "create", undefined, { title: originalContent.slice(0, 32), originalContent }); setContent(""); window.localStorage.removeItem("kit:idea-draft"); }
  const selectedIdea = data.ideas.find((idea) => idea.id === selectedIdeaId) ?? null;
  function openIdea(id: string) { setSelectedIdeaId(id); window.requestAnimationFrame(() => setIdeaOverlayOpen(true)); }
  function closeIdea() { setIdeaOverlayOpen(false); window.setTimeout(() => setSelectedIdeaId(null), 300); }
  return <div className="content-page"><section className="capture-card"><div><Lightbulb size={21} /><span><strong>捕捉一个灵感</strong><small>原始想法会始终保留，AI 整理不会覆盖它。</small></span></div><textarea value={content} onChange={(event) => updateDraft(event.target.value)} placeholder="刚刚想到了什么？" /><button className="primary-button" onClick={() => void addIdea()}><Plus size={16} /> 保存灵感</button></section><div className="card-grid idea-summary-grid">{data.ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} data={data} mutate={mutate} onCreateTodo={onCreateTodo} onOpen={() => openIdea(idea.id)} />)}</div>{selectedIdea && <div className={`idea-focus-backdrop ${ideaOverlayOpen ? "open" : ""}`} onMouseDown={closeIdea}><div className="idea-focus-dialog" onMouseDown={(event) => event.stopPropagation()}><button className="idea-focus-close" onClick={closeIdea} aria-label="关闭灵感详情"><X size={18} /></button><IdeaCard idea={selectedIdea} data={data} mutate={mutate} onCreateTodo={onCreateTodo} expanded onDeleted={closeIdea} /></div></div>}</div>;
}

function IdeaCard({ idea, data, mutate, onCreateTodo, expanded = false, onOpen, onDeleted }: { idea: Idea; data: WorkspaceData; mutate: Mutate; onCreateTodo: (seed: string, source?: Partial<Todo>) => void; expanded?: boolean; onOpen?: () => void; onDeleted?: () => void }) {
  const document = data.documents.find((item) => item.id === idea.sourceDocumentId);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(idea.title);
  const [contentDraft, setContentDraft] = useState(idea.originalContent);
  useEffect(() => { setEditing(false); setTitleDraft(idea.title); setContentDraft(idea.originalContent); }, [idea.id, idea.title, idea.originalContent]);
  function cancelEdit() { setTitleDraft(idea.title); setContentDraft(idea.originalContent); setEditing(false); }
  async function saveEdit() { const title = titleDraft.trim(); const originalContent = contentDraft.trim(); if (!title || !originalContent) return; await mutate("idea", "update", idea.id, { title, originalContent }); setEditing(false); }
  if (!expanded) return <button className="idea-card idea-summary-card" onClick={onOpen}><h3>{idea.title}</h3><div className="tag-cloud">{idea.aiTags.length ? idea.aiTags.map((tag) => <em key={tag}>#{tag}</em>) : <em>#未分类</em>}</div></button>;
  async function deleteIdea() { if (!window.confirm("删除这条灵感？")) return; await mutate("idea", "delete", idea.id); onDeleted?.(); }
  return <article className="idea-card expanded"><div className="idea-meta"><span className={idea.isAiGenerated ? "ai-badge" : "idea-badge"}>{idea.isAiGenerated ? "AI 新想法" : "我的灵感"}</span><small>{formatRelative(idea.createdAt)}</small></div>{editing ? <div className="idea-card-editor"><label><span>标题</span><input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} /></label><label><span>灵感内容</span><textarea value={contentDraft} onChange={(event) => setContentDraft(event.target.value)} /></label></div> : <><h3>{idea.title}</h3><p>{idea.originalContent}</p></>}{idea.sourceQuote && <blockquote>“{idea.sourceQuote}”</blockquote>}{document && <span className="source-link"><Link2 size={14} /> 来源：{document.title}</span>}<div className="tag-cloud">{idea.aiTags.map((tag) => <em key={tag}>#{tag}</em>)}</div><footer>{editing ? <div className="idea-edit-actions"><button className="primary-button" disabled={!titleDraft.trim() || !contentDraft.trim()} onClick={() => void saveEdit()}><Check size={14} /> 保存</button><button className="secondary-button" onClick={cancelEdit}><X size={14} /> 取消</button></div> : <button onClick={() => onCreateTodo(`验证：${idea.title}`, { sourceType: "idea", sourceIdeaId: idea.id, sourceDocumentId: idea.sourceDocumentId, sourceQuote: idea.sourceQuote })}><CheckCircle2 size={15} /> 转为 Todo</button>}<div className="idea-card-actions">{!editing && <button className="edit-title-button" title="修改灵感" aria-label="修改灵感" onClick={() => setEditing(true)}><PencilLine size={15} /></button>}<button className="danger-icon" title="删除灵感" aria-label="删除灵感" onClick={() => void deleteIdea()}><Trash2 size={15} /></button></div></footer></article>;
}

function TodosView({ data, activeTodoId, onSelect, mutate }: { data: WorkspaceData; activeTodoId: string | null; onSelect: (id: string) => void; mutate: Mutate }) {
  const [filter, setFilter] = useState<"all" | "today" | TodoStatus>("all");
  const [draft, setDraft] = useState("");
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [detailOpen, setDetailOpen] = useState(false);
  const [schedulingTodoId, setSchedulingTodoId] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const visible = data.todos.filter((todo) => filter === "all" || (filter === "today" ? todo.isToday : todo.status === filter)).sort(dailyBriefingLast);
  const active = data.todos.find((item) => item.id === activeTodoId) ?? visible[0] ?? null;
  async function addTodo() { const title = draft.trim(); if (!title) return; const created = await mutate("todo", "create", undefined, { title, isToday: filter === "today", priority: "medium" }) as Todo; setDraft(""); onSelect(created.id); }
  async function scheduleTodo(todo: Todo, date: Date) { const target = dateKey(date); onSelect(todo.id); await mutate("todo", "update", todo.id, { scheduledStartDate: target, scheduledTime: null, status: todo.status === "not_started" && target <= dateKey(new Date()) ? "in_progress" : todo.status, isToday: target === dateKey(new Date()) }); }
  async function unscheduleTodo(todo: Todo) { await mutate("todo", "update", todo.id, { scheduledStartDate: null, scheduledTime: null, status: todo.status === "completed" ? "completed" : "not_started", isToday: false }); setDraggingTodoId(null); }
  async function deleteTodo(todo: Todo) { if (window.confirm(`彻底删除任务“${todo.title}”？`)) await mutate("todo", "delete", todo.id); }
  function beginDrag(event: React.DragEvent, todo: Todo) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", todo.id); setDraggingTodoId(todo.id); }
  async function dropOnDate(event: React.DragEvent, date: Date) { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || draggingTodoId; const todo = data.todos.find((item) => item.id === id); if (todo) await scheduleTodo(todo, date); setDraggingTodoId(null); }
  function moveCalendar(direction: number) { setAnchorDate((date) => calendarMode === "week" ? addCalendarDays(date, direction * 7) : new Date(date.getFullYear(), date.getMonth() + direction, 1)); }
  const schedulingTodo = data.todos.find((todo) => todo.id === schedulingTodoId) ?? null;
  const draggingScheduledTodo = data.todos.find((todo) => todo.id === draggingTodoId && todo.scheduledStartDate) ?? null;
  return <div className="todo-calendar-page"><section className="todo-calendar-library"><div className="todo-calendar-library-heading"><div><span className="eyebrow">Task Library</span><h2>所有待办</h2></div><strong>{data.todos.filter((todo) => todo.status !== "completed").length}</strong></div><div className="filter-tabs">{(["all", "today", "in_progress", "completed"] as const).map((id) => <button className={filter === id ? "active" : ""} key={id} onClick={() => setFilter(id)}>{({ all: "全部", today: "今天", in_progress: "进行中", completed: "已完成" })[id]}</button>)}</div><div className="quick-add"><Plus size={18} /><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addTodo()} placeholder="新建任务…" /><button onClick={() => void addTodo()}>添加</button></div><div className="calendar-task-list">{visible.map((todo) => <article draggable key={todo.id} className={`${todo.status === "completed" ? "calendar-task-card completed" : "calendar-task-card"} ${active?.id === todo.id ? "active" : ""}`} onClick={() => onSelect(todo.id)} onDragStart={(event) => beginDrag(event, todo)} onDragEnd={() => setDraggingTodoId(null)}><span className={`status-dot ${todoCalendarStatus(todo)}`} /><div><strong>{todo.title}</strong><p>{todo.description || "拖到右侧日期，或点击日历按钮安排"}</p><small>{todo.scheduledStartDate ? `${statusLabel(todo.status)} · 已安排 ${formatCalendarDate(parseDateKey(todo.scheduledStartDate))}` : "未安排"}</small></div><div className="calendar-task-actions"><button title="编辑任务" aria-label="编辑任务" onClick={(event) => { event.stopPropagation(); onSelect(todo.id); setDetailOpen(true); }}><PencilLine size={15} /></button><button title="选择安排日期" aria-label="选择安排日期" onClick={(event) => { event.stopPropagation(); setSchedulingTodoId(todo.id); setPickerMonth(todo.scheduledStartDate ? parseDateKey(todo.scheduledStartDate) : new Date()); }}><CalendarPlus size={16} /></button><button className="delete-task-button" title="彻底删除任务" aria-label="彻底删除任务" onClick={(event) => { event.stopPropagation(); void deleteTodo(todo); }}><Trash2 size={15} /></button></div></article>)}</div></section><section className="task-calendar-panel"><header className="calendar-header"><div><span className="eyebrow">Calendar</span><h2>任务日历</h2></div><div className="calendar-header-controls"><div className="calendar-mode-switch"><button className={calendarMode === "week" ? "active" : ""} onClick={() => setCalendarMode("week")}>周</button><button className={calendarMode === "month" ? "active" : ""} onClick={() => setCalendarMode("month")}>月</button></div><button className="calendar-nav-button" onClick={() => moveCalendar(-1)} aria-label="上一时间段"><ChevronLeft size={18} /></button><strong className={calendarMode === "month" ? "month-title" : "week-title"}>{calendarMode === "week" ? weekRangeLabel(anchorDate) : `${anchorDate.getFullYear()}年${anchorDate.getMonth() + 1}月`}</strong><button className="calendar-nav-button" onClick={() => moveCalendar(1)} aria-label="下一时间段"><ChevronRight size={18} /></button><button className="calendar-today-button" onClick={() => setAnchorDate(new Date())}>今天</button></div></header>{calendarMode === "week" ? <TodoWeekCalendar todos={data.todos} anchorDate={anchorDate} onOpen={(id) => { onSelect(id); setDetailOpen(true); }} onDropDate={(event, date) => void dropOnDate(event, date)} onDragStart={beginDrag} onDragEnd={() => setDraggingTodoId(null)} /> : <TodoMonthCalendar todos={data.todos} anchorDate={anchorDate} onSelectDate={(date) => { setAnchorDate(date); setCalendarMode("week"); }} />}{draggingScheduledTodo && <div className="calendar-unschedule-zone" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); void unscheduleTodo(draggingScheduledTodo); }}><Trash2 size={22} /><strong>拖到这里取消任务安排</strong><span>任务仍会保留在左侧列表</span></div>}</section>{detailOpen && active && <div className="calendar-detail-backdrop" onMouseDown={() => setDetailOpen(false)}><div className="calendar-detail-dialog" onMouseDown={(event) => event.stopPropagation()}><button className="calendar-detail-close" onClick={() => setDetailOpen(false)} aria-label="关闭任务详情"><X size={18} /></button><TodoDetail todo={active} data={data} mutate={mutate} /></div></div>}{schedulingTodo && <TodoDatePicker todo={schedulingTodo} month={pickerMonth} onMonthChange={setPickerMonth} onClose={() => setSchedulingTodoId(null)} onPick={(date) => { void scheduleTodo(schedulingTodo, date); setSchedulingTodoId(null); }} />}</div>;
}

function TodoWeekCalendar({ todos, anchorDate, onOpen, onDropDate, onDragStart, onDragEnd }: { todos: Todo[]; anchorDate: Date; onOpen: (id: string) => void; onDropDate: (event: React.DragEvent, date: Date) => void; onDragStart: (event: React.DragEvent, todo: Todo) => void; onDragEnd: () => void }) {
  const weekStart = startOfCalendarWeek(anchorDate); const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  return <div className="week-calendar"><div className="week-calendar-head">{days.map((day) => <div className={dateKey(day) === dateKey(new Date()) ? "today" : ""} key={dateKey(day)}><b>{`周${"一二三四五六日"[(day.getDay() + 6) % 7]}`}</b><strong>{day.getFullYear()}年{day.getMonth() + 1}月{day.getDate()}日</strong></div>)}</div><div className="week-calendar-body">{days.map((day) => { const dayTodos = todos.filter((todo) => todoOccursOn(todo, day)); return <div className="week-day-column" key={dateKey(day)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => onDropDate(event, day)}>{dayTodos.map((todo) => <button draggable key={todo.id} className={`week-task-event ${todoCalendarStatus(todo)}`} onClick={() => onOpen(todo.id)} onDragStart={(event) => onDragStart(event, todo)} onDragEnd={onDragEnd}><strong>{todo.title}</strong><span>{statusLabel(todo.status)}</span>{todo.status === "in_progress" && dateKey(day) !== todo.scheduledStartDate && <small>今日自动延续</small>}</button>)}{dayTodos.length === 0 && <span className="week-day-empty">拖入任务</span>}</div>; })}</div></div>;
}

function TodoMonthCalendar({ todos, anchorDate, onSelectDate }: { todos: Todo[]; anchorDate: Date; onSelectDate: (date: Date) => void }) {
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1); const gridStart = startOfCalendarWeek(first); const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
  return <div className="month-calendar"><div className="month-weekdays">{"一二三四五六日".split("").map((day) => <span key={day}>周{day}</span>)}</div><div className="month-grid">{days.map((day) => { const dayTodos = todos.filter((todo) => todoOccursOn(todo, day)); return <button className={`${day.getMonth() === anchorDate.getMonth() ? "" : "outside"} ${dateKey(day) === dateKey(new Date()) ? "today" : ""}`} key={dateKey(day)} onClick={() => onSelectDate(day)}><strong>{day.getDate()}</strong>{dayTodos.length > 0 && <span className="month-task-blocks">{dayTodos.map((todo) => <i className={todoCalendarStatus(todo)} title={`${todo.title} · ${statusLabel(todo.status)}`} key={todo.id} />)}</span>}</button>; })}</div></div>;
}

function TodoDatePicker({ todo, month, onMonthChange, onClose, onPick }: { todo: Todo; month: Date; onMonthChange: (date: Date) => void; onClose: () => void; onPick: (date: Date) => void }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1); const gridStart = startOfCalendarWeek(first); const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
  return <div className="date-picker-backdrop" onMouseDown={onClose}><section className="todo-date-picker" onMouseDown={(event) => event.stopPropagation()}><header><div><small>安排任务</small><strong>{todo.title}</strong></div><button onClick={onClose} aria-label="关闭日期选择"><X size={18} /></button></header><div className="date-picker-nav"><button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button><strong>{month.getFullYear()}年{month.getMonth() + 1}月</strong><button onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button></div><div className="date-picker-weekdays">{"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}</div><div className="date-picker-grid">{days.map((day) => <button className={`${day.getMonth() === month.getMonth() ? "" : "outside"} ${todo.scheduledStartDate === dateKey(day) ? "selected" : ""} ${dateKey(day) === dateKey(new Date()) ? "today" : ""}`} key={dateKey(day)} onClick={() => onPick(day)}>{day.getDate()}</button>)}</div></section></div>;
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDateKey(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function addCalendarDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function startOfCalendarWeek(date: Date) { const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; }
function formatCalendarDate(date: Date) { return `${date.getMonth() + 1}月${date.getDate()}日`; }
function weekRangeLabel(date: Date) { const start = startOfCalendarWeek(date); const end = addCalendarDays(start, 6); return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日`; }
function todoCalendarStatus(todo: Todo) { if (!todo.scheduledStartDate) return "unscheduled"; return todo.status; }
function dailyBriefingLast(left: Todo, right: Todo) { return Number(left.automationKind === "daily_briefing") - Number(right.automationKind === "daily_briefing"); }
function todoOccursOn(todo: Todo, date: Date) { if (!todo.scheduledStartDate) return false; const key = dateKey(date); const today = dateKey(new Date()); if (key < todo.scheduledStartDate) return false; if (key === todo.scheduledStartDate) return true; if (key > today) return false; if (todo.status === "completed" && todo.completedAt) return key <= dateKey(new Date(todo.completedAt)); return todo.status === "in_progress"; }

function TodoDetail({ todo, data, mutate }: { todo: Todo; data: WorkspaceData; mutate: Mutate }) {
  const [result, setResult] = useState(todo.result ?? ""); useEffect(() => setResult(todo.result ?? ""), [todo.id, todo.result]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(todo.title);
  useEffect(() => { setTitleDraft(todo.title); setEditingTitle(false); }, [todo.id, todo.title]);
  const sourceDocument = data.documents.find((item) => item.id === todo.sourceDocumentId); const sourceIdea = data.ideas.find((item) => item.id === todo.sourceIdeaId);
  async function writeBack() { if (!sourceDocument || !result.trim()) return; const appended = `${sourceDocument.content}<hr><h2>任务结论：${escapeText(todo.title)}</h2><p>${escapeText(result).replace(/\n/g, "<br>")}</p>`; await mutate("document", "update", sourceDocument.id, { content: appended }); window.alert("结果已回写到原知识记录。"); }
  async function saveTitle() { const title = titleDraft.trim(); if (!title) return; await mutate("todo", "update", todo.id, { title }); setEditingTitle(false); }
  return <section className="todo-detail"><div className="detail-header"><div className="detail-heading"><span className={`status-pill ${todo.status}`}>{statusLabel(todo.status)}</span>{editingTitle ? <div className="todo-title-editor"><input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void saveTitle(); if (event.key === "Escape") { setTitleDraft(todo.title); setEditingTitle(false); } }} aria-label="修改 Todo 标题" /><div><button className="primary-button" disabled={!titleDraft.trim()} onClick={() => void saveTitle()}><Check size={14} /> 保存</button><button className="secondary-button" onClick={() => { setTitleDraft(todo.title); setEditingTitle(false); }}><X size={14} /> 取消</button></div></div> : <h2>{todo.title}</h2>}</div><div className="detail-header-actions">{!editingTitle && <button className="edit-title-button" onClick={() => setEditingTitle(true)}><PencilLine size={16} /> 修改</button>}<button className="danger-icon" title="删除 Todo" onClick={() => window.confirm("删除这个 Todo？") && void mutate("todo", "delete", todo.id)}><Trash2 size={17} /></button></div></div><label className="detail-field"><span>描述</span><textarea defaultValue={todo.description} onBlur={(event) => void mutate("todo", "update", todo.id, { description: event.target.value })} /></label><div className="detail-grid"><label className="detail-field"><span>状态</span><select value={todo.status} onChange={(event) => void mutate("todo", "update", todo.id, { status: event.target.value })}><option value="not_started">未开始</option><option value="in_progress">进行中</option><option value="completed">已完成</option></select></label><label className="switch-field"><input type="checkbox" checked={todo.isToday} onChange={(event) => void mutate("todo", "update", todo.id, { isToday: event.target.checked })} /><span>加入今日任务</span></label></div>{(sourceIdea || sourceDocument || todo.sourceQuote) && <div className="provenance-card"><strong><Link2 size={15} /> 为什么产生这个任务</strong>{sourceIdea && <p>灵感：{sourceIdea.title}</p>}{sourceDocument && <p>知识：{sourceDocument.title}</p>}{todo.sourceQuote && <blockquote>“{todo.sourceQuote}”</blockquote>}</div>}<label className="detail-field result-field"><span>任务结果 / 结论</span><textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="完成后，把得到的结论写在这里…" /></label><div className="detail-actions"><button className="primary-button" onClick={() => void mutate("todo", "update", todo.id, { result, status: "completed" })}><Check size={16} /> 保存并完成</button>{sourceDocument && <button className="secondary-button" disabled={!result.trim()} onClick={() => void writeBack()}><BookOpenText size={16} /> 回写原知识</button>}</div></section>;
}

function FrameworkView({ data, onNavigate }: { data: WorkspaceData; onNavigate: (view: View) => void }) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const tags = topTags(data); const linkedIdeas = data.ideas.filter((idea) => idea.sourceDocumentId).length; const sourcedTodos = data.todos.filter((todo) => todo.sourceDocumentId || todo.sourceIdeaId).length;
  const topicMap = new Map<string, { documents: KnowledgeDocument[]; ideas: Idea[] }>();
  const ensureTopic = (tag: string) => {
    if (!topicMap.has(tag)) topicMap.set(tag, { documents: [], ideas: [] });
    return topicMap.get(tag)!;
  };
  data.documents.forEach((document) => ensureTopic(document.aiTags[0] || "未分类").documents.push(document));
  data.ideas.forEach((idea) => {
    const sourceDocument = data.documents.find((document) => document.id === idea.sourceDocumentId);
    ensureTopic(sourceDocument?.aiTags[0] || idea.aiTags[0] || "未分类").ideas.push(idea);
  });
  const topics = [...topicMap.entries()].sort((a, b) => (b[1].documents.length + b[1].ideas.length) - (a[1].documents.length + a[1].ideas.length));
  const namedTopics = topics.filter(([name]) => name !== "未分类").map(([name]) => name);
  const pendingTodos = data.todos.filter((todo) => todo.status !== "completed");
  const summary = data.documents.length === 0
    ? "知识库目前还是空的。先记录第一篇文章或学习笔记，知识地图会从这里开始生长。"
    : `当前知识库由 ${data.documents.length} 篇文章和 ${data.ideas.length} 条灵感组成${namedTopics.length ? `，主要围绕${namedTopics.slice(0, 3).map((name) => `“${name}”`).join("、")}` : "，内容尚未形成明确主题"}。${linkedIdeas ? `${linkedIdeas} 条灵感已经能追溯到原文，形成了从阅读到思考的连接。` : "灵感与原文之间还缺少连接。"}${sourcedTodos ? `其中 ${sourcedTodos} 个行动保留了知识来源，开始形成学习闭环。` : "下一步可把关键问题转成具体行动。"}`;
  const learningSuggestions = [
    ...(namedTopics[0] ? [`围绕“${namedTopics[0]}”补充一篇对比或综述笔记，明确核心概念之间的差异。`] : ["先为现有文章补充标签，将零散记录聚合成主题。"]),
    ...(data.documents.some((document) => !document.aiSummary) ? ["为尚无摘要的文章提炼一句核心结论和 3 个关键词。"] : []),
    ...(data.ideas.some((idea) => !idea.sourceDocumentId) ? ["检查未关联原文的灵感，补上它来自哪篇文章或哪个问题。"] : []),
    ...(pendingTodos.length ? [`优先推进 ${pendingTodos.length} 个未完成行动，并把结果回写到原知识记录。`] : ["从最重要的知识缺口创建一个可在本周完成的 Todo。"]),
  ].slice(0, 4);
  async function copyFrameworkPrompt(label: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(`“${label}”指令已复制，请粘贴到 Codex 对话中发送`);
    } catch {
      setCopyStatus("复制失败，请在 Codex 对话中直接说：读取并分析我的知识库");
    }
  }
  const aiOptions = [
    { label: "梳理知识结构", detail: "归纳主题、联系与知识主线", prompt: "请通过当前页面的 Site tools 读取我的知识文档，梳理主要主题、主题之间的联系和正在形成的知识结构。先展示分析结果，不要修改或保存任何内容。" },
    { label: "发现知识缺口", detail: "找出薄弱点、冲突和待研究问题", prompt: "请通过当前页面的 Site tools 读取我的知识文档，找出知识缺口、尚未回答的问题、可能的冲突和值得继续研究的方向。先展示结果，不要修改或保存任何内容。" },
    { label: "生成行动建议", detail: "把知识和灵感转化为下一步", prompt: "请通过当前页面的 Site tools 读取我的知识、灵感和 Todo，提出最多 5 个具体的下一步行动，并说明各自来源。先展示建议，不要创建或保存 Todo。" },
  ];
  return <div className="framework-page">
    <section className="framework-hero"><span><Sparkles size={16} /> AI 协作区</span><h2>从零散记录中看见正在形成的知识结构</h2><p>知识地图会展示每篇文章、每条灵感及其来源关系；AI 可以进一步发现跨主题联系和知识缺口。</p><div className="framework-actions"><button className="primary-button" onClick={() => { setAiPanelOpen(true); setCopyStatus(""); }}>在 ChatGPT/Codex 中分析我的知识</button><small>请保持当前页面在内置浏览器中打开</small></div></section>
    {aiPanelOpen && <div className="ai-dialog-backdrop" onMouseDown={() => setAiPanelOpen(false)}><section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span><Sparkles size={16} /> AI 知识分析</span><h3 id="ai-dialog-title">选择这次要分析的方向</h3></div><button aria-label="关闭 AI 分析面板" onClick={() => setAiPanelOpen(false)}><X size={18} /></button></header><div className="ai-option-list">{aiOptions.map((option) => <button key={option.label} onClick={() => void copyFrameworkPrompt(option.label, option.prompt)}><span><strong>{option.label}</strong><small>{option.detail}</small></span><ChevronRight size={18} /></button>)}</div><p className={copyStatus ? "ai-copy-status success" : "ai-copy-status"}>{copyStatus || "选择后会复制完整指令。回到 Codex 对话粘贴并发送，AI 将通过当前页面工具读取知识库。"}</p></section></div>}
    <section className="framework-stats"><article><strong>{data.documents.length}</strong><span>知识文档</span></article><article><strong>{data.ideas.length}</strong><span>灵感节点</span></article><article><strong>{linkedIdeas}</strong><span>文章 → 灵感连接</span></article><article><strong>{sourcedTodos}</strong><span>知识 → 行动连接</span></article></section>
    <section className="knowledge-map-section">
      <div className="section-heading"><div><span className="eyebrow">Knowledge Map</span><h3>知识树</h3></div><small>按首要标签组织；虚线表示灵感来源于文章</small></div>
      {topics.length ? <div className="knowledge-tree"><div className="tree-root"><BrainCircuit size={20} /><span><strong>我的知识库</strong><small>{topics.length} 个主题分支</small></span></div><div className={topics.length > 1 ? "tree-branches multiple" : "tree-branches single"}>{topics.map(([topic, group]) => <article className="tree-branch" key={topic}><div className="topic-node"><span>#{topic}</span><small>{group.documents.length + group.ideas.length} 个节点</small></div><div className="topic-content">{group.documents.map((document) => <div className="map-document" key={document.id}><button onClick={() => onNavigate("knowledge")}><BookOpenText size={16} /><span><strong>{document.title}</strong><small>{document.aiSummary || "知识文章"}</small></span></button>{group.ideas.filter((idea) => idea.sourceDocumentId === document.id).map((idea) => <button className="map-idea linked" key={idea.id} onClick={() => onNavigate("ideas")}><Lightbulb size={15} /><span><strong>{idea.title}</strong><small>来自这篇文章{idea.aiTags.length ? ` · ${idea.aiTags.map((tag) => `#${tag}`).join(" ")}` : ""}</small></span></button>)}</div>)}{group.ideas.filter((idea) => !idea.sourceDocumentId || !group.documents.some((document) => document.id === idea.sourceDocumentId)).map((idea) => <button className="map-idea" key={idea.id} onClick={() => onNavigate("ideas")}><Lightbulb size={15} /><span><strong>{idea.title}</strong><small>{idea.sourceDocumentId ? "关联其他主题文章" : "独立灵感"}</small></span></button>)}</div></article>)}</div></div> : <Empty text="添加文章或灵感后，知识树会在这里生成。" />}
    </section>
    <div className="synthesis-grid"><section className="knowledge-summary"><span><Link2 size={16} /> 知识脉络总结</span><p>{summary}</p><div className="summary-path"><em>阅读记录</em><i /><em>主题聚合</em><i /><em>产生灵感</em><i /><em>转为行动</em></div></section><section className="learning-next"><span><Lightbulb size={16} /> 接下来学习什么</span><ol>{learningSuggestions.map((suggestion, index) => <li key={suggestion}><b>{index + 1}</b><p>{suggestion}</p></li>)}</ol></section></div>
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="empty-state"><Circle size={18} /><span>{text}</span></div>; }
function statusLabel(status: TodoStatus) { return ({ not_started: "未开始", in_progress: "进行中", completed: "已完成" })[status]; }
function escapeText(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }
function formatRelative(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); if (days <= 0) return "今天"; if (days === 1) return "昨天"; return `${days} 天前`; }
function getSourceLabel(todo: Todo, data: WorkspaceData) { return data.ideas.find((item) => item.id === todo.sourceIdeaId)?.title ?? data.documents.find((item) => item.id === todo.sourceDocumentId)?.title ?? null; }
function topTags(data: WorkspaceData): Array<[string, number]> { return collectTopTags([...data.documents, ...data.ideas]); }

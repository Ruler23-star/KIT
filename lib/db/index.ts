import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ideas, knowledgeDocuments, knowledgeFolders, todos } from "./schema";
import { getDataDir } from "@/lib/data-path";
import type { Idea, KnowledgeDocument, KnowledgeFolder, Todo, WorkspaceData } from "@/types/workspace";

const dataDir = getDataDir();
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });

const sqlite = new Database(path.join(dataDir, "knowledge.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    source_type TEXT,
    source_name TEXT,
    source_url TEXT,
    author TEXT,
    source_note TEXT,
    ai_summary TEXT,
    ai_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_content TEXT NOT NULL,
    source_document_id TEXT,
    source_quote TEXT,
    ai_summary TEXT,
    ai_tags TEXT NOT NULL DEFAULT '[]',
    is_ai_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(source_document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'not_started',
    priority TEXT NOT NULL DEFAULT 'medium',
    is_today INTEGER NOT NULL DEFAULT 0,
    source_type TEXT,
    source_document_id TEXT,
    source_idea_id TEXT,
    source_quote TEXT,
    result TEXT,
    completed_at TEXT,
    scheduled_start_date TEXT,
    scheduled_time TEXT,
    scheduled_duration INTEGER NOT NULL DEFAULT 60,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(source_document_id) REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    FOREIGN KEY(source_idea_id) REFERENCES ideas(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON knowledge_documents(updated_at);
  CREATE INDEX IF NOT EXISTS idx_todos_today ON todos(is_today, status);
`);

const documentColumns = sqlite.prepare("PRAGMA table_info(knowledge_documents)").all() as Array<{ name: string }>;
if (!documentColumns.some((column) => column.name === "folder_id")) {
  sqlite.exec("ALTER TABLE knowledge_documents ADD COLUMN folder_id TEXT");
}

const todoColumns = sqlite.prepare("PRAGMA table_info(todos)").all() as Array<{ name: string }>;
if (!todoColumns.some((column) => column.name === "scheduled_start_date")) sqlite.exec("ALTER TABLE todos ADD COLUMN scheduled_start_date TEXT");
if (!todoColumns.some((column) => column.name === "scheduled_time")) sqlite.exec("ALTER TABLE todos ADD COLUMN scheduled_time TEXT");
if (!todoColumns.some((column) => column.name === "scheduled_duration")) sqlite.exec("ALTER TABLE todos ADD COLUMN scheduled_duration INTEGER NOT NULL DEFAULT 60");
if (!todoColumns.some((column) => column.name === "automation_kind")) sqlite.exec("ALTER TABLE todos ADD COLUMN automation_kind TEXT");
if (!todoColumns.some((column) => column.name === "automation_date")) sqlite.exec("ALTER TABLE todos ADD COLUMN automation_date TEXT");
if (!todoColumns.some((column) => column.name === "was_scheduled")) sqlite.exec("ALTER TABLE todos ADD COLUMN was_scheduled INTEGER NOT NULL DEFAULT 0");
sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_automation_day ON todos(automation_kind, automation_date) WHERE automation_kind IS NOT NULL AND automation_date IS NOT NULL");

const db = drizzle(sqlite);

function safeTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapDocument(row: typeof knowledgeDocuments.$inferSelect): KnowledgeDocument {
  return { ...row, aiTags: safeTags(row.aiTags) };
}

function mapIdea(row: typeof ideas.$inferSelect): Idea {
  return { ...row, aiTags: safeTags(row.aiTags) };
}

function mapTodo(row: typeof todos.$inferSelect): Todo {
  return row;
}

function seedIfEmpty() {
  const documentCount = sqlite.prepare("SELECT COUNT(*) AS count FROM knowledge_documents").get() as { count: number };
  if (documentCount.count > 0) return;

  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 86_400_000).toISOString();

  db.insert(knowledgeDocuments).values([
    {
      id: "doc-sonarllm",
      title: "SonarLLM 学习记录",
      content: "<h1>SonarLLM 学习记录</h1><p>SonarLLM 提出了 <strong>sonar-specific representation</strong>，用于更好地描述声纳数据中的领域特征。</p><h2>当前问题</h2><p>这种 representation 与通用视觉 Encoder 的结构和训练目标有什么差异？</p>",
      sourceType: "论文",
      sourceName: "SonarLLM",
      sourceUrl: "https://arxiv.org/",
      author: null,
      sourceNote: "示例文档，可直接修改或删除。",
      aiSummary: "关注声纳领域表征与通用视觉编码器的关系。",
      aiTags: JSON.stringify(["SonarLLM", "Representation", "声纳"]),
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: "doc-dsp",
      title: "数字信号处理 · 匹配滤波",
      content: "<h1>匹配滤波</h1><p>匹配滤波器用于在加性随机噪声中检测已知信号，并在特定时刻最大化输出信噪比。</p>",
      sourceType: "课程",
      sourceName: "数字信号处理",
      sourceUrl: null,
      author: null,
      sourceNote: null,
      aiSummary: null,
      aiTags: JSON.stringify(["DSP", "匹配滤波"]),
      createdAt: earlier,
      updatedAt: earlier,
    },
  ]).run();

  db.insert(ideas).values([
    {
      id: "idea-encoder",
      title: "Sonar representation 是否是领域专用 Encoder？",
      originalContent: "这个 representation 会不会本质上是一种针对声纳数据设计的特殊 Encoder？",
      sourceDocumentId: "doc-sonarllm",
      sourceQuote: "sonar-specific representation",
      aiSummary: null,
      aiTags: JSON.stringify(["Encoder", "Representation"]),
      isAiGenerated: false,
      createdAt: now,
      updatedAt: now,
    },
  ]).run();

  db.insert(todos).values([
    {
      id: "todo-read-sonar",
      title: "阅读 SonarLLM representation 部分",
      description: "重点确认模块结构、输入输出和训练目标。",
      status: "completed",
      priority: "high",
      isToday: true,
      sourceType: "idea",
      sourceDocumentId: "doc-sonarllm",
      sourceIdeaId: "idea-encoder",
      sourceQuote: "sonar-specific representation",
      result: "已定位 representation 相关章节，下一步需要和通用 Encoder 做结构对照。",
      completedAt: now,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: "todo-organize-representation",
      title: "整理 Representation 笔记",
      description: "把领域表征与通用表征放在同一框架下比较。",
      status: "in_progress",
      priority: "high",
      isToday: true,
      sourceType: "idea",
      sourceDocumentId: "doc-sonarllm",
      sourceIdeaId: "idea-encoder",
      sourceQuote: "领域专用 Encoder",
      result: null,
      completedAt: null,
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: "todo-review-dsp",
      title: "复习 DSP 匹配滤波",
      description: "复习推导和直观解释。",
      status: "not_started",
      priority: "medium",
      isToday: true,
      sourceType: "knowledge",
      sourceDocumentId: "doc-dsp",
      sourceIdeaId: null,
      sourceQuote: null,
      result: null,
      completedAt: null,
      createdAt: earlier,
      updatedAt: earlier,
    },
  ]).run();
}

seedIfEmpty();

const DAILY_BRIEFING_AUTOMATION = "daily_briefing";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function maintainDailyBriefingTodo() {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = localDateKey(now);
  const title = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日晨报`;

  const transaction = sqlite.transaction(() => {
    sqlite.prepare(`
      DELETE FROM todos
      WHERE automation_kind = ?
        AND automation_date < ?
        AND was_scheduled = 0
        AND scheduled_start_date IS NULL
    `).run(DAILY_BRIEFING_AUTOMATION, today);

    sqlite.prepare(`
      UPDATE todos
      SET is_today = 0, updated_at = ?
      WHERE automation_kind = ? AND automation_date < ? AND is_today = 1
    `).run(nowIso, DAILY_BRIEFING_AUTOMATION, today);

    sqlite.prepare(`
      INSERT OR IGNORE INTO todos (
        id, title, description, status, priority, is_today,
        automation_kind, automation_date, was_scheduled,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'not_started', 'medium', 1, ?, ?, 0, ?, ?)
    `).run(
      crypto.randomUUID(),
      title,
      "每日自动生成；如当天未安排，次日将自动清理。",
      DAILY_BRIEFING_AUTOMATION,
      today,
      nowIso,
      nowIso,
    );
  });

  transaction();
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  maintainDailyBriefingTodo();
  const [folderRows, documentRows, ideaRows, todoRows] = await Promise.all([
    db.select().from(knowledgeFolders).orderBy(knowledgeFolders.name),
    db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.updatedAt)),
    db.select().from(ideas).orderBy(desc(ideas.updatedAt)),
    db.select().from(todos).orderBy(desc(todos.updatedAt)),
  ]);

  return {
    folders: folderRows,
    documents: documentRows.map(mapDocument),
    ideas: ideaRows.map(mapIdea),
    todos: todoRows.map(mapTodo),
  };
}

export async function createDocument(input: { title: string; folderId?: string | null }) {
  const now = new Date().toISOString();
  const row: typeof knowledgeDocuments.$inferInsert = {
    id: crypto.randomUUID(),
    title: input.title,
    content: `<h1>${escapeHtml(input.title)}</h1><p></p>`,
    aiTags: "[]",
    folderId: input.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(knowledgeDocuments).values(row);
  return mapDocument((await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, row.id)))[0]);
}

export async function updateDocument(id: string, input: Partial<KnowledgeDocument>) {
  const update: Partial<typeof knowledgeDocuments.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title;
  if (input.content !== undefined) update.content = input.content;
  for (const key of ["sourceType", "sourceName", "sourceUrl", "author", "sourceNote", "aiSummary"] as const) {
    if (key in input) update[key] = input[key] ?? null;
  }
  if (input.aiTags) update.aiTags = JSON.stringify(input.aiTags);
  if ("folderId" in input) update.folderId = input.folderId ?? null;
  await db.update(knowledgeDocuments).set(update).where(eq(knowledgeDocuments.id, id));
  const row = (await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)))[0];
  return row ? mapDocument(row) : null;
}

export async function deleteDocument(id: string) {
  await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
}

export async function createFolder(input: { name: string; parentId?: string | null }): Promise<KnowledgeFolder> {
  const now = new Date().toISOString();
  const row: typeof knowledgeFolders.$inferInsert = { id: crypto.randomUUID(), name: input.name, parentId: input.parentId ?? null, createdAt: now, updatedAt: now };
  await db.insert(knowledgeFolders).values(row);
  return (await db.select().from(knowledgeFolders).where(eq(knowledgeFolders.id, row.id)))[0];
}

export async function updateFolder(id: string, input: Partial<KnowledgeFolder>) {
  const update: Partial<typeof knowledgeFolders.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) update.name = input.name;
  if ("parentId" in input) update.parentId = input.parentId ?? null;
  await db.update(knowledgeFolders).set(update).where(eq(knowledgeFolders.id, id));
  return (await db.select().from(knowledgeFolders).where(eq(knowledgeFolders.id, id)))[0] ?? null;
}

export async function deleteFolder(id: string) {
  await db.update(knowledgeDocuments).set({ folderId: null }).where(eq(knowledgeDocuments.folderId, id));
  await db.update(knowledgeFolders).set({ parentId: null }).where(eq(knowledgeFolders.parentId, id));
  await db.delete(knowledgeFolders).where(eq(knowledgeFolders.id, id));
}

export async function createIdea(input: Pick<Idea, "title" | "originalContent"> & Partial<Idea>) {
  const now = new Date().toISOString();
  const row: typeof ideas.$inferInsert = {
    id: crypto.randomUUID(),
    title: input.title,
    originalContent: input.originalContent,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceQuote: input.sourceQuote ?? null,
    aiSummary: input.aiSummary ?? null,
    aiTags: JSON.stringify(input.aiTags ?? []),
    isAiGenerated: input.isAiGenerated ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(ideas).values(row);
  return mapIdea((await db.select().from(ideas).where(eq(ideas.id, row.id)))[0]);
}

export async function updateIdea(id: string, input: Partial<Idea>) {
  const update: Partial<typeof ideas.$inferInsert> = { updatedAt: new Date().toISOString() };
  for (const key of ["title", "originalContent", "sourceDocumentId", "sourceQuote", "aiSummary", "isAiGenerated"] as const) {
    if (key in input) update[key] = input[key] as never;
  }
  if (input.aiTags) update.aiTags = JSON.stringify(input.aiTags);
  await db.update(ideas).set(update).where(eq(ideas.id, id));
  const row = (await db.select().from(ideas).where(eq(ideas.id, id)))[0];
  return row ? mapIdea(row) : null;
}

export async function deleteIdea(id: string) {
  await db.delete(ideas).where(eq(ideas.id, id));
}

export async function createTodo(input: Pick<Todo, "title"> & Partial<Todo>) {
  const now = new Date().toISOString();
  const row: typeof todos.$inferInsert = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description ?? "",
    status: input.status ?? "not_started",
    priority: input.priority ?? "medium",
    isToday: input.isToday ?? false,
    sourceType: input.sourceType ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceIdeaId: input.sourceIdeaId ?? null,
    sourceQuote: input.sourceQuote ?? null,
    result: input.result ?? null,
    completedAt: input.completedAt ?? null,
    scheduledStartDate: input.scheduledStartDate ?? null,
    scheduledTime: input.scheduledTime ?? null,
    scheduledDuration: input.scheduledDuration ?? 60,
    automationKind: input.automationKind ?? null,
    automationDate: input.automationDate ?? null,
    wasScheduled: input.wasScheduled ?? Boolean(input.scheduledStartDate),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(todos).values(row);
  return mapTodo((await db.select().from(todos).where(eq(todos.id, row.id)))[0]);
}

export async function updateTodo(id: string, input: Partial<Todo>) {
  const update: Partial<typeof todos.$inferInsert> = { updatedAt: new Date().toISOString() };
  for (const key of ["title", "description", "status", "priority", "isToday", "sourceType", "sourceDocumentId", "sourceIdeaId", "sourceQuote", "result", "completedAt", "scheduledStartDate", "scheduledTime", "scheduledDuration"] as const) {
    if (key in input) update[key] = input[key] as never;
  }
  if (input.scheduledStartDate) update.wasScheduled = true;
  if (input.status === "completed" && !("completedAt" in input)) update.completedAt = new Date().toISOString();
  if (input.status && input.status !== "completed") update.completedAt = null;
  await db.update(todos).set(update).where(eq(todos.id, id));
  const row = (await db.select().from(todos).where(eq(todos.id, id)))[0];
  return row ? mapTodo(row) : null;
}

export async function deleteTodo(id: string) {
  await db.delete(todos).where(eq(todos.id, id));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

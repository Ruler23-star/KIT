import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  sourceType: text("source_type"),
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  author: text("author"),
  sourceNote: text("source_note"),
  aiSummary: text("ai_summary"),
  aiTags: text("ai_tags").notNull().default("[]"),
  folderId: text("folder_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const knowledgeFolders = sqliteTable("knowledge_folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalContent: text("original_content").notNull(),
  sourceDocumentId: text("source_document_id"),
  sourceQuote: text("source_quote"),
  aiSummary: text("ai_summary"),
  aiTags: text("ai_tags").notNull().default("[]"),
  isAiGenerated: integer("is_ai_generated", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["not_started", "in_progress", "completed"] }).notNull().default("not_started"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  isToday: integer("is_today", { mode: "boolean" }).notNull().default(false),
  sourceType: text("source_type"),
  sourceDocumentId: text("source_document_id"),
  sourceIdeaId: text("source_idea_id"),
  sourceQuote: text("source_quote"),
  result: text("result"),
  completedAt: text("completed_at"),
  scheduledStartDate: text("scheduled_start_date"),
  scheduledTime: text("scheduled_time"),
  scheduledDuration: integer("scheduled_duration").notNull().default(60),
  automationKind: text("automation_kind"),
  automationDate: text("automation_date"),
  wasScheduled: integer("was_scheduled", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

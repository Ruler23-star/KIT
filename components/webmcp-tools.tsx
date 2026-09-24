"use client";

import { useEffect } from "react";
import type { WorkspaceData } from "@/types/workspace";

const toolNames = [
  "list_knowledge_documents",
  "get_knowledge_document",
  "get_selected_text",
  "list_ideas_and_todos",
  "save_ai_organization",
  "create_ai_idea",
  "create_linked_todo",
] as const;

async function workspace(): Promise<WorkspaceData> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok) throw new Error("无法读取本地知识库");
  return response.json();
}

async function change(entity: "document" | "idea" | "todo", action: "create" | "update", id: string | undefined, data: Record<string, unknown>) {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity, action, id, data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "写入失败");
  window.dispatchEvent(new Event("workspace:changed"));
  return result.result;
}

function plainText(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent ?? "";
}

export function WebMcpTools() {
  useEffect(() => {
    const context = document.modelContext;
    if (typeof context?.registerTool !== "function") return;

    const tools: WebMcpTool[] = [
      {
        name: "list_knowledge_documents",
        description: "列出本地知识工作台中的知识文档标题、摘要、标签和更新时间。可使用关键词筛选。",
        inputSchema: { type: "object", properties: { query: { type: "string", description: "可选的标题、摘要或标签关键词" } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async ({ query }) => {
          const data = await workspace();
          const keyword = String(query ?? "").toLowerCase();
          return data.documents.filter((item) => !keyword || `${item.title} ${item.aiSummary ?? ""} ${item.aiTags.join(" ")}`.toLowerCase().includes(keyword)).map(({ id, title, aiSummary, aiTags, updatedAt }) => ({ id, title, summary: aiSummary, tags: aiTags, updatedAt }));
        },
      },
      {
        name: "get_knowledge_document",
        description: "读取指定知识文档的原始正文、来源信息、AI 摘要和标签。只在用户要求分析知识时调用。",
        inputSchema: { type: "object", properties: { id: { type: "string", description: "知识文档 ID" } }, required: ["id"], additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async ({ id }) => {
          const data = await workspace();
          const item = data.documents.find((documentItem) => documentItem.id === id);
          if (!item) throw new Error("没有找到该知识文档");
          return { ...item, contentText: plainText(item.content) };
        },
      },
      {
        name: "get_selected_text",
        description: "读取用户当前在知识编辑器中选中的文字，用于解释、总结、提取问题或创建灵感。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: () => ({ selectedText: document.getSelection()?.toString().trim() ?? "" }),
      },
      {
        name: "list_ideas_and_todos",
        description: "读取灵感和 Todo 及其来源关系，用于分析知识到行动的闭环。",
        inputSchema: { type: "object", properties: { includeCompleted: { type: "boolean", description: "是否包含已完成 Todo，默认包含" } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async ({ includeCompleted }) => {
          const data = await workspace();
          return { ideas: data.ideas, todos: includeCompleted === false ? data.todos.filter((item) => item.status !== "completed") : data.todos };
        },
      },
      {
        name: "save_ai_organization",
        description: "在用户确认后，为现有知识文档或灵感保存 AI 生成的标题、摘要和标签。绝不修改用户原始正文或原始灵感。",
        inputSchema: { type: "object", properties: { entity: { type: "string", enum: ["document", "idea"] }, id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, tags: { type: "array", items: { type: "string" }, maxItems: 12 } }, required: ["entity", "id", "summary", "tags"], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute: async ({ entity, id, title, summary, tags }) => change(entity as "document" | "idea", "update", String(id), { ...(title ? { title } : {}), aiSummary: summary, aiTags: tags }),
      },
      {
        name: "create_ai_idea",
        description: "在用户确认后保存一条明确标记为“AI 新想法”的灵感，并保留来源知识和关联原文。",
        inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, sourceDocumentId: { type: "string" }, sourceQuote: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["title", "content"], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute: async ({ title, content, sourceDocumentId, sourceQuote, tags }) => change("idea", "create", undefined, { title, originalContent: content, sourceDocumentId: sourceDocumentId || null, sourceQuote: sourceQuote || null, aiTags: tags ?? [], isAiGenerated: true }),
      },
      {
        name: "create_linked_todo",
        description: "在用户确认后创建 Todo，可绑定来源知识、来源灵感和关联原文。",
        inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high"] }, isToday: { type: "boolean" }, sourceDocumentId: { type: "string" }, sourceIdeaId: { type: "string" }, sourceQuote: { type: "string" } }, required: ["title"], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute: async ({ title, description, priority, isToday, sourceDocumentId, sourceIdeaId, sourceQuote }) => change("todo", "create", undefined, { title, description: description ?? "", priority: priority ?? "medium", isToday: isToday ?? false, sourceType: sourceIdeaId ? "idea" : sourceDocumentId ? "knowledge" : null, sourceDocumentId: sourceDocumentId || null, sourceIdeaId: sourceIdeaId || null, sourceQuote: sourceQuote || null }),
      },
    ];

    void Promise.allSettled(tools.map((tool) => context.registerTool(tool)));
    return () => {
      if (context.unregisterTool) void Promise.allSettled(toolNames.map((name) => context.unregisterTool!(name)));
    };
  }, []);

  return null;
}

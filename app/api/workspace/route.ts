import { z } from "zod";
import {
  createDocument,
  createFolder,
  createIdea,
  createTodo,
  deleteDocument,
  deleteFolder,
  deleteIdea,
  deleteTodo,
  getWorkspaceData,
  updateDocument,
  updateFolder,
  updateIdea,
  updateTodo,
} from "@/lib/db";

export const runtime = "nodejs";

const requestSchema = z.object({
  entity: z.enum(["document", "folder", "idea", "todo"]),
  action: z.enum(["create", "update", "delete"]),
  id: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function GET() {
  return Response.json(await getWorkspaceData());
}

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const { entity, action, id, data } = payload;

    if (action !== "create" && !id) {
      return Response.json({ error: "缺少记录 ID" }, { status: 400 });
    }

    let result: unknown = null;
    if (entity === "document") {
      if (action === "create") result = await createDocument({ title: String(data.title || "未命名知识"), folderId: data.folderId ? String(data.folderId) : null });
      if (action === "update") result = await updateDocument(id!, data);
      if (action === "delete") await deleteDocument(id!);
    }
    if (entity === "folder") {
      if (action === "create") result = await createFolder({ name: String(data.name || "新建文件夹"), parentId: data.parentId ? String(data.parentId) : null });
      if (action === "update") result = await updateFolder(id!, data);
      if (action === "delete") await deleteFolder(id!);
    }
    if (entity === "idea") {
      if (action === "create") result = await createIdea({
        title: String(data.title || "未命名灵感"),
        originalContent: String(data.originalContent || ""),
        ...data,
      });
      if (action === "update") result = await updateIdea(id!, data);
      if (action === "delete") await deleteIdea(id!);
    }
    if (entity === "todo") {
      if (action === "create") result = await createTodo({ title: String(data.title || "未命名任务"), ...data });
      if (action === "update") result = await updateTodo(id!, data);
      if (action === "delete") await deleteTodo(id!);
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "保存失败，请检查输入内容。" }, { status: 400 });
  }
}

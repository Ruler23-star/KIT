import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/data-path";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "仅支持 10MB 以内的 PNG、JPG、WebP 或 GIF 图片。" }, { status: 400 });
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const uploadDir = path.join(getDataDir(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  return Response.json({ url: `/api/uploads/${fileName}` });
}

import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "@/lib/data-path";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_request: Request, context: RouteContext<"/api/uploads/[name]">) {
  const { name } = await context.params;
  const safeName = path.basename(name);
  if (safeName !== name) return new Response("Not found", { status: 404 });

  try {
    const filePath = path.join(getDataDir(), "uploads", safeName);
    const body = await fs.readFile(filePath);
    return new Response(body, {
      headers: {
        "Content-Type": contentTypes[path.extname(safeName).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

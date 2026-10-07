import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/env";

const TYPES: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };

export async function GET(_req: Request, ctx: RouteContext<"/admin/kyc/[docId]">) {
  const u = await currentUser();
  if (!u?.isAdmin || u.mustChangePassword) return new Response("Not found", { status: 404 });
  const { docId } = await ctx.params;
  const doc = await prisma.kycDocument.findUnique({ where: { id: docId } });
  if (!doc) return new Response("Not found", { status: 404 });
  const full = path.resolve(UPLOAD_DIR, doc.path);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) return new Response("Not found", { status: 404 });
  const ext = path.extname(full);
  return new Response(await readFile(full), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files are untrusted: download only, and no script execution if opened anyway.
      "Content-Disposition": `attachment; filename="${doc.id}${ext}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "no-store",
    },
  });
}

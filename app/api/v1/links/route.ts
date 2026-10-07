import { apiError, authenticate } from "@/lib/api-keys";
import { prisma } from "@/lib/db";
import { createLink, LinkInput, serializeLink } from "@/lib/links";

export async function POST(req: Request) {
  const key = await authenticate(req);
  if (key instanceof Response) return key;
  const parsed = LinkInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return Response.json(serializeLink(await createLink(key.merchantId, parsed.data)), { status: 201 });
}

export async function GET(req: Request) {
  const key = await authenticate(req);
  if (key instanceof Response) return key;
  const links = await prisma.paymentLink.findMany({ where: { merchantId: key.merchantId }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({ data: links.map(serializeLink) });
}

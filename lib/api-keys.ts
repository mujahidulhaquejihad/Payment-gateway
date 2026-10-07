import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Mode } from "@/lib/generated/prisma/client";
import { ipFrom, rateLimit } from "@/lib/rate-limit";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function newApiKey(mode: Mode) {
  const key = `sk_${mode === "LIVE" ? "live" : "test"}_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

export const apiError = (status: number, message: string) => Response.json({ error: { message } }, { status });

/** Resolves `Authorization: Bearer sk_...` to an active key + merchant, or an error Response to return as-is. */
export async function authenticate(req: Request) {
  if (!rateLimit(`api-ip:${ipFrom((n) => req.headers.get(n))}`, 300, 60_000)) return apiError(429, "Too many requests");
  const m = req.headers.get("authorization")?.match(/^Bearer (sk_(?:test|live)_[A-Za-z0-9_-]{32})$/);
  if (!m) return apiError(401, "Invalid API key");
  const key = await prisma.apiKey.findUnique({ where: { hash: hashKey(m[1]) }, include: { merchant: true } });
  if (!key || key.revokedAt || key.merchant.kycStatus === "REJECTED") return apiError(401, "Invalid API key");
  if (key.mode === "LIVE" && key.merchant.kycStatus !== "APPROVED") return apiError(401, "Invalid API key");
  if (!rateLimit(`api-key:${key.id}`, 100, 60_000)) return apiError(429, "Too many requests");
  return key;
}

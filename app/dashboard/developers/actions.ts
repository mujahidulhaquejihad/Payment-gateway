"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { newApiKey } from "@/lib/api-keys";
import { requireMerchant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAllowedWebhookUrl } from "@/lib/webhooks";

export async function createKey(_prev: { key?: string; error?: string }, formData: FormData): Promise<{ key?: string; error?: string }> {
  const m = await requireMerchant("OWNER");
  const mode = formData.get("mode") === "live" ? "LIVE" : "TEST";
  if (mode === "LIVE" && m.kycStatus !== "APPROVED") return { error: "Live keys are available after KYC approval" };
  const k = newApiKey(mode);
  await prisma.apiKey.create({ data: { merchantId: m.id, mode, prefix: k.prefix, hash: k.hash } });
  revalidatePath("/dashboard/developers");
  return { key: k.key };
}

export async function revokeKey(formData: FormData) {
  const m = await requireMerchant("OWNER");
  await prisma.apiKey.updateMany({ where: { id: String(formData.get("id")), merchantId: m.id, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/dashboard/developers");
}

export async function saveWebhook(formData: FormData) {
  const m = await requireMerchant("OWNER");
  const url = String(formData.get("webhookUrl") ?? "").trim();
  if (url && !isAllowedWebhookUrl(url)) redirect("/dashboard/developers?error=Webhook+URL+must+be+a+valid+https+URL");
  await prisma.merchant.update({ where: { id: m.id }, data: { webhookUrl: url || null } });
  revalidatePath("/dashboard/developers");
}

export async function rotateSecret() {
  const m = await requireMerchant("OWNER");
  await prisma.merchant.update({ where: { id: m.id }, data: { webhookSecret: `whsec_${randomBytes(24).toString("base64url")}` } });
  revalidatePath("/dashboard/developers");
}

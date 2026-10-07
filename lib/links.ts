import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import type { PaymentLink } from "@/lib/generated/prisma/client";
import { MAX_AMOUNT, MIN_AMOUNT } from "@/lib/money";

export const LinkInput = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  amount: z.number().int().min(MIN_AMOUNT).max(MAX_AMOUNT).nullable().optional(), // paisa; null = buyer enters amount
});

export const createLink = (merchantId: string, input: z.infer<typeof LinkInput>) =>
  prisma.paymentLink.create({
    data: { merchantId, slug: randomBytes(9).toString("base64url"), title: input.title, description: input.description || null, amount: input.amount ?? null },
  });

export const linkUrl = (slug: string) => `${appUrl()}/pay/${slug}`;

export const serializeLink = (l: PaymentLink) => ({
  id: l.id,
  url: linkUrl(l.slug),
  title: l.title,
  description: l.description,
  amount: l.amount,
  active: l.active,
  created_at: l.createdAt,
});

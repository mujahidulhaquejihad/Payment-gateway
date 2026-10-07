"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { rateLimit } from "@/lib/rate-limit";

const MAX_MEMBERS = 20;
// The OWNER role is only ever created at signup, so there is always exactly one per merchant.
const StaffRole = z.enum(["MANAGER", "VIEWER"]);

const Member = z.object({
  name: z.string().trim().min(2, "Enter their name").max(100),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  role: StaffRole,
});

type State = { error?: string; email?: string; password?: string };

export async function addMember(_prev: State, formData: FormData): Promise<State> {
  const owner = await requireUser("OWNER");
  if (!rateLimit(`team:${owner.merchantId}`, 20, 60 * 60_000)) return { error: "Too many invites, try again later" };
  const parsed = Member.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ((await prisma.user.count({ where: { merchantId: owner.merchantId } })) >= MAX_MEMBERS) return { error: `A team can have at most ${MAX_MEMBERS} people` };
  const password = randomBytes(12).toString("base64url");
  try {
    await prisma.user.create({
      data: { ...parsed.data, merchantId: owner.merchantId, passwordHash: await hashPassword(password), mustChangePassword: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That email already has an SME Pay login" };
    throw e;
  }
  revalidatePath("/dashboard/team");
  return { email: parsed.data.email, password };
}

export async function changeRole(formData: FormData) {
  const owner = await requireUser("OWNER");
  const role = StaffRole.safeParse(formData.get("role"));
  if (!role.success) return;
  await prisma.user.updateMany({ where: { id: String(formData.get("id")), merchantId: owner.merchantId, role: { not: "OWNER" } }, data: { role: role.data } });
  revalidatePath("/dashboard/team");
}

export async function removeMember(formData: FormData) {
  const owner = await requireUser("OWNER");
  // Deleting the row ends their sessions too: currentUser() no longer finds them.
  await prisma.user.deleteMany({ where: { id: String(formData.get("id")), merchantId: owner.merchantId, role: { not: "OWNER" } } });
  revalidatePath("/dashboard/team");
}

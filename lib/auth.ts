import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { NextAuthOptions, Session, User } from "next-auth";
import { getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/generated/prisma/client";
import { ipFrom, rateLimit } from "@/lib/rate-limit";
import { openSecret, verifyTotp } from "@/lib/totp";

const scryptAsync = (pw: string, salt: string, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

// v2 = scrypt N=2^15, r=8, p=1. Legacy "salt:hash" rows used Node's default N=2^14 and are upgraded on login.
const V2 = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `v2$${salt}$${(await scryptAsync(password, salt, 64, V2)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const v2 = stored.startsWith("v2$");
  const [salt, hash] = v2 ? stored.slice(3).split("$") : stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length, v2 ? V2 : {});
  return timingSafeEqual(expected, actual);
}

/** Verifies a 6-digit code and records its step, so each code works at most once. */
export async function consumeTotp(u: { id: string; totpSecret: string | null; totpLastStep: number }, code: string) {
  if (!u.totpSecret) return false;
  const step = verifyTotp(openSecret(u.totpSecret), code.replace(/\s/g, ""), u.totpLastStep);
  if (step === null) return false;
  const { count } = await prisma.user.updateMany({ where: { id: u.id, totpLastStep: { lt: step } }, data: { totpLastStep: step } });
  return count === 1;
}

// Verified against when the email is unknown, so response time does not reveal which emails have accounts.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

type Claims = { uid?: string; v?: number };

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
      async authorize(credentials, req) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const code = String(credentials?.code ?? "");
        const ip = ipFrom((n) => {
          const v = req?.headers?.[n];
          return Array.isArray(v) ? v[0] : v;
        });
        if (!email || !password || password.length > 200) return null;
        // Also caps 2-step code guesses, since every code attempt re-runs this.
        if (!rateLimit(`login-ip:${ip}`, 30, 15 * 60_000) || !rateLimit(`login-email:${email}`, 10, 15 * 60_000)) return null;
        const u = await prisma.user.findUnique({ where: { email } });
        const ok = await verifyPassword(password, u?.passwordHash ?? (await DUMMY_HASH));
        if (!u || !ok) return null;
        if (u.totpEnabled) {
          if (!code) throw new Error("OTP_REQUIRED");
          if (!(await consumeTotp(u, code))) throw new Error("OTP_INVALID");
        }
        if (!u.passwordHash.startsWith("v2$")) await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
        return { id: u.id, email: u.email, name: u.name, v: u.tokenVersion } as User;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) Object.assign(token, { uid: user.id, v: (user as Claims).v });
      return token;
    },
    session({ session, token }) {
      return Object.assign(session, { uid: token.uid, v: token.v });
    },
  },
};

/** The signed-in user with their merchant, or null if the session was revoked (token version bumped) or the user removed. */
export const currentUser = cache(async () => {
  const s = (await getServerSession(authOptions)) as (Session & Claims) | null;
  if (!s?.uid) return null;
  const u = await prisma.user.findUnique({ where: { id: s.uid }, include: { merchant: true } });
  return u && u.tokenVersion === s.v ? u : null;
});

const RANK: Record<Role, number> = { VIEWER: 0, MANAGER: 1, OWNER: 2 };
export const can = (role: Role, min: Role) => RANK[role] >= RANK[min];

export async function requireUser(min: Role = "VIEWER", { allowPasswordChange = false } = {}) {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !allowPasswordChange) redirect("/dashboard/account");
  if (!can(u.role, min)) notFound();
  return u;
}

export async function requireMerchant(min: Role = "VIEWER") {
  return (await requireUser(min)).merchant;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (!u.isAdmin) notFound();
  return u;
}

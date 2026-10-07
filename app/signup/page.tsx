import { randomBytes } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SubmitButton } from "@/app/client-ui";
import { AuthShell, btn, clientIp, ErrorNote, input, label } from "@/app/ui";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { rateLimit } from "@/lib/rate-limit";

const Form = z.object({
  businessName: z.string().trim().min(2, "Business name is required").max(100),
  ownerName: z.string().trim().min(2, "Owner name is required").max(100),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/, "Enter a valid 11-digit mobile number"),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
});

const FIELDS = [
  ["businessName", "Business or page name", "text", "organization", "Rupa Fashion House", true],
  ["ownerName", "Your name", "text", "name", "", false],
  ["phone", "Mobile number", "tel", "tel", "01XXXXXXXXX", false],
  ["email", "Email", "email", "email", "you@business.com", true],
  ["password", "Password", "password", "new-password", "At least 10 characters", true],
] as const;

async function signup(formData: FormData) {
  "use server";
  const fail = (msg: string) => redirect(`/signup?error=${encodeURIComponent(msg)}`);
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000)) fail("Too many sign-ups from this network, try again later");
  const parsed = Form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { password, ...data } = parsed.data;
  try {
    await prisma.merchant.create({
      data: {
        ...data,
        webhookSecret: `whsec_${randomBytes(24).toString("base64url")}`,
        users: { create: { email: data.email, name: data.ownerName, passwordHash: await hashPassword(password), role: "OWNER" } },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("An account with this email already exists");
    throw e;
  }
  redirect("/login?registered=1");
}

export default async function SignupPage(props: PageProps<"/signup">) {
  const { error } = await props.searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. Take test payments right away."
      footer={<>Already have an account? <Link className="font-semibold text-emerald-700 hover:underline" href="/login">Log in</Link></>}
    >
      <form action={signup} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><ErrorNote message={error} /></div>
        {FIELDS.map(([name, text, type, auto, placeholder, wide]) => (
          <div key={name} className={wide ? "sm:col-span-2" : ""}>
            <label className={label} htmlFor={name}>{text}</label>
            <input className={input} id={name} name={name} type={type} autoComplete={auto} placeholder={placeholder} required />
          </div>
        ))}
        <SubmitButton className={`${btn} w-full sm:col-span-2`}>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}

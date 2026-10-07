import Link from "next/link";
import { AuthShell, Notice } from "@/app/ui";
import LoginForm from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const { registered, signedout } = await props.searchParams;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your payments."
      footer={<>New to SME Pay? <Link className="font-semibold text-emerald-700 hover:underline" href="/signup">Create an account</Link></>}
    >
      {registered && <div className="mt-5"><Notice message="Account created. Log in to continue." /></div>}
      {signedout && <div className="mt-5"><Notice message="You've been signed out on all devices. Log in again to continue." /></div>}
      <LoginForm />
    </AuthShell>
  );
}

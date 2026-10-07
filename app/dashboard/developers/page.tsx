import { CopyButton, SubmitButton } from "@/app/client-ui";
import { btn, btnSm, card, ErrorNote, input, label, PageHeader } from "@/app/ui";
import { requireMerchant } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { revokeKey, rotateSecret, saveWebhook } from "./actions";
import KeyCreator from "./key-creator";

export default async function DevelopersPage(props: PageProps<"/dashboard/developers">) {
  const m = await requireMerchant("OWNER");
  const { error } = await props.searchParams;
  const keys = await prisma.apiKey.findMany({ where: { merchantId: m.id }, orderBy: { createdAt: "desc" } });
  const base = appUrl();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Developers" description="Connect your website or app with the REST API and webhooks." />
      <ErrorNote message={error} />

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">API keys</h2>
          <p className="text-sm text-slate-500">Keep secret keys on your server only. Test keys never move real money.</p>
        </div>
        <KeyCreator canLive={m.kycStatus === "APPROVED"} />
        {keys.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {keys.map((k) => (
              <li key={k.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${k.revokedAt ? "opacity-50" : ""}`}>
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase ${k.mode === "LIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{k.mode.toLowerCase()}</span>
                <span className="font-mono">{k.prefix}…</span>
                <span className="ml-auto text-xs text-slate-500">{k.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })}</span>
                {k.revokedAt ? (
                  <span className="text-xs text-slate-400">Revoked</span>
                ) : (
                  <form action={revokeKey}>
                    <input type="hidden" name="id" value={k.id} />
                    <SubmitButton className={`${btnSm} text-rose-600`}>Revoke</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-4`}>
        <div>
          <h2 className="font-semibold">Webhooks</h2>
          <p className="text-sm text-slate-500">We POST payment.succeeded, payment.failed, payment.refunded and payment.updated to your endpoint.</p>
        </div>
        <form action={saveWebhook}>
          <label className={label} htmlFor="webhookUrl">Endpoint URL</label>
          <div className="flex gap-2">
            <input className={input} id="webhookUrl" name="webhookUrl" type="url" defaultValue={m.webhookUrl ?? ""} placeholder="https://example.com/webhooks/smepay" />
            <SubmitButton className={btn}>Save</SubmitButton>
          </div>
        </form>
        <div>
          <p className={label}>Signing secret</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">{m.webhookSecret.slice(0, 10)}••••••••••••</code>
            <CopyButton text={m.webhookSecret} />
            <form action={rotateSecret}>
              <SubmitButton className={btnSm}>Rotate</SubmitButton>
            </form>
          </div>
        </div>
        <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          Verify the <code className="font-semibold">X-SmePay-Signature: t=…,v1=…</code> header: compute HMAC-SHA256 of <code className="font-semibold">{"`${t}.${rawBody}`"}</code> with your secret, compare it to <code className="font-semibold">v1</code>, and reject if <code className="font-semibold">t</code> is older than 5 minutes.
        </p>
      </section>

      <section className={`${card} space-y-3`}>
        <div>
          <h2 className="font-semibold">Quick start</h2>
          <p className="text-sm text-slate-500">Amounts are in paisa (৳100.00 = 10000). Send the buyer to <code>checkout_url</code>.</p>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{`curl -X POST ${base}/api/v1/payments \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Idempotency-Key: order-1001" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 150000, "description": "Order #1001", "redirect_url": "https://shop.example/thanks"}'

curl -X POST ${base}/api/v1/payments/<id>/refund \\
  -H "Authorization: Bearer sk_test_..." -H "Content-Type: application/json" -d '{"amount": 50000}'

curl ${base}/api/v1/payments?limit=20 -H "Authorization: Bearer sk_test_..."
curl -X POST ${base}/api/v1/links -H "Authorization: Bearer sk_test_..." \\
  -H "Content-Type: application/json" -d '{"title": "Tuition fee", "amount": 300000}'`}</pre>
      </section>
    </div>
  );
}

import { timingSafeEqual } from "node:crypto";
import { expireStalePayments } from "@/lib/payments";
import { runSettlement } from "@/lib/settlement";
import { notifyMerchant, retryFailedWebhooks } from "@/lib/webhooks";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return secret.length >= 32 && given.length === expected.length && timingSafeEqual(given, expected);
}

/** Run daily shortly after midnight Asia/Dhaka, e.g. `curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/settle` */
export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  // Recover payments whose provider callback never arrived, and expire abandoned ones.
  const changed = await expireStalePayments();
  for (const id of changed) await notifyMerchant(id, "payment.updated");

  const settlement = await runSettlement();
  const webhooksRetried = await retryFailedWebhooks();
  return Response.json({ synced: changed.length, settlementsCreated: settlement.created.length, periodEnd: settlement.periodEnd, webhooksRetried });
}

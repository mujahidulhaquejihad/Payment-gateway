import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";

export type Entry = { account: string; debit?: number; credit?: number; memo?: string };

export const acct = {
  providerReceivable: "provider_receivable",
  feeRevenue: "fee_revenue",
  settlementPaid: "settlement_paid",
  merchantPayable: (merchantId: string) => `merchant_payable:${merchantId}`,
};

export function assertBalanced(entries: Entry[]): void {
  let dr = 0;
  let cr = 0;
  for (const e of entries) {
    const d = e.debit ?? 0;
    const c = e.credit ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) throw new Error("Ledger amounts must be non-negative integers");
    dr += d;
    cr += c;
  }
  if (dr !== cr || dr === 0) throw new Error(`Unbalanced ledger posting: debit ${dr} != credit ${cr}`);
}

/** Serialises balance-changing work (refunds, settlement) per merchant for the rest of the transaction. */
export async function lockMerchant(tx: Prisma.TransactionClient, merchantId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Merchant" WHERE "id" = ${merchantId} FOR UPDATE`;
}

/** Merchant money we hold that is not already promised to a pending payout. Call after lockMerchant. */
export async function availableBalance(tx: Prisma.TransactionClient, merchantId: string): Promise<number> {
  const l = await tx.ledgerEntry.aggregate({ where: { account: acct.merchantPayable(merchantId) }, _sum: { credit: true, debit: true } });
  const s = await tx.settlement.aggregate({ where: { merchantId, status: "PENDING" }, _sum: { net: true } });
  return (l._sum.credit ?? 0) - (l._sum.debit ?? 0) - (s._sum.net ?? 0);
}

/** Posts one balanced transaction. Call inside the same Prisma transaction as the state change it records. */
export async function post(tx: Prisma.TransactionClient, entries: Entry[], paymentId?: string): Promise<void> {
  assertBalanced(entries);
  const txId = randomUUID();
  const rows = entries.filter((e) => (e.debit ?? 0) + (e.credit ?? 0) > 0);
  await tx.ledgerEntry.createMany({
    data: rows.map((e) => ({ txId, account: e.account, debit: e.debit ?? 0, credit: e.credit ?? 0, memo: e.memo, paymentId })),
  });
}

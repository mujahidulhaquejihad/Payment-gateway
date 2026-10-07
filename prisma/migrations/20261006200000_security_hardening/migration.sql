-- Admin is a DB flag, never derived from a self-registered email.
ALTER TABLE "Merchant" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Payout destination is frozen on each settlement.
ALTER TABLE "Settlement" ADD COLUMN "payoutMethod" TEXT, ADD COLUMN "payoutAccount" TEXT;
UPDATE "Settlement" s SET "payoutMethod" = COALESCE(m."payoutMethod", 'unknown'), "payoutAccount" = COALESCE(m."payoutAccount", 'unknown')
FROM "Merchant" m WHERE m."id" = s."merchantId";
ALTER TABLE "Settlement" ALTER COLUMN "payoutMethod" SET NOT NULL, ALTER COLUMN "payoutAccount" SET NOT NULL;

-- Idempotency keys are scoped per mode so a test key can never resolve a live payment.
DROP INDEX "Payment_merchantId_idempotencyKey_key";
CREATE UNIQUE INDEX "Payment_merchantId_mode_idempotencyKey_key" ON "Payment"("merchantId", "mode", "idempotencyKey");

-- Money invariants enforced by the database, independent of application code.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_check"
  CHECK ("amount" > 0 AND "fee" >= 0 AND "fee" <= "amount" AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_bps_check" CHECK ("mfsBps" BETWEEN 0 AND 1000 AND "cardBps" BETWEEN 0 AND 1000);
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_net_check" CHECK ("net" > 0 AND "net" = "gross" - "fees" - "refunds");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_one_side_check"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" > 0) <> ("credit" > 0));

-- Ledger is append-only: corrections are new reversing entries.
CREATE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update_delete BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON "LedgerEntry" FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();

-- Every ledger transaction must balance at commit time.
CREATE FUNCTION ledger_balanced() RETURNS trigger AS $$
BEGIN
  IF (SELECT SUM("debit") - SUM("credit") FROM "LedgerEntry" WHERE "txId" = NEW."txId") <> 0 THEN
    RAISE EXCEPTION 'Unbalanced ledger transaction %', NEW."txId";
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_balanced();

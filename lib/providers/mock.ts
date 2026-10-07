import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/env";
import type { ProviderId } from "@/lib/money";
import type { PaymentProvider, StatusResult } from "./types";

// ponytail: simulator state lives in process memory, so pending mock payments are lost on restart
// and it only works on a single instance. Fine for a sandbox; real providers replace it.
const g = globalThis as unknown as { __mockGateway?: Map<string, StatusResult & { amount: number; reference: string }> };
export const mockState = (g.__mockGateway ??= new Map());

function mockProvider(id: ProviderId, label: string, kind: "mfs" | "card"): PaymentProvider {
  return {
    id,
    label,
    kind,
    sandboxHint: "Simulated gateway: you choose success or failure",
    enabled: () => process.env.ENABLE_MOCK_PROVIDERS === "true",
    sandbox: () => true,

    async createPayment({ paymentId, amount }) {
      const ref = `mock_${randomUUID()}`;
      mockState.set(ref, { status: "PENDING", amount, reference: paymentId, currency: "BDT" });
      return { redirectUrl: `${appUrl()}/mock-gateway/${ref}`, providerRef: ref };
    },

    verifyCallback(params) {
      const ref = params.get("ref");
      const status = params.get("status") ?? "";
      if (!ref) return null;
      const failed = status !== "success";
      return { providerRef: ref, eventId: `${ref}:${failed ? "failed" : "success"}`, failed };
    },

    async queryStatus(ref) {
      const s = mockState.get(ref);
      return s ? { ...s, trxId: s.status === "SUCCEEDED" ? `MOCK${ref.slice(-8).toUpperCase()}` : undefined } : { status: "PENDING" };
    },

    async refund() {
      return { refundRef: `mock_rf_${randomUUID()}` };
    },
  };
}

export const card = mockProvider("card", "Visa / Mastercard", "card");
export const rocket = mockProvider("rocket", "Rocket", "mfs");
export const upay = mockProvider("upay", "Upay", "mfs");

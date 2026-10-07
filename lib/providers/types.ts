import type { ProviderId } from "@/lib/money";

export type CreateInput = {
  paymentId: string;
  amount: number; // paisa
  callbackUrl: string;
  clientIp: string;
  customerPhone?: string | null;
};

export type CallbackResult = {
  providerRef: string;
  eventId: string;
  /** Buyer-side signal that the payment was cancelled or failed. Never trusted for success. */
  failed: boolean;
};

/** `reference` is our payment id as echoed back by the provider, when it reports one. */
export type StatusResult = { status: "SUCCEEDED" | "FAILED" | "PENDING"; amount?: number; currency?: string; reference?: string; trxId?: string };

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  kind: "mfs" | "card";
  sandboxHint?: string;
  enabled(): boolean;
  /** True when no real money moves (simulator or provider sandbox). */
  sandbox(): boolean;
  createPayment(input: CreateInput): Promise<{ redirectUrl: string; providerRef: string }>;
  verifyCallback(params: URLSearchParams): CallbackResult | null;
  queryStatus(providerRef: string): Promise<StatusResult>;
  refund(input: { providerRef: string; trxId: string | null; amount: number }): Promise<{ refundRef: string }>;
}

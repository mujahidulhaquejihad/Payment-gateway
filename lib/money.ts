export const MFS_PROVIDERS = ["bkash", "nagad", "rocket", "upay"] as const;
export const CARD_PROVIDERS = ["card"] as const;
export type ProviderId = (typeof MFS_PROVIDERS)[number] | (typeof CARD_PROVIDERS)[number];

/** "123.45" | 123.45 -> 12345 paisa. Returns null for invalid / more than 2 decimals. */
export function toPaisa(input: string | number): number | null {
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [taka, frac = ""] = s.split(".");
  return Number(taka) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatBDT(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  return `${sign}৳${Math.floor(abs / 100).toLocaleString("en-IN")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Plain decimal string for provider APIs and CSV: 12345 -> "123.45" */
export function paisaToDecimal(paisa: number): string {
  return `${Math.floor(paisa / 100)}.${String(paisa % 100).padStart(2, "0")}`;
}

/** MDR fee in paisa, rounded half-up. bps: 185 = 1.85% */
export function calcFee(amount: number, bps: number): number {
  return Math.floor((amount * bps + 5000) / 10000);
}

export function feeBpsFor(provider: string, plan: { mfsBps: number; cardBps: number }): number {
  return provider === "card" ? plan.cardBps : plan.mfsBps;
}

export const MIN_AMOUNT = 1000; // 10 BDT
export const MAX_AMOUNT = 50_000_000; // 5 lakh BDT

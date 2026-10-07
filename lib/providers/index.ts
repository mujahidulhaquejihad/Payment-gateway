import type { Mode } from "@/lib/generated/prisma/client";
import { bkash } from "./bkash";
import { card, rocket, upay } from "./mock";
import { nagad } from "./nagad";
import type { PaymentProvider } from "./types";

const all: PaymentProvider[] = [bkash, nagad, rocket, upay, card];

/** TEST payments never touch real money; LIVE payments never settle sandbox money (dev excepted, for demos). */
export const isProviderAllowed = (sandbox: boolean, mode: Mode, production = process.env.NODE_ENV === "production") =>
  mode === "TEST" ? sandbox : !sandbox || !production;

export const getProvider = (id: string) => all.find((p) => p.id === id && p.enabled());
export const providersFor = (mode: Mode) => all.filter((p) => p.enabled() && isProviderAllowed(p.sandbox(), mode));

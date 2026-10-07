import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// RFC 6238 TOTP (SHA-1, 6 digits, 30s steps) — what every authenticator app speaks.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) out += B32[(val >>> (bits -= 5)) & 31];
  }
  return bits ? out + B32[(val << (5 - bits)) & 31] : out;
}

export function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1e6).padStart(6, "0");
}

/** Returns the matched step (±1 for clock drift) if newer than lastStep, else null. */
export function verifyTotp(key: Buffer, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) {
    if (s > lastStep && timingSafeEqual(Buffer.from(hotp(key, s)), Buffer.from(code))) return s;
  }
  return null;
}

export const newTotpKey = () => randomBytes(20);

export const otpauthUri = (email: string, key: Buffer) =>
  `otpauth://totp/${encodeURIComponent(`SME Pay:${email}`)}?secret=${base32(key)}&issuer=SME%20Pay`;

// Secrets are encrypted at rest with a key derived from NEXTAUTH_SECRET; rotating that secret disables everyone's 2-step login.
function sealKey() {
  const s = process.env.NEXTAUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("NEXTAUTH_SECRET must be at least 32 characters");
  return Buffer.from(hkdfSync("sha256", s, "", "smepay-totp-secret", 32));
}

export function sealSecret(raw: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  const ct = Buffer.concat([c.update(raw), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string): Buffer {
  const [iv, tag, ct] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", sealKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

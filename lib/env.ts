import path from "node:path";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export function appUrl(): string {
  const url = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Callback and checkout URLs built from this must never be sent over plain http in production.
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) throw new Error("APP_URL must be https in production");
  return url;
}
